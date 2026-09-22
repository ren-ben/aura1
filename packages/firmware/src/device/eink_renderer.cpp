#include "eink_renderer.h"
#include <algorithm>
#include <SD_MMC.h>
#include <SPI.h>
#include <esp_random.h>
#include <GxEPD2_BW.h>
#include "buttons.h"
#include "quote_text.h"

// SSD1681, 200x200. GxEPD2_154_D67 defaults BUSY to active HIGH, which is this panel.
static GxEPD2_BW<GxEPD2_154_D67, GxEPD2_154_D67::HEIGHT> display(
    GxEPD2_154_D67(PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST, PIN_EPD_BUSY));

// Default 6x8 font at size 2: 12x16 px per glyph, 16 glyphs per line.
constexpr int LINE = 20;
constexpr int MARGIN = 4;

// Kael'thos from the art pack, 24 px, for the link: melting into a spiral
// while he syncs, sitting by a cactus while offline. Online, the corner stays
// quiet. Kept in memory from boot; without the pack a word stands in.
constexpr int ICON = 24;
static std::vector<uint8_t> syncIcon, offlineIcon;

// The corner: top-right over a scene, bottom-right under a list. The battery
// is an outline with a nub, filled in quarters, or holding a bolt while it
// charges; his icon to its left when syncing or offline. Each sits on white
// so it reads over a scene.
static void drawCorner(const Status& s, bool top) {
  constexpr int X = 170, W = 24, H = 10;
  const int Y = top ? 4 : 188;
  display.fillRect(X - 2, Y - 2, W + 6, H + 4, GxEPD_WHITE);
  display.drawRect(X, Y, W, H, GxEPD_BLACK);
  display.fillRect(X + W, Y + 3, 2, H - 6, GxEPD_BLACK);
  if (s.charging) {
    const int cx = X + W / 2;
    display.fillTriangle(cx + 2, Y + 1, cx - 4, Y + 6, cx + 1, Y + 5, GxEPD_BLACK);
    display.fillTriangle(cx - 2, Y + H - 1, cx + 4, Y + 4, cx - 1, Y + 5, GxEPD_BLACK);
  } else {
    for (int q = 0; q < s.bars; ++q) display.fillRect(X + 2 + q * 5, Y + 2, 4, H - 4, GxEPD_BLACK);
  }
  if (s.link == Link::Online) return;
  const bool syncing = s.link == Link::Syncing;
  const std::vector<uint8_t>& art = syncing ? syncIcon : offlineIcon;
  constexpr int IX = 144;
  const int iy = top ? 1 : 176;
  display.fillRect(IX - 2, iy, ICON + 4, ICON, GxEPD_WHITE);
  if (art.empty()) {
    display.setTextSize(1);
    display.setCursor(IX, iy + 8);
    display.print(syncing ? "..." : "off");
    return;
  }
  display.drawBitmap(IX, iy, art.data(), ICON, ICON, GxEPD_BLACK);
}

static void centered(Adafruit_GFX& g, int y, int size, const char* text);

// The art pack: frames are read from the card into this buffer, one at a time.
static uint8_t frameBits[200 * 200 / 8];
// Which frame was left on the glass at power-off, and the place it is set in:
// the next boot loads it as the controller's previous image, to wake without
// a full refresh, and wakes up in the same place.
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

static const ArtScene* findScene(const std::vector<ArtScene>& art, const std::string& id) {
  for (const auto& s : art) {
    if (s.id == id) return &s;
  }
  return nullptr;
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
  if (last.size() > 1) env_ = last[1];
  // The menu's watcher is drawn on every press: keep his frames in memory,
  // as opening files in the art folder is slow.
  for (const char* id : { "watch-left", "watch-up", "watch-right" }) {
    const ArtScene* w = findScene(art_, id);
    if (!w || !loadFrame(framePath(*w, 0), w->size)) continue;
    watchSize_ = w->size;
    watch_.emplace_back(frameBits, frameBits + (w->size + 7) / 8 * w->size);
  }
  for (auto [id, icon] : { std::pair{ "status-sync", &syncIcon }, std::pair{ "status-offline", &offlineIcon } }) {
    const ArtScene* w = findScene(art_, id);
    if (w && w->size == ICON && loadFrame(framePath(*w, 0), ICON)) icon->assign(frameBits, frameBits + (ICON + 7) / 8 * ICON);
  }
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

bool EinkRenderer::drawArt(const ArtScene& scene, int frame, int x, int y) {
  if (!loadFrame(framePath(scene, frame), scene.size)) return false;
  const int at = (200 - scene.size) / 2;
  display.drawBitmap(x < 0 ? at : x, y < 0 ? at : y, frameBits, scene.size, scene.size, GxEPD_BLACK);
  return true;
}

// A whole-screen scene for a moment; false when the pack has none. The glass
// is then set in that scene's place.
bool EinkRenderer::drawScene(const std::string& moment) {
  const ArtScene* scene = pickScene(art_, moment, esp_random());
  if (!scene || !drawArt(*scene, 0)) return false;
  env_ = scene->env;
  sceneSize_ = scene->size;
  return true;
}

// Kael'thos says the quote: his cameo in the bottom-left corner, a bubble
// sized to the words above him, clear of the screen edge, its tail on him.
void EinkRenderer::drawQuote(const ViewModel& vm) {
  constexpr int EDGE = 8, PAD = 8, BOTTOM = 106;
  // Large text doubles the 6x8 font: half the words to a line.
  const int scale = vm.largeText ? 2 : 1;
  const int lineH = 11 * scale - (scale - 1) * 4;
  const QuoteFit fit = quoteFit(vm.largeText);
  // One page of a long quote; an arrow under the bubble says SUN shows more.
  const auto all = wrapWords(vm.quote, fit.chars);
  const size_t first = std::min(all.size(), static_cast<size_t>(vm.quotePage) * fit.lines);
  const std::vector<std::string> lines(all.begin() + first, all.begin() + std::min(all.size(), first + fit.lines));
  const bool more = first + fit.lines < all.size();
  size_t widest = 0;
  for (const auto& l : lines) widest = std::max(widest, l.size());
  const int w = std::max(48, static_cast<int>(widest) * 6 * scale + 2 * PAD);
  const int h = static_cast<int>(lines.size()) * lineH - 3 * scale + 2 * PAD;
  const int top = BOTTOM - h;
  display.drawRoundRect(EDGE, top, w, h, 8, GxEPD_BLACK);
  display.drawRoundRect(EDGE + 1, top + 1, w - 2, h - 2, 7, GxEPD_BLACK);
  // The tail points straight down between his ears: the cameo's centre.
  const ArtScene* cameo = pickScene(art_, "cameo", esp_random());
  const int tip = EDGE + (cameo ? cameo->size / 2 : 36);
  display.fillTriangle(tip - 8, BOTTOM - 2, tip + 6, BOTTOM - 2, tip, BOTTOM + 12, GxEPD_BLACK);
  display.fillTriangle(tip - 5, BOTTOM - 3, tip + 3, BOTTOM - 3, tip - 1, BOTTOM + 6, GxEPD_WHITE);
  display.setTextSize(scale);
  for (size_t i = 0; i < lines.size(); ++i) {
    display.setCursor(EDGE + PAD, top + PAD + static_cast<int>(i) * lineH);
    display.print(lines[i].c_str());
  }
  display.setTextSize(1);
  if (more) {
    const int ax = EDGE + w - 12;
    display.fillTriangle(ax - 5, BOTTOM + 4, ax + 5, BOTTOM + 4, ax, BOTTOM + 10, GxEPD_BLACK);
  }
  if (cameo) drawArt(*cameo, 0, EDGE, 200 - cameo->size - EDGE);
  if (!vm.source.empty()) {
    display.setCursor(EDGE + 80, 150);
    display.print(("- " + vm.source).substr(0, 17).c_str());
  }
  const std::string count = std::to_string(vm.cursor + 1) + "/" + std::to_string(vm.items.size());
  display.setCursor(200 - EDGE - 6 * static_cast<int>(count.size()), 162);
  display.print(count.c_str());
}

bool EinkRenderer::play(const std::string& moment, bool fullLast) {
  const ArtScene* scene = pickScene(art_, moment, esp_random(), env_);
  if (!scene || !loadFrame(framePath(*scene, 0), scene->size)) return false;
  spot_ = Spot::None;
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
  env_ = scene->env;
  if (fullLast) {
    File f = SD_MMC.open(GLASS_FILE, FILE_WRITE);
    if (f) { f.print((framePath(*scene, scene->frames - 1) + "\n" + env_).c_str()); f.close(); }
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
  // Kael'thos greets and says goodnight with an animation from the art pack,
  // in the place on the glass: where he fell asleep, or the scene he was in.
  if (vm.screen == Screen::Waking && play(vm.moment.empty() ? "wake" : vm.moment, false)) return;
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

  sceneSize_ = 0;
  bool art = false;
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setTextSize(2);
    art = false;
    switch (vm.screen) {
      case Screen::Waking: drawWaking(); break;
      case Screen::Idle:
        env_.clear();  // a list is no place
        if (vm.place == Place::Quotes) {
          if (vm.quote.empty()) centered(display, 90, 2, "no quotes");
          else drawQuote(vm);
        } else {
          drawList(vm);
        }
        break;
      case Screen::Celebrate:
      case Screen::Screensaver:
        art = drawScene(vm.moment);
        if (!art) centered(display, 90, 2, vm.screen == Screen::Celebrate ? "!" : "AURA-1");
        break;
      case Screen::Running: {
        // His scene for this folder (or the ritual's candles), or any session
        // scene for a folder the pack does not know.
        const bool rite = !vm.moment.empty();
        const ArtScene* scene = pickScene(art_, rite ? vm.moment : sessionMoment(vm.folder), esp_random());
        if (!scene) scene = pickScene(art_, "session-axiom", esp_random());
        art = scene && drawArt(*scene, 0);
        if (art) { env_ = scene->env; sceneSize_ = scene->size; }
        if (art) drawBand(rite ? "THE RITE" : vm.activity); else drawRunning(vm);
        break;
      }
      case Screen::Stopped: {
        const ArtScene* scene = pickScene(art_, vm.moment.empty() ? sealedMoment(vm.minutes) : vm.moment, esp_random());
        art = scene && drawArt(*scene, 0);
        if (art) { env_ = scene->env; sceneSize_ = scene->size; }
        if (art) drawBand(vm.minutes < MIN_SESSION_MINUTES ? "too short"
                          : std::to_string(vm.minutes / 60) + "h " + std::to_string(vm.minutes % 60) + "m");
        else drawStopped(vm);
        break;
      }
      case Screen::Dormant: drawDormant(display); break;
    }
    if (vm.screen != Screen::Waking && vm.screen != Screen::Dormant) drawCorner(status_, art);
  } while (display.nextPage());
  display.powerOff();  // stop driving the panel between frames, avoids fading
  spot_ = vm.screen == Screen::Waking || vm.screen == Screen::Dormant ? Spot::None
        : art ? Spot::Top : Spot::Bottom;
}

void EinkRenderer::setStatus(const Status& status) {
  if (status == status_) return;
  status_ = status;
  if (spot_ != Spot::None) drawStatus(spot_ == Spot::Top);
}

// Only the corner, by partial refresh: the scene under it is still in
// frameBits, so it is drawn back around the icons.
void EinkRenderer::drawStatus(bool top) {
  const int y = top ? 0 : 176;
  display.setPartialWindow(136, y, 64, top ? 26 : 24);
  ++partials_;
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    if (top && sceneSize_) {
      const int at = (200 - sceneSize_) / 2;
      display.drawBitmap(at, at, frameBits, sceneSize_, sceneSize_, GxEPD_BLACK);
    }
    drawCorner(status_, top);
  } while (display.nextPage());
  display.powerOff();
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

  const bool checks = !vm.checks.empty();
  const int first = vm.cursor >= ROWS ? vm.cursor - ROWS + 1 : 0;
  if (vm.items.empty()) centered(display, 80, 1, vm.place == Place::Habits ? "no habits yet" : "nothing due today");
  for (int row = 0; row < ROWS && first + row < static_cast<int>(vm.items.size()); ++row) {
    const int index = first + row;
    const int y = TOP + row * ROW_H;
    const bool selected = index == vm.cursor;
    const uint16_t fg = selected ? GxEPD_WHITE : GxEPD_BLACK;
    if (selected) display.fillRect(0, y - 2, display.width(), ROW_H, GxEPD_BLACK);
    display.setTextColor(fg);
    if (checks) {
      // A box, ticked when done.
      display.drawRect(MARGIN, y + 1, 12, 12, fg);
      if (vm.checks[index]) {
        display.drawLine(MARGIN + 2, y + 7, MARGIN + 5, y + 10, fg);
        display.drawLine(MARGIN + 5, y + 10, MARGIN + 10, y + 3, fg);
        display.drawLine(MARGIN + 2, y + 8, MARGIN + 5, y + 11, fg);
      }
      display.setCursor(MARGIN + 18, y);
      display.print(vm.items[index].substr(0, 14).c_str());
    } else {
      display.setCursor(MARGIN, y);
      display.print(vm.items[index].substr(0, 15).c_str());
    }
  }

  // In the menu he watches from the corner, eyes following the cursor.
  if (vm.place == Place::Menu && watch_.size() == 3) {
    const int look[] = { 0, 0, 1, 2 };
    display.drawBitmap(200 - watchSize_, 162 - watchSize_, watch_[look[vm.cursor % 4]].data(), watchSize_, watchSize_, GxEPD_BLACK);
  }

  display.setTextColor(GxEPD_BLACK);
  display.setTextSize(1);
  display.drawLine(0, 164, display.width(), 164, GxEPD_BLACK);
  display.setCursor(MARGIN, 172);
  const char* act = vm.place == Place::Todos || vm.place == Place::Habits ? "tick"
    : vm.place == Place::Settings ? "change"
    : vm.place == Place::Activities && !vm.top ? "start" : "open";
  // Short enough to end left of the corner, which redraws on its own.
  display.print((std::string("SUN next  POWER ") + act).c_str());
  if (vm.place != Place::Menu) {
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
