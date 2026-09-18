#include "sync_codec.h"
#include <algorithm>
#include <ArduinoJson.h>
#include "time_util.h"

std::string buildRequest(const std::string& deviceId, int configVersion,
                         const std::vector<QueuedEvent>& pending) {
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  doc["configVersion"] = configVersion;
  JsonArray events = doc["events"].to<JsonArray>();
  const size_t count = std::min(pending.size(), MAX_SYNC_EVENTS);
  for (size_t i = 0; i < count; ++i) {
    const QueuedEvent& e = pending[i];
    JsonObject event = events.add<JsonObject>();
    event["uuid"] = e.uuid;
    event["activityId"] = e.activityId;
    event["startedAt"] = toIso8601(e.startedAt);
    event["endedAt"] = toIso8601(e.endedAt);
    event["clockSynced"] = e.clockSynced;
  }
  if (doc.overflowed()) return "";
  std::string body;
  serializeJson(doc, body);
  return body;
}

// Appends every element of a uuid array; false unless it is an array of strings.
static bool appendUuids(JsonVariantConst array, std::vector<std::string>& out) {
  if (!array.is<JsonArrayConst>()) return false;
  for (JsonVariantConst uuid : array.as<JsonArrayConst>()) {
    if (!uuid.is<const char*>()) return false;
    out.push_back(uuid.as<std::string>());
  }
  return true;
}

SyncResult parseResponse(const std::string& body) {
  SyncResult result;
  JsonDocument doc;
  if (deserializeJson(doc, body) || !doc.is<JsonObjectConst>()) return result;

  // acked and rejected are both permanently decided, so both leave the queue.
  std::vector<std::string> settled;
  if (!appendUuids(doc["acked"], settled) || !appendUuids(doc["rejected"], settled)) {
    return result;
  }
  result.ok = true;
  result.settled = std::move(settled);
  result.hasServerTime = fromIso8601(doc["serverTime"] | "", result.serverTime);
  if (doc["config"].is<JsonObjectConst>()) {
    result.hasConfig = true;
    serializeJson(doc["config"], result.config);
  }
  return result;
}

CarouselConfig configToCarousel(const std::string& json) {
  CarouselConfig config;
  JsonDocument doc;
  if (deserializeJson(doc, json)) return config;

  for (JsonObjectConst f : doc["folders"].as<JsonArrayConst>()) {
    config.folders.push_back({ f["id"].as<int>(), f["name"].as<std::string>() });
  }
  for (JsonObjectConst a : doc["activities"].as<JsonArrayConst>()) {
    uint64_t lastUsedAt = 0;  // stays 0 for null
    fromIso8601(a["lastUsedAt"] | "", lastUsedAt);
    config.activities.push_back({ a["id"].as<int>(), a["folderId"].as<int>(),
                                  a["name"].as<std::string>(), lastUsedAt });
  }
  config.version = doc["version"].as<int>();
  config.ok = true;
  return config;
}
