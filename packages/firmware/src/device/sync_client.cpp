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

constexpr unsigned long CONNECT_TIMEOUT_MS = 15000;
constexpr unsigned long HANDSHAKE_TIMEOUT_S = 20;  // library default is 120 s

// Radio up, one POST, radio down. Every path ends with the radio off and the
// bootloader entropy source back on: it conflicts with Wi-Fi, and outside sync
// it keeps esp_random() truly random for session uuids.
// httpCode is -1 if the request was never sent (no Wi-Fi), otherwise the
// HTTPClient result: a standard HTTP status, or one of its negative
// HTTPC_ERROR_* codes for a TLS/connect failure. wifiConnected distinguishes
// the two -1 cases for the caller's diagnostics.
static bool post(const std::string& body, String& response, int& httpCode, bool& wifiConnected,
                 bool& cancelled, bool (*cancel)()) {
  bootloader_random_disable();
  WiFi.setHostname(DEVICE_ID);  // shows as "aura-1" on the hotspot, not "esp32s3"
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long start = millis();
  cancelled = false;
  while (WiFi.status() != WL_CONNECTED && millis() - start < CONNECT_TIMEOUT_MS) {
    if ((cancelled = cancel())) break;
    delay(20);
  }

  wifiConnected = WiFi.status() == WL_CONNECTED;
  if (!cancelled) cancelled = cancel();
  httpCode = -1;
  if (wifiConnected && !cancelled) {
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
    httpCode = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(body.data())), body.size());
    if (httpCode == 200) response = http.getString();
    http.end();
  }

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  bootloader_random_enable();
  return httpCode == 200;
}

bool SyncClient::run(int& configVersion, Carousel& carousel, bool (*cancel)()) {
  // The pending list and the JSON document both die inside this expression,
  // before the radio and TLS need the heap.
  const auto pending = queue_.pending();
  const std::string body = buildRequest(DEVICE_ID, configVersion, pending, daily_.ticks());
  if (body.empty()) return false;

  String text;
  int httpCode = -1;
  bool wifiConnected = false;
  bool cancelled = false;
  if (!post(body, text, httpCode, wifiConnected, cancelled, cancel)) {
    // Diagnostics only: never a header, the service token, or the Wi-Fi
    // credentials, only the outcome of this attempt.
    if (cancelled) {
      Serial.println("sync cancelled: button pressed");
    } else if (!wifiConnected) {
      Serial.println("sync failed: no wifi");
    } else if (httpCode < 0) {
      Serial.printf("sync failed: connect/TLS error (code %d)\n", httpCode);
    } else {
      Serial.printf("sync failed: http %d\n", httpCode);
    }
    return false;
  }

  const SyncResult result = parseResponse(std::string(text.c_str(), text.length()));
  if (!result.ok) {
    Serial.println("sync failed: could not parse response");
    return false;
  }

  queue_.prune(result.settled);
  // Never set the RTC from an unparseable time: every later session would carry it.
  if (result.hasServerTime) clock_.setEpochSeconds(result.serverTime);
  if (result.hasConfig) {
    saveConfigToSd(storage_, result.config);
    loadConfigFromSd(storage_, carousel, configVersion);
  }
  // The server applied the ticks sent with this request; its fresh bundle
  // replaces the local one and clears them.
  if (result.hasToday) daily_.replace(result.today);
  Serial.printf("sync ok: http %d, sent %u, settled %u, config %s, rtc %s\n", httpCode,
                (unsigned)std::min(pending.size(), MAX_SYNC_EVENTS),
                (unsigned)result.settled.size(), result.hasConfig ? "yes" : "no",
                result.hasServerTime ? "yes" : "no");
  return true;
}
