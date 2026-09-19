#pragma once
#include <Adafruit_GFX.h>
#include "renderer.h"

// Throwaway prototype layout. Phase 4 replaces this class, and only this class.
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

  static constexpr int PARTIALS_BEFORE_FULL = 40;
  int partials_ = 0;
};
