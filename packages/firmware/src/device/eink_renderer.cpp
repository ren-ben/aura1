#include "eink_renderer.h"
#include <algorithm>
#include <SD_MMC.h>
#include <SPI.h>
#include <esp_random.h>
#include <GxEPD2_BW.h>
#include "buttons.h"

// SSD1681, 200x200. GxEPD2_154_D67 defaults BUSY to active HIGH, which is this panel.
static GxEPD2_BW<GxEPD2_154_D67, GxEPD2_154_D67::HEIGHT> display(
    GxEPD2_154_D67(PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST, PIN_EPD_BUSY));

static void centered(Adafruit_GFX& g, int y, int size, const char* text);

// The art pack: frames are read from the card into this buffer, one at a time.
static uint8_t frameBits[200 * 200 / 8];
// Which frame was left on the glass at power-off, the place it is set in and
// whether it was drawn in negative: the next boot loads it as the controller's
// previous image, to wake without a full refresh, in the same place.
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

static const char* const WATCH[] = { "watch-left", "watch-up", "watch-right" };

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
  // The looks draw his head on every press: keep its frames in memory, as
  // opening files in the art folder is slow.
  for (const char* id : WATCH) {
    const ArtScene* w = findScene(art_, id);
    if (!w || !loadFrame(framePath(*w, 0), w->size)) { watch_.clear(); break; }
    watchSize_ = w->size;
    watch_.emplace_back(frameBits, frameBits + (w->size + 7) / 8 * w->size);
  }
  if (!last.empty() && loadFrame(last[0], 200)) {
    const bool negative = last.size() > 2 && last[2] == "1";
    glass.fillScreen(negative ? GxEPD_BLACK : GxEPD_WHITE);
    glass.drawBitmap(0, 0, frameBits, 200, 200, negative ? GxEPD_WHITE : GxEPD_BLACK);
  } else {
    drawDormant(glass);
  }
  display.epd2.writeImageAgain(glass.getBuffer(), 0, 0, display.width(), display.height());
  display.setRotation(0);
  display.setTextColor(GxEPD_BLACK);
  display.setTextSize(2);
}

// The looks' art: his head from memory, a bust or a scene from the card.
bool EinkRenderer::draw(Canvas& c, const std::string& id, int x, int y, uint8_t colour) {
  for (size_t i = 0; i < watch_.size(); ++i) {
    if (id == WATCH[i]) { c.bitmap(x, y, watch_[i].data(), watchSize_, watchSize_, colour); return true; }
  }
  if (id.rfind("watch-", 0) == 0) return false;
  const ArtScene* s = id == "cameo" ? pickScene(art_, "cameo", esp_random()) : findScene(art_, id);
  if (!s || !loadFrame(framePath(*s, 0), s->size)) return false;
  c.bitmap(x, y, frameBits, s->size, s->size, colour);
  return true;
}

bool EinkRenderer::drawScene(const ArtScene* scene, bool negative) {
  if (!scene || !loadFrame(framePath(*scene, 0), scene->size)) return false;
  if (negative) base_.clear(INK);
  const int at = (200 - scene->size) / 2;
  base_.bitmap(at, at, frameBits, scene->size, scene->size, negative ? PAPER : INK);
  env_ = scene->env;
  return true;
}

bool EinkRenderer::play(const std::string& moment, bool fullLast, bool negative) {
  return playScene(pickScene(art_, moment, esp_random(), env_), fullLast, negative);
}

// The still that says the button took: the first frame of the sleep with a
// word over it, by partial refresh, before anything slow is allowed to
// happen. Powering off syncs, and a sync is seconds; without this the glass
// stayed as it was and there was no knowing whether to keep holding.
bool EinkRenderer::goodnight(const ArtScene& scene, const Look& lk, const ViewModel& vm) {
  if (!loadFrame(framePath(scene, 0), scene.size)) return false;
  const bool negative = lk.negative();
  base_.clear(negative ? INK : PAPER);
  const int at = (200 - scene.size) / 2;
  base_.bitmap(at, at, frameBits, scene.size, scene.size, negative ? PAPER : INK);
  lk.caption(base_, vm, "LET GO");
  cornered_ = false;
  out_ = base_;
  push(false);
  return true;
}

bool EinkRenderer::playScene(const ArtScene* scene, bool fullLast, bool negative) {
  if (!scene || !loadFrame(framePath(*scene, 0), scene->size)) return false;
  cornered_ = false;
  const int at = (200 - scene->size) / 2;
  for (int i = 0; i < scene->frames; ++i) {
    const bool last = i == scene->frames - 1;
    if (i && !loadFrame(framePath(*scene, i), scene->size)) break;
    if (last && fullLast) display.setFullWindow();
    else display.setPartialWindow(0, 0, display.width(), display.height());
    display.firstPage();
    do {
      display.fillScreen(negative ? GxEPD_BLACK : GxEPD_WHITE);
      display.drawBitmap(at, at, frameBits, scene->size, scene->size, negative ? GxEPD_WHITE : GxEPD_BLACK);
    } while (display.nextPage());
    if (!last) delay(350);
  }
  display.powerOff();
  env_ = scene->env;
  if (fullLast) {
    File f = SD_MMC.open(GLASS_FILE, FILE_WRITE);
    if (f) { f.print((framePath(*scene, scene->frames - 1) + "\n" + env_ + "\n" + (negative ? "1" : "0")).c_str()); f.close(); }
  }
  return true;
}

// The canvas, with its corner, to the glass. Partial refresh everywhere for no
// flashing; partials leave stuck pixels behind, so every so often, and always
// at power-off, a full one.
void EinkRenderer::push(bool full) {
  if (full || partials_ >= PARTIALS_BEFORE_FULL) {
    display.setFullWindow();
    partials_ = 0;
  } else {
    display.setPartialWindow(0, 0, display.width(), display.height());
    ++partials_;
  }
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.drawBitmap(0, 0, out_.bits(), Canvas::W, Canvas::H, GxEPD_BLACK);
  } while (display.nextPage());
  display.powerOff();  // stop driving the panel between frames, avoids fading
}

void EinkRenderer::render(const ViewModel& vm) {
  const Look& lk = look(vm.look);
  // Kael'thos greets and says goodnight with an animation from the art pack,
  // in the place on the glass: where he fell asleep, or the scene he was in.
  if (vm.screen == Screen::Waking && play(vm.moment.empty() ? "wake" : vm.moment, false, lk.negative())) return;
  if (vm.screen == Screen::Dormant) {
    // One scene for both: the still and the animation that follows it have
    // to be the same cat going to sleep in the same place.
    const ArtScene* s = pickScene(art_, "sleep", esp_random(), env_);
    if (s) {
      goodnight(*s, lk, vm);
      if (playScene(s, true, lk.negative())) { partials_ = 0; return; }
    }
  }
  if (vm.screen == Screen::Waking || vm.screen == Screen::Dormant) {
    // No art pack: the prototype eye.
    cornered_ = false;
    display.setFullWindow();
    partials_ = 0;
    display.firstPage();
    do {
      if (vm.screen == Screen::Waking) { display.fillScreen(GxEPD_WHITE); drawWaking(); }
      else drawDormant(display);
    } while (display.nextPage());
    display.powerOff();
    return;
  }

  base_.clear();
  bool scene = false;
  const auto fallback = [&](const std::vector<std::string>& lines) {
    base_.font(nullptr, 2);
    for (size_t i = 0; i < lines.size(); ++i) base_.text(lines[i], 4, 4 + static_cast<int>(i) * 40);
  };
  switch (vm.screen) {
    case Screen::Idle:
      env_.clear();  // a page is no place
      drawPage(base_, lk, vm, status_, *this);
      break;
    case Screen::Celebrate:
    case Screen::Screensaver:
      scene = drawScene(pickScene(art_, vm.moment, esp_random()), lk.negative());
      if (!scene) fallback({ vm.screen == Screen::Celebrate ? "!" : "AURA-1" });
      break;
    case Screen::Running: {
      // His scene for this folder (or the ritual's candles), or any session
      // scene for a folder the pack does not know.
      const bool rite = !vm.moment.empty();
      const ArtScene* s = pickScene(art_, rite ? vm.moment : sessionMoment(vm.folder), esp_random());
      if (!s) s = pickScene(art_, "session-axiom", esp_random());
      scene = drawScene(s, lk.negative());
      if (scene) lk.caption(base_, vm, rite ? "The Rite" : vm.activity);
      else fallback({ vm.folder, vm.activity, "IN PROGRESS" });
      break;
    }
    case Screen::Stopped: {
      const std::string took = vm.minutes < MIN_SESSION_MINUTES ? "too short"
        : std::to_string(vm.minutes / 60) + "h " + std::to_string(vm.minutes % 60) + "m";
      scene = drawScene(pickScene(art_, vm.moment.empty() ? sealedMoment(vm.minutes) : vm.moment, esp_random()), lk.negative());
      if (scene) lk.caption(base_, vm, took);
      else fallback({ "SEALED", vm.activity, took });
      break;
    }
    default: break;
  }
  corner_ = lk.corner(vm, scene);
  cornered_ = true;
  out_ = base_;
  drawCorner(out_, corner_.y, status_, corner_.ink);
  push(false);
}

void EinkRenderer::setStatus(const Status& status) {
  if (status == status_) return;
  const bool visible = !(status.bars == status_.bars && status.charging == status_.charging && status.link == status_.link);
  status_ = status;
  if (visible) drawStatus();
}

// Only the corner, by partial refresh: the page under it is still in base_.
void EinkRenderer::drawStatus() {
  if (!cornered_) return;
  out_ = base_;
  drawCorner(out_, corner_.y, status_, corner_.ink);
  display.setPartialWindow(CORNER_X, std::max(0, corner_.y - 2), CORNER_W, CORNER_H);
  ++partials_;
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.drawBitmap(0, 0, out_.bits(), Canvas::W, Canvas::H, GxEPD_BLACK);
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

// Prototype glyphs, for a card without the art pack.
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
