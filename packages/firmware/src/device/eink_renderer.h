#pragma once
#include <Adafruit_GFX.h>
#include "ports.h"
#include "renderer.h"

// Throwaway prototype layout. Phase 4 replaces this class, and only this class.
class EinkRenderer : public Renderer {
public:
  explicit EinkRenderer(Storage& storage) : storage_(storage) {}
  void begin();
  void render(const ViewModel& vm) override;

private:
  void drawWaking();
  static void drawDormant(Adafruit_GFX& g);
  void drawList(const ViewModel& vm);
  void drawRunning(const ViewModel& vm);
  void drawStopped(const ViewModel& vm);

  static constexpr const char* PARTIALS_FILE = "/eink.txt";
  static constexpr int FULL_AT_POWER_OFF = 30;
  static constexpr int FULL_ANYWHERE = 80;
  Storage& storage_;
  int partials_ = 0;  // since the last full refresh, across power cycles
};
