#include "sync_client.h"
#include <algorithm>
#include <cstdio>
#include <vector>
#include <SD_MMC.h>
#include <WiFi.h>
#include <bootloader_random.h>
#include "cloudflare_roots.h"
#include "config_store.h"
#include "secrets.h"
#include "sync_codec.h"

constexpr unsigned long HANDSHAKE_TIMEOUT_S = 20;  // library default is 120 s

// Radio up, one POST, radio down. Every path ends with the radio off and the
// bootloader entropy source back on: it conflicts with Wi-Fi, and outside sync
// it keeps esp_random() truly random for session uuids.
void SyncClient::start(unsigned long connectTimeoutMs, bool forceScan) {
  if (busy_) return;
  bootloader_random_disable();
  WiFi.persistent(false);       // nothing to flash: the credentials are compiled in
  WiFi.setHostname(DEVICE_ID);  // shows as "aura-1" on the hotspot, not "esp32s3"
  WiFi.mode(WIFI_STA);
  busy_ = true;
  startedAt_ = millis();
  timeout_ = connectTimeoutMs;
  // Straight to the hotspot joined last: no scan, joined in about a second.
  const auto saved = forceScan ? std::vector<std::string>{} : storage_.readLines(WIFI_FILE);
  uint8_t bssid[6];
  int channel = 0;
  if (!saved.empty() && std::sscanf(saved[0].c_str(), "%d %2hhx%2hhx%2hhx%2hhx%2hhx%2hhx", &channel,
                                    &bssid[0], &bssid[1], &bssid[2], &bssid[3], &bssid[4], &bssid[5]) == 7) {
    direct_ = true;
    WiFi.setScanMethod(WIFI_FAST_SCAN);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, channel, bssid);
  } else {
    joinByScan();
  }
}

// Scan every channel and take the strongest match, not the first heard: a
// phone hotspot is often late to answer the first probe.
void SyncClient::joinByScan() {
  direct_ = false;
  scanAt_ = millis();
  missingAt_ = 0;
  // The scan gets a whole budget of its own: it begins where the direct join
  // gave up, and a phone hotspot can be slow to answer a first probe.
  startedAt_ = scanAt_;
  WiFi.disconnect();
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void SyncClient::radioOff() {
  if (connected_) { http_.end(); tls_.stop(); }
  connected_ = false;
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  bootloader_random_enable();
  busy_ = false;
}

void SyncClient::abort() {
  if (fetching_) {
    stop_ = true;
    const unsigned long from = millis();
    while (fetching_ && millis() - from < 20000) delay(20);
  }
  if (busy_ && !fetching_) radioOff();
}

bool SyncClient::poll(int& configVersion, Carousel& carousel, bool setClock, SyncOutcome& result) {
  if (!busy_ || connected_) return false;
  const wl_status_t status = WiFi.status();
  if (status != WL_CONNECTED) {
    // The hotspot moved channel, or another phone: scan after all.
    if (direct_ && millis() - startedAt_ >= DIRECT_MS) { joinByScan(); return false; }
    // A whole scan without the hotspot in it: offline, no point waiting.
    // The status has to say so without interruption: it reads NO_SSID_AVAIL
    // for a moment between probes even when the hotspot is there.
    if (status != WL_NO_SSID_AVAIL) missingAt_ = 0;
    else if (!missingAt_) missingAt_ = millis();
    const bool notThere = !direct_ && missingAt_ && millis() - missingAt_ >= NOT_THERE_MS;
    if (!notThere && millis() - startedAt_ < timeout_) return false;
    // Diagnostics only: never a header, the service token, or the Wi-Fi
    // credentials, only the outcome of this attempt.
    Serial.printf("sync failed: no wifi (status %d)\n", WiFi.status());
    // Forget where the hotspot was: it has moved, or it is another one, and
    // the remembered channel would only cost the next try its first 4 s.
    storage_.write(WIFI_FILE, "");
    radioOff();
    result = SyncOutcome::NoWifi;
    return true;
  }
  // Remember where the hotspot was, for a direct join next time.
  char where[40];
  const uint8_t* b = WiFi.BSSID();
  std::snprintf(where, sizeof where, "%d %02x%02x%02x%02x%02x%02x", WiFi.channel(), b[0], b[1], b[2], b[3], b[4], b[5]);
  const auto saved = storage_.readLines(WIFI_FILE);
  if (saved.empty() || saved[0] != where) storage_.write(WIFI_FILE, std::string(where) + "\n");
  result = post(configVersion, carousel, setClock);
  // Up for the books that are still to come; fetch() says whether there are any.
  if (result == SyncOutcome::Ok) connected_ = true;
  else radioOff();
  return true;
}

void SyncClient::fetch(const std::vector<Fetch>& plan, int urgent) {
  if (!connected_) return;
  if (!lock_) {
    lock_ = xSemaphoreCreateMutex();
    news_ = xQueueCreate(8, sizeof(FetchProgress));
  }
  xSemaphoreTake(lock_, portMAX_DELAY);
  plan_ = plan;
  urgent_ = urgent;
  next_ = 0;
  xSemaphoreGive(lock_);
  // Already under way: the task takes the new order with its next piece.
  if (fetching_) return;
  if (plan.empty()) { radioOff(); return; }
  tls_.setCACert(CLOUDFLARE_ROOTS);
  tls_.setHandshakeTimeout(HANDSHAKE_TIMEOUT_S);
  http_.setReuse(true);
  fetchFrom_ = millis();
  stop_ = false;
  fetching_ = true;
  // Core 0, with the radio: the loop and the buttons keep core 1 to themselves.
  if (xTaskCreatePinnedToCore(run, "fetch", 16384, this, 1, nullptr, 0) != pdPASS) {
    fetching_ = false;
    radioOff();
  }
}

void SyncClient::run(void* self) {
  auto* client = static_cast<SyncClient*>(self);
  FetchProgress progress;
  bool more = true;
  while (more) {
    bool tell = false;
    more = client->step(progress, tell);
    if (tell) xQueueSend(client->news_, &progress, pdMS_TO_TICKS(2000));
  }
  client->radioOff();
  // Last: busy() holds until the radio is down, so no sync starts under it.
  client->fetching_ = false;
  vTaskDelete(nullptr);
}

bool SyncClient::news(FetchProgress& progress) {
  return news_ && xQueueReceive(news_, &progress, 0) == pdTRUE;
}

bool SyncClient::step(FetchProgress& progress, bool& tell) {
  tell = false;
  progress = FetchProgress{};
  if (stop_) return false;
  if (WiFi.status() != WL_CONNECTED) {
    progress.failed = progress.offline = true;
    tell = true;
    return false;
  }
  // What comes next, read under the lock: the loop may reorder it meanwhile.
  xSemaphoreTake(lock_, portMAX_DELAY);
  // Nobody is waiting on the rest of the shelf: it gets a while each sync.
  if (plan_.empty() || (plan_[0].id != urgent_ && millis() - fetchFrom_ > BACKGROUND_FETCH_MS)) {
    plan_.clear();
    xSemaphoreGive(lock_);
    return false;
  }
  Fetch book = plan_[0];
  int next = next_;
  xSemaphoreGive(lock_);

  const std::string id = std::to_string(book.id);
  progress.id = book.id;
  const auto failed = [&]() {
    Serial.printf("fetch failed: book %d, chapter %d\n", book.id, next);
    progress.failed = true;
    tell = true;
    return false;
  };
  // Moves the shared order on, if it is still this book at the front.
  const auto advance = [&](bool whole) {
    xSemaphoreTake(lock_, portMAX_DELAY);
    if (!plan_.empty() && plan_[0].id == book.id) {
      if (whole) { plan_.erase(plan_.begin()); next_ = 0; }
      else next_ = next;
    }
    const bool more = !plan_.empty();
    xSemaphoreGive(lock_);
    return more;
  };

  // The head first: the name, the chapters, where it was left.
  if (!storage_.exists(Book::headPath(book.id))) {
    if (!download("/books/" + id, Book::headPath(book.id))) return failed();
    next = 0;
  }
  const auto head = storage_.readLines(Book::headPath(book.id));
  if (!head.empty()) book.chapters = std::atoi(head[0].c_str());
  while (next < book.chapters && storage_.exists(Book::partPath(book.id, next))) ++next;
  progress.total = book.chapters;
  tell = true;
  if (next >= book.chapters) {
    storage_.write(Book::donePath(book.id), "");
    Serial.printf("fetched book %d whole, %d chapters\n", book.id, book.chapters);
    progress.done = book.chapters;
    progress.whole = true;
    return advance(true);
  }
  if (!download("/books/" + id + "/chapters/" + std::to_string(next), Book::partPath(book.id, next))) return failed();
  progress.done = ++next;
  return advance(false);
}

bool SyncClient::download(const std::string& path, const std::string& file) {
  // Under the sync endpoint: the one path Cloudflare Access opens to the
  // device's service token.
  const std::string url = std::string(SYNC_URL) + path;
  http_.begin(tls_, url.c_str());
  http_.addHeader("CF-Access-Client-Id", CF_ACCESS_ID);
  http_.addHeader("CF-Access-Client-Secret", CF_ACCESS_SECRET);
  const int code = http_.GET();
  bool ok = false;
  if (code == 200) {
    SD_MMC.mkdir("/books");
    SD_MMC.mkdir(file.substr(0, file.rfind('/')).c_str());
    File out = SD_MMC.open(file.c_str(), FILE_WRITE);
    if (out) {
      const int want = http_.getSize();
      const int wrote = http_.writeToStream(&out);
      out.close();
      ok = wrote >= 0 && (want < 0 || wrote == want);
    }
    if (!ok) SD_MMC.remove(file.c_str());
  } else {
    Serial.printf("fetch: http %d\n", code);
  }
  http_.end();
  return ok;
}

SyncOutcome SyncClient::post(int& configVersion, Carousel& carousel, bool setClock) {
  // Built now, not at start: a session sealed while joining goes too. The
  // pending list and the JSON document both die inside this expression,
  // before TLS needs the heap.
  const auto pending = queue_.pending();
  const std::string body = buildRequest(DEVICE_ID, configVersion, pending, daily_.ticks(), daily_.hash(),
                                       &status_, readings_);
  if (body.empty()) return SyncOutcome::Failed;

  WiFiClientSecure client;
  // Verify against the roots of Cloudflare's edge CAs. Never setInsecure():
  // the CF Access secret is the API's only credential and the device syncs
  // over untrusted hotspots.
  client.setCACert(CLOUDFLARE_ROOTS);
  client.setHandshakeTimeout(HANDSHAKE_TIMEOUT_S);
  HTTPClient http;
  http.begin(client, SYNC_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("CF-Access-Client-Id", CF_ACCESS_ID);
  http.addHeader("CF-Access-Client-Secret", CF_ACCESS_SECRET);
  const int httpCode = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(body.data())), body.size());
  String text;
  if (httpCode == 200) text = http.getString();
  http.end();
  if (httpCode != 200) {
    if (httpCode < 0) Serial.printf("sync failed: connect/TLS error (code %d)\n", httpCode);
    else Serial.printf("sync failed: http %d\n", httpCode);
    return SyncOutcome::Failed;
  }

  const SyncResult result = parseResponse(std::string(text.c_str(), text.length()));
  if (!result.ok) {
    Serial.println("sync failed: could not parse response");
    return SyncOutcome::Failed;
  }

  queue_.prune(result.settled);
  look_ = result.look;
  // The places and the marks went with the request: the card can forget them.
  tookReadings_ = !readings_.empty();
  if (result.hasShelf) shelf_ = result.shelf;
  // Never set the RTC from an unparseable time: every later session would carry it.
  if (result.hasServerTime && setClock) clock_.setEpochSeconds(result.serverTime);
  if (result.hasConfig) {
    saveConfigToSd(storage_, result.config);
    loadConfigFromSd(storage_, carousel, configVersion);
  }
  // The server applied the ticks sent with this request; its fresh bundle
  // replaces the local one and clears them. No bundle: it matched ours.
  if (result.hasToday) daily_.replace(result.today, result.todayHash);
  else daily_.clearTicks();
  Serial.printf("sync ok: sent %u, settled %u, config %s, today %s, rtc %s\n",
                (unsigned)std::min(pending.size(), MAX_SYNC_EVENTS),
                (unsigned)result.settled.size(), result.hasConfig ? "yes" : "no", result.hasToday ? "new" : "same",
                result.hasServerTime && setClock ? "yes" : "no");
  return SyncOutcome::Ok;
}
