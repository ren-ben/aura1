#pragma once
#include <Adafruit_GFX.h>
#include <cstdint>
#include <string>
#include <vector>
#include "art_index.h"
#include "renderer.h"

// Draws the screens. Kael'thos comes from the SD card's art pack (see
// art_index.h): wake and sleep animations, and a scene for a running or
// sealed session. Without the pack it falls back to plain text screens.
class EinkRenderer : public Renderer {
public:
  void begin();
  void render(const ViewModel& vm) override;

private:
  void drawWaking();
  static void drawDormant(Adafruit_GFX& g);
  void drawList(const ViewModel& vm);
  void drawRunning(const ViewModel& vm);
  void drawStopped(const ViewModel& vm);
  // Plays a scene's frames in order; the last one gets a full refresh if asked.
  bool play(const std::string& moment, bool fullLast);
  // Centred unless a position is given.
  bool drawArt(const ArtScene& scene, int frame, int x = -1, int y = -1);
  bool drawScene(const std::string& moment);
  void drawQuote(const ViewModel& vm);
  void drawBand(const std::string& text);

  std::vector<ArtScene> art_;
  // The place (scene env) now on the glass; empty for lists and text.
  std::string env_;
  std::vector<std::vector<uint8_t>> watch_;
  int watchSize_ = 0;

  static constexpr int PARTIALS_BEFORE_FULL = 40;
  int partials_ = 0;
};
