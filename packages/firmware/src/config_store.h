#pragma once
#include "carousel.h"
#include "ports.h"

// Reads /config.json into the carousel. On a missing or unparseable file it
// loads nothing and leaves version at 0, so the next sync pulls a fresh config.
void loadConfigFromSd(Storage& storage, Carousel& carousel, int& version);
void saveConfigToSd(Storage& storage, const std::string& json);
