#include "config_store.h"
#include "sync_codec.h"

static constexpr const char* PATH = "/config.json";

void loadConfigFromSd(Storage& storage, Carousel& carousel, int& version) {
  std::string text;
  for (const auto& line : storage.readLines(PATH)) text += line + "\n";
  CarouselConfig config = configToCarousel(text);
  version = config.version;  // 0 when missing or unparseable: the next sync pulls a fresh one
  if (config.ok) carousel.load(std::move(config.folders), std::move(config.activities));
}

void saveConfigToSd(Storage& storage, const std::string& json) {
  storage.write(PATH, json);
}
