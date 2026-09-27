#include "sync_codec.h"
#include <algorithm>
#include <ArduinoJson.h>
#include "time_util.h"
#include "validate.h"

#include <sstream>

std::string buildRequest(const std::string& deviceId, int configVersion,
                         const std::vector<QueuedEvent>& pending,
                         const std::vector<std::string>& ticks,
                         const std::string& todayHash,
                         const DeviceStatus* status,
                         const std::vector<ReadingState>& readings,
                         const std::vector<std::string>& hunt) {
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
  JsonArray tickArray = doc["ticks"].to<JsonArray>();
  for (const auto& line : ticks) {
    std::istringstream in(line);
    std::string kind, date;
    int id = 0, done = 0;
    if (!(in >> kind >> id) || id <= 0) continue;
    if (kind == "habit" && !(in >> date)) continue;
    if (!(in >> done) || (kind != "todo" && kind != "habit")) continue;
    JsonObject tick = tickArray.add<JsonObject>();
    tick["kind"] = kind;
    tick["id"] = id;
    if (kind == "habit") tick["date"] = date;
    tick["done"] = done == 1;
  }
  // The Hunt's sets and feels, as the card holds them (daily.h); a torn or
  // malformed line is left out rather than failing the whole sync.
  JsonArray sets, feels;
  if (!hunt.empty()) { sets = doc["sets"].to<JsonArray>(); feels = doc["feels"].to<JsonArray>(); }
  for (const auto& line : hunt) {
    std::istringstream in(line);
    std::string kind, uuid;
    int exerciseId = 0;
    if (!(in >> kind >> uuid >> exerciseId) || exerciseId <= 0 || !validate::isValidUuid(uuid)) continue;
    if (kind == "set") {
      uint64_t at = 0;
      int idx = 0, reps = 0;
      double load = 0;
      if (!(in >> at >> idx >> load >> reps) || sets.size() >= 400) continue;
      JsonObject s = sets.add<JsonObject>();
      s["uuid"] = uuid;
      s["exerciseId"] = exerciseId;
      s["at"] = toIso8601(at);
      s["idx"] = idx;
      s["load"] = load;
      s["reps"] = reps;
    } else if (kind == "feel") {
      std::string date, feel;
      if (!(in >> date >> feel) || date.size() != 10 || feels.size() >= 60) continue;
      if (feel != "easy" && feel != "solid" && feel != "grind") continue;
      JsonObject f = feels.add<JsonObject>();
      f["uuid"] = uuid;
      f["exerciseId"] = exerciseId;
      f["date"] = date;
      f["feel"] = feel;
    }
  }
  if (!todayHash.empty()) doc["todayHash"] = todayHash;
  if (status) {
    JsonObject s = doc["status"].to<JsonObject>();
    s["battery"] = status->battery;
    s["millivolts"] = status->millivolts;
    s["charging"] = status->charging;
    s["look"] = status->look;
    s["skin"] = status->skin;
  }
  // The server takes thirty books, and fifty passages of each, at a time.
  JsonArray read;
  if (!readings.empty()) read = doc["readings"].to<JsonArray>();
  for (size_t n = 0; n < readings.size() && n < 30; ++n) {
    const ReadingState& reading = readings[n];
    if (reading.bookId <= 0) continue;
    JsonObject r = read.add<JsonObject>();
    r["bookId"] = reading.bookId;
    r["chapterIdx"] = reading.chapterIdx;
    r["through"] = reading.through;
    JsonArray kept = r["marks"].to<JsonArray>();
    for (const auto& line : reading.marks) {
      if (kept.size() >= 50) break;
      std::istringstream in(line);
      int chapterIdx = 0, start = 0, end = 0;
      std::string body;
      if (!(in >> chapterIdx >> start >> end)) continue;
      std::getline(in, body);
      if (!body.empty() && body[0] == ' ') body.erase(0, 1);
      if (body.empty()) continue;
      JsonObject mark = kept.add<JsonObject>();
      mark["chapterIdx"] = chapterIdx;
      mark["start"] = start;
      mark["end"] = end;
      // The server keeps at most two thousand characters of a passage.
      mark["body"] = body.substr(0, 2000);
    }
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
  result.todayHash = doc["todayHash"] | "";
  result.look = doc["look"] | "";
  if (doc["books"].is<JsonArrayConst>()) {
    result.hasShelf = true;
    serializeJson(doc["books"], result.shelf);
  }
  if (doc["today"].is<JsonObjectConst>()) {
    result.hasToday = true;
    serializeJson(doc["today"], result.today);
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
