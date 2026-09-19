#include "eink_renderer.h"
#include <SD_MMC.h>
#include <SPI.h>
#include <esp_random.h>
#include <GxEPD2_BW.h>
#include "battery.h"
#include "battery_reader.h"
#include "buttons.h"

// SSD1681, 200x200. GxEPD2_154_D67 defaults BUSY to active HIGH, which is this panel.
static GxEPD2_BW<GxEPD2_154_D67, GxEPD2_154_D67::HEIGHT> display(
    GxEPD2_154_D67(PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST, PIN_EPD_BUSY));

// Default 6x8 font at size 2: 12x16 px per glyph, 16 glyphs per line.
constexpr int LINE = 20;
constexpr int MARGIN = 4;

// Bottom-right corner (top-right over a scene): an outline with a nub, filled
// in quarters, or a bolt while on USB (the charge level cannot be read then).
static void drawBattery(int millivolts, bool top) {
  constexpr int X = 170, W = 24, H = 10;
  const int Y = top ? 4 : 188;
  if (top) display.fillRect(X - 2, Y - 2, W + 6, H + 4, GxEPD_WHITE);
  display.drawRect(X, Y, W, H, GxEPD_BLACK);
  display.fillRect(X + W, Y + 3, 2, H - 6, GxEPD_BLACK);
  if (onExternalPower(millivolts)) {
    const int cx = X + W / 2;
    display.fillTriangle(cx + 2, Y + 1, cx - 4, Y + 6, cx + 1, Y + 5, GxEPD_BLACK);
    display.fillTriangle(cx - 2, Y + H - 1, cx + 4, Y + 4, cx - 1, Y + 5, GxEPD_BLACK);
    return;
  }
  const int quarters = (batteryPercent(millivolts) + 12) / 25;
  for (int q = 0; q < quarters; ++q) display.fillRect(X + 2 + q * 5, Y + 2, 4, H - 4, GxEPD_BLACK);
}

static void centered(Adafruit_GFX& g, int y, int size, const char* text);

// The art pack: frames are read from the card into this buffer, one at a time.
static uint8_t frameBits[200 * 200 / 8];
// Which frame was left on the glass at power-off, so the next boot can load it
// as the controller's previous image and wake without a full refresh.
constexpr const char* GLASS_FILE = "/art/glass.txt";

static std::string framePath(const ArtScene& s, int frame) {
  return "/art/" + s.id + "-" + std::to_string(frame) + ".bin";
}

static bool loadFrame(const std::string& path, int size) {
  File f = SD_MMC.open(path.c_str(), FILE_READ);
  if (!f) return false;
  const size_t want = static_cast<size_t>((size + 7) / 8) * size;
  const bool ok = f.read(frameBits, want) == want;
  f.close();
  return ok;
}

static std::vector<std::string> readLines(const char* path) {
  std::vector<std::string> out;
  File f = SD_MMC.open(path, FILE_READ);
  if (!f) return out;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length()) out.emplace_back(line.c_str());
  }
  f.close();
  return out;
}

static void line(int row, const std::string& text) {
  display.setCursor(MARGIN, MARGIN + row * LINE);
  display.print(text.c_str());
}

void EinkRenderer::begin() {
  pinMode(PIN_PANEL_POWER, OUTPUT);
  digitalWrite(PIN_PANEL_POWER, LOW);  // panel power on
  delay(10);
  SPI.begin(PIN_EPD_SCK, -1, PIN_EPD_MOSI, PIN_EPD_CS);  // not the default SPI pins
  art_ = parseArtIndex(readLines("/art/index.txt"));
  // Not an initial init: the glass already shows the frame drawn at power-off.
  // Loading that image into the controller as the previous frame lets WAKING
  // arrive by partial refresh instead of the flashing full one.
  display.init(0, false);
  GFXcanvas1 glass(display.width(), display.height());
  const auto last = readLines(GLASS_FILE);
  if (!last.empty() && loadFrame(last[0], 200)) {
    glass.fillScreen(GxEPD_WHITE);
    glass.drawBitmap(0, 0, frameBits, 200, 200, GxEPD_BLACK);
  } else {
    drawDormant(glass);
  }
  display.epd2.writeImageAgain(glass.getBuffer(), 0, 0, display.width(), display.height());
  display.setRotation(0);
  display.setTextColor(GxEPD_BLACK);
  display.setTextSize(2);
}

bool EinkRenderer::drawArt(const ArtScene& scene, int frame) {
  if (!loadFrame(framePath(scene, frame), scene.size)) return false;
  const int at = (200 - scene.size) / 2;
  display.drawBitmap(at, at, frameBits, scene.size, scene.size, GxEPD_BLACK);
  return true;
}

bool EinkRenderer::play(const std::string& moment, bool fullLast) {
  const ArtScene* scene = pickScene(art_, moment, esp_random());
  if (!scene || !loadFrame(framePath(*scene, 0), scene->size)) return false;
  for (int i = 0; i < scene->frames; ++i) {
    const bool last = i == scene->frames - 1;
    if (last && fullLast) display.setFullWindow();
    else display.setPartialWindow(0, 0, display.width(), display.height());
    display.firstPage();
    do {
      display.fillScreen(GxEPD_WHITE);
      drawArt(*scene, i);
    } while (display.nextPage());
    if (!last) delay(350);
  }
  display.powerOff();
  if (fullLast) {
    File f = SD_MMC.open(GLASS_FILE, FILE_WRITE);
    if (f) { f.print(framePath(*scene, scene->frames - 1).c_str()); f.close(); }
  }
  return true;
}

// A white band along the bottom with centred text, over a scene.
void EinkRenderer::drawBand(const std::string& text) {
  display.fillRect(0, 180, display.width(), 20, GxEPD_WHITE);
  display.drawLine(0, 180, display.width(), 180, GxEPD_BLACK);
  centered(display, 183, 2, text.substr(0, 15).c_str());
}

void EinkRenderer::render(const ViewModel& vm) {
  // Kael'thos greets and says goodnight with an animation from the art pack.
  if (vm.screen == Screen::Waking && play("wake", false)) return;
  if (vm.screen == Screen::Dormant && play("sleep", true)) { partials_ = 0; return; }

  // Partial refresh everywhere else, for no flashing. Partials leave stuck
  // pixels behind, so DORMANT always gets a full refresh: the flash comes at
  // power-off, and the next boot starts from a clean, known frame.
  if (vm.screen == Screen::Dormant || partials_ >= PARTIALS_BEFORE_FULL) {
    display.setFullWindow();
    partials_ = 0;
  } else {
    display.setPartialWindow(0, 0, display.width(), display.height());
    ++partials_;
  }

  // Read at each frame: the glass only changes then anyway.
  const int battery = readBatteryMillivolts();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setTextSize(2);
    bool art = false;
    switch (vm.screen) {
      case Screen::Waking: drawWaking(); break;
      case Screen::Idle: drawList(vm); break;
      case Screen::Running: {
        // His scene for this folder, or any session scene for a new folder.
        const ArtScene* scene = pickScene(art_, sessionMoment(vm.folder), esp_random());
        if (!scene) scene = pickScene(art_, "session-axiom", esp_random());
        art = scene && drawArt(*scene, 0);
        if (art) drawBand(vm.activity); else drawRunning(vm);
        break;
      }
      case Screen::Stopped: {
        const ArtScene* scene = pickScene(art_, sealedMoment(vm.minutes), esp_random());
        art = scene && drawArt(*scene, 0);
        if (art) drawBand(std::to_string(vm.minutes / 60) + "h " + std::to_string(vm.minutes % 60) + "m");
        else drawStopped(vm);
        break;
      }
      case Screen::Dormant: drawDormant(display); break;
    }
    if (vm.screen != Screen::Waking && vm.screen != Screen::Dormant) drawBattery(battery, art);
  } while (display.nextPage());
  display.powerOff();  // stop driving the panel between frames, avoids fading
}

static void centered(Adafruit_GFX& g, int y, int size, const char* text) {
  int16_t x1, y1;
  uint16_t w, h;
  g.setTextSize(size);
  g.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
  g.setCursor((g.width() - w) / 2, y);
  g.print(text);
}

// Prototype glyphs. The Kael'thos art replaces them in Phase 3/4.
static void openEye(int cx, int cy) {
  display.drawCircle(cx, cy, 24, GxEPD_BLACK);
  display.drawCircle(cx, cy, 23, GxEPD_BLACK);
  display.fillCircle(cx, cy, 10, GxEPD_BLACK);
  display.fillCircle(cx - 3, cy - 3, 3, GxEPD_WHITE);
  display.drawLine(cx - 46, cy, cx - 28, cy, GxEPD_BLACK);
  display.drawLine(cx + 28, cy, cx + 46, cy, GxEPD_BLACK);
}

static void closedEye(Adafruit_GFX& g, int cx, int cy) {
  // A lid curving down, with lashes.
  for (int x = -32; x <= 32; ++x) {
    const int y = cy + x * x / 64;
    g.drawPixel(cx + x, y, GxEPD_BLACK);
    g.drawPixel(cx + x, y + 1, GxEPD_BLACK);
  }
  for (int x = -24; x <= 24; x += 12) {
    const int y = cy + x * x / 64 + 2;
    g.drawLine(cx + x, y, cx + x + x / 6, y + 9, GxEPD_BLACK);
  }
}

void EinkRenderer::drawWaking() {
  openEye(100, 78);
  centered(display, 126, 2, "AURA-1");
  centered(display, 152, 1, "waking");
}

// Also drawn off-screen at boot, as the image the glass is known to show.
void EinkRenderer::drawDormant(Adafruit_GFX& g) {
  g.fillScreen(GxEPD_WHITE);
  g.setTextColor(GxEPD_BLACK);
  closedEye(g, 100, 70);
  centered(g, 126, 2, "AURA-1");
  centered(g, 152, 1, "dormant");
  centered(g, 176, 1, "hold POWER");
}

void EinkRenderer::drawList(const ViewModel& vm) {
  constexpr int ROWS = 6;
  constexpr int ROW_H = 20;
  constexpr int TOP = 30;

  const std::string count = std::to_string(vm.cursor + 1) + "/" + std::to_string(vm.items.size());
  display.setCursor(MARGIN, 4);
  display.print(vm.title.substr(0, 10).c_str());
  display.setCursor(display.width() - MARGIN - 12 * static_cast<int>(count.size()), 4);
  display.print(count.c_str());
  display.drawLine(0, 24, display.width(), 24, GxEPD_BLACK);

  const int first = vm.cursor >= ROWS ? vm.cursor - ROWS + 1 : 0;
  for (int row = 0; row < ROWS && first + row < static_cast<int>(vm.items.size()); ++row) {
    const int index = first + row;
    const int y = TOP + row * ROW_H;
    const bool selected = index == vm.cursor;
    if (selected) display.fillRect(0, y - 2, display.width(), ROW_H, GxEPD_BLACK);
    display.setTextColor(selected ? GxEPD_WHITE : GxEPD_BLACK);
    display.setCursor(MARGIN, y);
    display.print(vm.items[index].substr(0, 15).c_str());
  }

  display.setTextColor(GxEPD_BLACK);
  display.setTextSize(1);
  display.drawLine(0, 164, display.width(), 164, GxEPD_BLACK);
  display.setCursor(MARGIN, 172);
  display.print(vm.top ? "SUN next    POWER open" : "SUN next    POWER start");
  if (!vm.top) {
    display.setCursor(MARGIN, 186);
    display.print("hold SUN    back");
  }
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
  line(8, "SUN back");
}
