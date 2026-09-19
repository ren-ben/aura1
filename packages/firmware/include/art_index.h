#pragma once
#include <cstdint>
#include <string>
#include <vector>

// The art pack on the SD card (baked by packages/art): /art/index.txt lists
// one scene per line, "moment id frames size [env]", and each frame is
// /art/<id>-<n>.bin, size x size 1-bit pixels in GxEPD2's bitmap layout.
// env names the place a scene is set in (the study, the void, ...).
struct ArtScene {
  std::string moment;
  std::string id;
  int frames = 0;
  int size = 0;
  std::string env;
};

std::vector<ArtScene> parseArtIndex(const std::vector<std::string>& lines);

// One of the scenes for `moment`, chosen by `roll`; nullptr when there is none.
// Scenes set in `env` come first, so going to sleep and waking up happen in
// the place already on the glass.
const ArtScene* pickScene(const std::vector<ArtScene>& scenes, const std::string& moment, uint32_t roll,
                          const std::string& env = "");

// Which moment a screen shows: a running session by its folder, a sealed one
// by how long it ran. Under MIN_SESSION_MINUTES it was a mistaken start: the
// server drops it, and he is unimpressed.
constexpr int MIN_SESSION_MINUTES = 10;
std::string sessionMoment(const std::string& folder);
std::string sealedMoment(int minutes);

// Waking after he decayed, he is offended you left him; otherwise he greets.
std::string wakeMoment(const std::string& form);
// Left alone: his decay if he is fading, Halloween in its last week of
// October, otherwise a lore screensaver. date is "YYYY-MM-DD".
std::string screensaverMoment(const std::string& form, const std::string& date);
