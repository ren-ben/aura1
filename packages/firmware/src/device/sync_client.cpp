#include "sync_client.h"
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
static bool post(const std::string& body, String& response) {
  bootloader_random_disable();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < CONNECT_TIMEOUT_MS) delay(100);

  int code = -1;
  if (WiFi.status() == WL_CONNECTED) {
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
    code = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(body.data())), body.size());
    if (code == 200) response = http.getString();
    http.end();
  }

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  bootloader_random_enable();
  return code == 200;
}

bool SyncClient::run(int& configVersion, Carousel& carousel) {
  // The pending list and the JSON document both die inside this expression,
  // before the radio and TLS need the heap.
  const std::string body = buildRequest(DEVICE_ID, configVersion, queue_.pending());
  if (body.empty()) return false;

  String text;
  if (!post(body, text)) return false;
  const SyncResult result = parseResponse(std::string(text.c_str(), text.length()));
  if (!result.ok) return false;

  queue_.prune(result.settled);
  // Never set the RTC from an unparseable time: every later session would carry it.
  if (result.hasServerTime) clock_.setEpochSeconds(result.serverTime);
  if (result.hasConfig) {
    saveConfigToSd(storage_, result.config);
    loadConfigFromSd(storage_, carousel, configVersion);
  }
  return true;
}
