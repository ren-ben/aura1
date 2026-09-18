#include "config_store.h"
#include <ArduinoJson.h>
#include "device/iso_time.h"

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
    activities.push_back({ a["id"].as<int>(), a["folderId"].as<int>(),
                           a["name"].as<std::string>(),
                           epochFromIso(a["lastUsedAt"] | "") });  // null -> 0
  }
  carousel.load(std::move(folders), std::move(activities));
  version = doc["version"].as<int>();
}

void saveConfigToSd(Storage& storage, const std::string& json) {
  storage.write(PATH, json);
}
