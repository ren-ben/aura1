#include "sync_client.h"
#include <algorithm>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <bootloader_random.h>
#include "cloudflare_roots.h"
#include "config_store.h"
#include "secrets.h"
#include "sync_codec.h"

constexpr unsigned long HANDSHAKE_TIMEOUT_S = 20;  // library default is 120 s

// Radio up, one POST, radio down. Every path ends with the radio off and the
// bootloader entropy source back on: it conflicts with Wi-Fi, and outside sync
// it keeps esp_random() truly random for session uuids.
void SyncClient::start(unsigned long connectTimeoutMs) {
  if (busy_) return;
  bootloader_random_disable();
  WiFi.persistent(false);       // nothing to flash: the credentials are compiled in
  WiFi.setHostname(DEVICE_ID);  // shows as "aura-1" on the hotspot, not "esp32s3"
  WiFi.mode(WIFI_STA);
  // Scan every channel and take the strongest match, not the first heard:
  // a phone hotspot is often late to answer the first probe.
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  busy_ = true;
  startedAt_ = millis();
  timeout_ = connectTimeoutMs;
}

void SyncClient::radioOff() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  bootloader_random_enable();
  busy_ = false;
}

void SyncClient::abort() {
  if (busy_) radioOff();
}

bool SyncClient::poll(int& configVersion, Carousel& carousel, bool setClock, SyncOutcome& result) {
  if (!busy_) return false;
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - startedAt_ < timeout_) return false;
    // Diagnostics only: never a header, the service token, or the Wi-Fi
    // credentials, only the outcome of this attempt.
    Serial.printf("sync failed: no wifi (status %d)\n", WiFi.status());
    radioOff();
    result = SyncOutcome::NoWifi;
    return true;
  }
  result = post(configVersion, carousel, setClock);
  radioOff();
  return true;
}

SyncOutcome SyncClient::post(int& configVersion, Carousel& carousel, bool setClock) {
  // Built now, not at start: a session sealed while joining goes too. The
  // pending list and the JSON document both die inside this expression,
  // before TLS needs the heap.
  const auto pending = queue_.pending();
  const std::string body = buildRequest(DEVICE_ID, configVersion, pending, daily_.ticks());
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
  // Never set the RTC from an unparseable time: every later session would carry it.
  if (result.hasServerTime && setClock) clock_.setEpochSeconds(result.serverTime);
  if (result.hasConfig) {
    saveConfigToSd(storage_, result.config);
    loadConfigFromSd(storage_, carousel, configVersion);
  }
  // The server applied the ticks sent with this request; its fresh bundle
  // replaces the local one and clears them.
  if (result.hasToday) daily_.replace(result.today);
  Serial.printf("sync ok: sent %u, settled %u, config %s, rtc %s\n",
                (unsigned)std::min(pending.size(), MAX_SYNC_EVENTS),
                (unsigned)result.settled.size(), result.hasConfig ? "yes" : "no",
                result.hasServerTime && setClock ? "yes" : "no");
  return SyncOutcome::Ok;
}
