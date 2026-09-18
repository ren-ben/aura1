#include "config_store.h"
#include <ArduinoJson.h>
#include "time_util.h"

static constexpr const char* PATH = "/config.json";

void loadConfigFromSd(Storage& storage, Carousel& carousel, int& version) {
  version = 0;
  std::string text;
  for (const auto& line : storage.readLines(PATH)) text += line + "\n";
  JsonDocument doc;
  if (deserializeJson(doc, text)) return;

  std::vector<FolderEntry> folders;
  for (JsonObject f : doc["folders"].as<JsonArray>()) {
    folders.push_back({ f["id"].as<int>(), f["name"].as<std::string>() });
  }
  std::vector<ActivityEntry> activities;
  for (JsonObject a : doc["activities"].as<JsonArray>()) {
    uint64_t lastUsedAt = 0;  // stays 0 for null
    fromIso8601(a["lastUsedAt"] | "", lastUsedAt);
    activities.push_back({ a["id"].as<int>(), a["folderId"].as<int>(),
                           a["name"].as<std::string>(), lastUsedAt });
  }
  carousel.load(std::move(folders), std::move(activities));
  version = doc["version"].as<int>();
}

void saveConfigToSd(Storage& storage, const std::string& json) {
  storage.write(PATH, json);
}
