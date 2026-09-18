#include "eink_renderer.h"
#include <SPI.h>
#include <GxEPD2_BW.h>
#include "buttons.h"

// SSD1681, 200x200. GxEPD2_154_D67 defaults BUSY to active HIGH, which is this panel.
static GxEPD2_BW<GxEPD2_154_D67, GxEPD2_154_D67::HEIGHT> display(
    GxEPD2_154_D67(PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST, PIN_EPD_BUSY));

// Default 6x8 font at size 2: 12x16 px per glyph, 16 glyphs per line.
constexpr int LINE = 20;
constexpr int MARGIN = 4;

static void line(int row, const std::string& text) {
  display.setCursor(MARGIN, MARGIN + row * LINE);
  display.print(text.c_str());
}

void EinkRenderer::begin() {
  pinMode(PIN_PANEL_POWER, OUTPUT);
  digitalWrite(PIN_PANEL_POWER, LOW);  // panel power on
  delay(10);
  SPI.begin(PIN_EPD_SCK, -1, PIN_EPD_MOSI, PIN_EPD_CS);  // not the default SPI pins
  display.init();
  display.setRotation(0);
  display.setTextColor(GxEPD_BLACK);
  display.setTextSize(2);
}

void EinkRenderer::render(const ViewModel& vm) {
  // Partial refresh for cursor movement; full refresh on folder change and every
  // PARTIALS_BEFORE_FULL partials, to clear ghosting.
  if (vm.folderIndex != lastFolderIndex_ || partials_ >= PARTIALS_BEFORE_FULL) {
    display.setFullWindow();
    partials_ = 0;
  } else {
    display.setPartialWindow(0, 0, display.width(), display.height());
    ++partials_;
  }
  lastFolderIndex_ = vm.folderIndex;

  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    switch (vm.screen) {
      case Screen::Idle: drawIdle(vm); break;
      case Screen::Running: drawRunning(vm); break;
      case Screen::Stopped: drawStopped(vm); break;
      case Screen::Syncing: break;
    }
  } while (display.nextPage());
  display.powerOff();  // stop driving the panel between frames, avoids fading
}

void EinkRenderer::drawIdle(const ViewModel& vm) {
  line(0, vm.folder);
  line(1, std::to_string(vm.cursor + 1) + "/" + std::to_string(vm.count));
  line(3, "> " + vm.activity);
  line(7, "SUN   next");
  line(8, "HOLD  folder");
}

void EinkRenderer::drawRunning(const ViewModel& vm) {
  // Never elapsed time here: vm.minutes is zero by contract and stays unused.
  line(0, vm.folder);
  line(3, vm.activity);
  line(5, "IN PROGRESS");
  line(8, "POWER stop");
}

void EinkRenderer::drawStopped(const ViewModel& vm) {
  line(0, "SEALED");
  line(3, vm.activity);
  line(5, std::to_string(vm.minutes / 60) + "h " + std::to_string(vm.minutes % 60) + "m");
}
