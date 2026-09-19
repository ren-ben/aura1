#pragma once
#include <Adafruit_GFX.h>
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
  bool drawArt(const ArtScene& scene, int frame);
  void drawBand(const std::string& text);

  std::vector<ArtScene> art_;

  static constexpr int PARTIALS_BEFORE_FULL = 40;
  int partials_ = 0;
};
