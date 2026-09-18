#include "sync_client.h"
#include <algorithm>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <bootloader_random.h>
#include "config_store.h"
#include "secrets.h"
#include "time_util.h"

// The server's syncRequestSchema caps events at 200. More would 400 on every
// attempt, forever. The append-only queue copes with a partial drain.
constexpr size_t MAX_EVENTS = 200;
constexpr unsigned long CONNECT_TIMEOUT_MS = 15000;

// Mozilla root store, embedded by board_build.embed_files. objcopy names the
// symbol after the path relative to the project root.
extern const uint8_t x509_crt_bundle_start[] asm("_binary_data_cert_x509_crt_bundle_bin_start");

// Radio up, one POST, radio down. Every path ends with the radio off and the
// bootloader entropy source back on: it conflicts with Wi-Fi, and outside sync
// it keeps esp_random() truly random for session uuids.
static bool post(const String& body, String& response) {
  bootloader_random_disable();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < CONNECT_TIMEOUT_MS) delay(100);

  int code = -1;
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    // Verify the server against the Mozilla roots. Never setInsecure(): the
    // CF Access secret is the API's only credential and the device syncs over
    // untrusted hotspots. No pinning: Cloudflare rotates its edge CAs.
    client.setCACertBundle(x509_crt_bundle_start);
    HTTPClient http;
    http.begin(client, SYNC_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("CF-Access-Client-Id", CF_ACCESS_ID);
    http.addHeader("CF-Access-Client-Secret", CF_ACCESS_SECRET);
    code = http.POST(body);
    if (code == 200) response = http.getString();
    http.end();
  }

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  bootloader_random_enable();
  return code == 200;
}

bool SyncClient::run(int& configVersion, Carousel& carousel) {
  // The queue stores epoch seconds; the server wants ISO 8601 strings, so the
  // body is built field by field rather than from EventQueue::serialise.
  JsonDocument request;
  request["deviceId"] = DEVICE_ID;
  request["configVersion"] = configVersion;
  JsonArray events = request["events"].to<JsonArray>();
  const std::vector<QueuedEvent> pending = queue_.pending();
  const size_t count = std::min(pending.size(), MAX_EVENTS);
  for (size_t i = 0; i < count; ++i) {
    const QueuedEvent& e = pending[i];
    JsonObject event = events.add<JsonObject>();
    event["uuid"] = e.uuid;
    event["activityId"] = e.activityId;
    event["startedAt"] = toIso8601(e.startedAt);
    event["endedAt"] = toIso8601(e.endedAt);
    event["clockSynced"] = e.clockSynced;
  }
  String body;
  serializeJson(request, body);

  String text;
  if (!post(body, text)) return false;
  JsonDocument response;
  if (deserializeJson(response, text)) return false;

  // acked and rejected are both permanently decided: both leave the queue.
  std::vector<std::string> settled;
  for (JsonVariant uuid : response["acked"].as<JsonArray>()) settled.push_back(uuid.as<std::string>());
  for (JsonVariant uuid : response["rejected"].as<JsonArray>()) settled.push_back(uuid.as<std::string>());
  queue_.prune(settled);

  // Never set the RTC from an unparseable time: every later session would carry it.
  uint64_t serverTime = 0;
  if (fromIso8601(response["serverTime"] | "", serverTime)) clock_.setEpochSeconds(serverTime);

  if (response["config"].is<JsonObject>()) {
    std::string config;
    serializeJson(response["config"], config);
    saveConfigToSd(storage_, config);
    loadConfigFromSd(storage_, carousel, configVersion);
  }
  return true;
}
