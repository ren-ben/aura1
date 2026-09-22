#include "looks.h"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <vector>
#include "quote_text.h"
#include "fonts/Cinzel11.h"
#include "fonts/Cinzel14.h"
#include "fonts/Fell13.h"
#include "fonts/Fraktur14.h"
#include "fonts/Fraktur20.h"
#include "fonts/FreeSans9pt7b.h"
#include "fonts/FreeSansBold12pt7b.h"
#include "fonts/FreeSansBold9pt7b.h"
#include "fonts/FreeSerif9pt7b.h"
#include "fonts/FreeSerifBold9pt7b.h"
#include "fonts/FreeSerifItalic9pt7b.h"
#include "fonts/Grenze13.h"
#include "fonts/Grenze18.h"
#include "fonts/Pirata13.h"
#include "fonts/Pirata18.h"
#include "fonts/Pirata24.h"

namespace {

constexpr double HALF_TURN = 3.14159265358979;

// Kael'thos at 16 px for the corner: melting into a spiral while he syncs,
// sitting by a cactus in the Chrome dino's desert while offline.
const char* const SPIRAL[] = {
  "....#.....#.....", "....##...##.....", "....#######.....", "....##.#.##.....",
  "....##.#.##.....", ".....#####......", "......###.......", "......#####.....",
  "..###.....##....", ".#...###...#....", ".#......#..#....", ".#..#.#.#..#....",
  ".#..#.#.#..#....", ".#...#..#..#....", "..#...##..#.....", "...#######......",
};
const char* const CACTUS[] = {
  "................", ".#.....#........", ".##...##....#...", ".#######....#...",
  ".#######..#.#...", ".#..#..#..#.#.#.", ".#######..###.#.", "..#####.....###.",
  "..#####.....#...", ".#######....#...", ".#######....#...", ".########...#...",
  ".#########..#...", "################", "................", "...#.....##.....",
};
const char* const BOLT[] = { "....##.", "...##..", "..##...", ".######", "...##..", "..##...", ".##....", ".#....." };
// His head alone, a seal for rules.
const char* const SEAL[] = { "#.....#", "##...##", "#######", "##.#.##", "#######", ".#####." };
const char* const GEAR[] = {
  ".....###.....", "..#..###..#..", ".###.###.###.", "..#########..", "...##...##...",
  "####.....####", "####.....####", "####.....####", "...##...##...", "..#########..",
  ".###.###.###.", "..#..###..#..", ".....###.....",
};
const char* const CROSS[] = { "..#..", "..#..", "#####", "..#..", "..#..", "..#..", "..#.." };
const char* const HAND[] = {
  "...###.......", "..#...######.", "###.........#", "#.....#######",
  "#.......#....", "#.....###....", "#......#.....", ".#######.....",
};
const char* const CANDLE[] = {
  "...#...", "..###..", "..###..", "...#...", "...#...", ".#####.",
  ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "#######",
};
const char* const CANDLE_OUT[] = {
  ".......", ".......", ".......", ".......", "...#...", ".#####.",
  ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "#######",
};

uint8_t other(uint8_t ink) { return ink == INK ? PAPER : INK; }

std::string upper(std::string s) {
  for (auto& ch : s) ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
  return s;
}

// "DEEP GNOSIS" and "deep gnosis" both to "Deep Gnosis"; numbers stay.
std::string title(std::string s) {
  bool start = true;
  for (auto& ch : s) {
    const unsigned char u = static_cast<unsigned char>(ch);
    ch = static_cast<char>(start ? std::toupper(u) : std::tolower(u));
    start = ch == ' ';
  }
  return s;
}

std::string roman(int n) {
  static const int V[] = { 10, 9, 5, 4, 1 };
  static const char* const R[] = { "x", "ix", "v", "iv", "i" };
  if (n > 39) return std::to_string(n);
  std::string out;
  for (int i = 0; i < 5; ++i) while (n >= V[i]) { out += R[i]; n -= V[i]; }
  return out;
}

// Cut a label to fit w pixels in the canvas' font.
std::string fit(const Canvas& c, std::string s, int w) {
  while (s.size() > 1 && c.width(s) > w) s.pop_back();
  return s;
}

std::vector<std::string> wrap(const Canvas& c, const std::string& text, int w) {
  std::vector<std::string> lines;
  std::string cur, word;
  const auto flush = [&]() {
    if (word.empty()) return;
    const std::string t = cur.empty() ? word : cur + " " + word;
    if (c.width(t) > w && !cur.empty()) { lines.push_back(cur); cur = word; } else cur = t;
    word.clear();
  };
  for (char ch : text) { if (ch == ' ' || ch == '\n') flush(); else word += ch; }
  flush();
  if (!cur.empty()) lines.push_back(cur);
  return lines;
}

// The first row shown so the cursor stays on screen.
int firstRow(int cur, int visible) { return cur >= visible ? cur - visible + 1 : 0; }

void gear(Canvas& c, int x, int y, bool selected, uint8_t ink) {
  if (selected) { c.fillCircle(x + 6, y + 6, 10, ink); c.icon(x, y, GEAR, 13, other(ink)); }
  else c.icon(x, y, GEAR, 13, ink);
}

// The list a look draws: the menu without its gear, which is drawn apart.
struct Rows {
  std::vector<std::string> items, values;
  std::vector<bool> checks;
  std::vector<std::string> history;
  int cur = 0;
  bool gearOn = false;
};

Rows rowsOf(const ViewModel& vm) {
  Rows r{ vm.items, vm.values, vm.checks, vm.history, vm.cursor, false };
  if (vm.gear >= 0 && vm.gear < static_cast<int>(r.items.size())) {
    r.items.erase(r.items.begin() + vm.gear);
    r.gearOn = vm.cursor == vm.gear;
    r.cur = r.gearOn ? -1 : vm.cursor > vm.gear ? vm.cursor - 1 : vm.cursor;
  }
  r.history.resize(r.items.size());
  return r;
}

// A habit's days; empty from a server that sends none.
std::string hist(const ViewModel& vm, int i) {
  return i >= 0 && i < static_cast<int>(vm.history.size()) ? vm.history[i] : "";
}

std::string pageTitle(const ViewModel& vm) {
  switch (vm.place) {
    case Place::Menu: return "AURA-1";
    case Place::Todos: return "TODAY";
    case Place::Habits: return "HABITS";
    case Place::Quotes: return "QUOTES";
    case Place::Settings: return "SETTINGS";
    default: return vm.title;
  }
}

std::string emptyNote(const ViewModel& vm) {
  return vm.place == Place::Habits ? "no habits yet" : vm.place == Place::Todos ? "nothing due today" : "nothing here";
}

int done(const std::vector<bool>& checks) { return static_cast<int>(std::count(checks.begin(), checks.end(), true)); }

// The words of the quote's current page, as the session machine counts pages.
std::string quotePage(const ViewModel& vm) {
  const QuoteFit f = quoteFit(vm.largeText);
  const auto lines = wrapWords(vm.quote, f.chars);
  std::string out;
  for (size_t i = static_cast<size_t>(vm.quotePage) * f.lines; i < lines.size() && i < (vm.quotePage + 1) * f.lines; ++i)
    out += (out.empty() ? "" : " ") + lines[i];
  return out;
}

bool moreQuote(const ViewModel& vm) {
  return vm.quotePage + 1 < quotePages(vm.quote, vm.largeText);
}

void moreMark(Canvas& c, int x, int y, uint8_t ink) { c.fillTriangle(x - 4, y, x + 4, y, x, y + 5, ink); }

std::string watchId(int cursor) {
  static const char* const IDS[] = { "watch-left", "watch-left", "watch-up", "watch-right" };
  return IDS[(cursor < 0 ? 3 : cursor) % 4];
}

// A habit's streak: days done in a row up to today, or up to yesterday while
// today is still open.
int streak(const std::string& h) {
  int n = static_cast<int>(h.size()) - 1;
  if (n >= 0 && h[n] == '0') --n;
  int s = 0;
  while (n >= 0 && h[n] == '1') { ++s; --n; }
  return s;
}

// The last twelve weeks, a column a week, like a contribution graph: a full
// dot for a day done, a speck for one missed, a ring around today.
enum class Mark { Dot, Square };
constexpr int GRAPH_W = 84, GRAPH_H = 49;
void habitGraph(Canvas& c, int x, int y, const std::string& h, Mark m, uint8_t ink) {
  constexpr int DAYS = 84;
  const int n = static_cast<int>(h.size());
  for (int i = 0; i < DAYS; ++i) {
    const int k = n - DAYS + i;
    const bool on = k >= 0 && h[k] == '1';
    const int cx = x + (i / 7) * 7 + 3, cy = y + (i % 7) * 7 + 3;
    if (m == Mark::Dot) { if (on) c.fillCircle(cx, cy, 3, ink); else c.pixel(cx, cy, ink); }
    else { if (on) c.fillRect(cx - 3, cy - 3, 6, 6, ink); else c.pixel(cx, cy, ink); }
    if (i == DAYS - 1 && !on) c.drawCircle(cx, cy, 3, ink);
  }
}

std::string streakText(const std::string& h) {
  const int s = streak(h);
  return s == 1 ? "1 day" : std::to_string(s) + " days";
}

// The battery for the settings: a large gauge, its percent, the voltage and
// whether it is charging. Compact stacks it for narrow places.
void batteryPanel(Canvas& c, int x, int y, const Status& s, const GFXfont* big, const GFXfont* small, uint8_t ink,
                  bool compact = false) {
  constexpr int BW = 48, BH = 22;
  c.drawRect(x, y, BW, BH, ink); c.drawRect(x + 1, y + 1, BW - 2, BH - 2, ink);
  c.fillRect(x + BW, y + 6, 3, BH - 12, ink);
  const int fill = (BW - 6) * std::max(0, std::min(100, s.percent)) / 100;
  c.fillRect(x + 3, y + 3, fill, BH - 6, ink);
  if (s.charging) {
    c.fillRect(x + BW / 2 - 8, y + 2, 16, BH - 4, other(ink));
    for (int j = 0; j < 8; ++j) for (int i = 0; BOLT[j][i]; ++i)
      if (BOLT[j][i] == '#') c.fillRect(x + BW / 2 - 7 + i * 2, y + 3 + j * 2, 2, 2, ink);
  }
  const std::string pct = std::to_string(s.percent) + "%";
  const std::string volts = std::to_string(s.millivolts / 1000) + "." + std::to_string(s.millivolts % 1000 / 100)
    + std::to_string(s.millivolts % 100 / 10) + "V";
  const std::string state = s.charging ? "charging" : "on battery";
  if (compact) {
    c.font(big); c.centered(pct, y + BH + 16, ink, x - 20, BW + 43);
    return;
  }
  c.font(big); c.text(pct, x + BW + 10, y + 17, ink);
  c.font(small);
  const int sx = x + BW + 10 + std::max(46, c.width(pct) + 8);
  const int lift = small ? 0 : 8;  // the classic font draws from its top
  c.text(volts, sx, y + 9 - lift, ink);
  c.text(state, sx, y + 21 - lift, ink);
}

// Small text in the classic font, for footnotes on any look.
void small(Canvas& c, const std::string& s, int x, int y, uint8_t ink) { c.font(nullptr, 1); c.text(s, x, y, ink); }

// ---------------------------------------------------------------- A: Codex
// A page from his grimoire: serif type, engraved double rules with his head
// as the seal, the chosen row an ink blot. The menu is his altar.
class Codex : public Look {
public:
  const char* name() const override { return "CODEX"; }
  Corner corner(const ViewModel&, bool) const override { return { 4, INK }; }

  static void rule(Canvas& c, int y) {
    c.hline(14, y, 172, INK); c.hline(14, y + 2, 172, INK);
    c.fillRect(93, y - 3, 15, 9, PAPER); c.icon(97, y - 2, SEAL, 6);
  }
  static void header(Canvas& c, const std::string& t) {
    c.font(&FreeSerifBold9pt7b); c.text(title(t), 14, 18); rule(c, 26);
  }
  static void rows(Canvas& c, const Rows& r, int top, int visible, bool center) {
    const int first = firstRow(std::max(r.cur, 0), visible);
    for (int i = first; i < static_cast<int>(r.items.size()) && i < first + visible; ++i) {
      const int y = top + (i - first) * 24;
      const bool sel = i == r.cur;
      const uint8_t fg = sel ? PAPER : INK;
      if (sel) c.fillRoundRect(10, y - 15, 180, 22, 4, INK);
      c.font(sel ? &FreeSerifBold9pt7b : &FreeSerif9pt7b);
      int x = 20;
      if (!r.checks.empty()) {
        c.drawRect(18, y - 11, 11, 11, fg);
        if (r.checks[i]) { c.line(20, y - 6, 22, y - 3, fg); c.line(22, y - 3, 27, y - 9, fg); c.line(20, y - 5, 22, y - 2, fg); }
        x = 36;
      }
      const std::string label = fit(c, title(r.items[i]), r.values.empty() ? 186 - x : 100);
      if (center) c.centered(label, y, fg); else c.text(label, x, y, fg);
      if (!r.values.empty()) { c.font(&FreeSerifItalic9pt7b); c.right(title(r.values[i]), 184, y, fg); }
    }
  }
  static void folio(Canvas& c, int cur, int n) {
    c.font(&FreeSerifItalic9pt7b); c.centered(roman(cur + 1) + " / " + roman(n), 194);
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    const Rows r = rowsOf(vm);
    const int n = static_cast<int>(r.items.size());
    switch (vm.place) {
      case Place::Menu:
        art.draw(c, watchId(vm.cursor), 68, 0, INK);
        c.hline(14, 62, 172, INK); c.hline(14, 64, 172, INK);
        rows(c, r, 88, 5, true);
        gear(c, 6, 5, r.gearOn, INK);
        return;
      case Place::Quotes: {
        c.font(vm.largeText ? &FreeSerifBold9pt7b : &FreeSerifItalic9pt7b);
        const auto lines = wrap(c, quotePage(vm), 172);
        for (size_t i = 0; i < lines.size(); ++i) c.centered(lines[i], 40 + static_cast<int>(i) * 19);
        const int end = 40 + static_cast<int>(lines.size()) * 19 + 6;
        if (!vm.source.empty()) { c.font(&FreeSerif9pt7b); c.right(fit(c, "- " + vm.source, 172), 186, end); }
        if (moreQuote(vm)) moreMark(c, 186, 120, INK);
        art.draw(c, "cameo", 64, 128, INK);
        return;
      }
      case Place::Settings:
        header(c, "Settings");
        rows(c, r, 52, 4, false);
        c.hline(14, 146, 172, INK);
        batteryPanel(c, 18, 158, s, &FreeSerifBold9pt7b, &FreeSerifItalic9pt7b, INK);
        return;
      case Place::Habits:
        header(c, "Habits " + std::to_string(done(r.checks)) + "/" + std::to_string(n));
        if (!n) break;
        rows(c, r, 52, 3, false);
        habitGraph(c, 16, 124, r.history[r.cur], Mark::Dot, INK);
        c.font(&FreeSerifItalic9pt7b); c.right("streak", 186, 150); c.right(streakText(r.history[r.cur]), 186, 168);
        return;
      default:
        header(c, vm.place == Place::Todos ? "Today " + std::to_string(done(r.checks)) + "/" + std::to_string(n) : pageTitle(vm));
        if (!n) break;
        rows(c, r, 52, 5, false);
        folio(c, r.cur, n);
        return;
    }
    c.font(&FreeSerifItalic9pt7b); c.centered(emptyNote(vm), 100);
  }

  void caption(Canvas& c, const ViewModel&, const std::string& text) const override {
    c.fillRect(0, 176, 200, 24, PAPER); c.hline(0, 176, 200, INK); c.hline(0, 178, 200, INK);
    c.font(&FreeSerifItalic9pt7b); c.centered(title(text), 194);
  }
};

// ---------------------------------------------------------------- B: Nodes
// The dashboard's network on the glass: a spine of nodes, the chosen one
// filled and large, a breadcrumb for where you are. The spine grows out of him.
class Nodes : public Look {
public:
  const char* name() const override { return "NODES"; }
  Corner corner(const ViewModel& vm, bool scene) const override {
    return { scene || vm.place == Place::Menu || vm.place == Place::Quotes ? 4 : 184, INK };
  }

  static void crumb(Canvas& c, const std::string& path) { small(c, path, 6, 7, INK); c.hline(6, 18, 60, INK); }
  static void spine(Canvas& c, const Rows& r, int visible, int toCat) {
    constexpr int X = 16, TOP = 38, STEP = 26;
    const int n = static_cast<int>(r.items.size());
    const int first = firstRow(std::max(r.cur, 0), visible);
    const int shown = std::min(n - first, visible);
    const int end = toCat ? 168 : TOP + (shown - 1) * STEP;
    for (int y = TOP; y <= end; y += 2) c.pixel(X, y, INK);
    if (toCat) for (int x = X; x < toCat; x += 2) c.pixel(x, 168, INK);
    for (int k = 0; k < shown; ++k) {
      const int i = first + k, y = TOP + k * STEP;
      const bool sel = i == r.cur;
      if (!r.checks.empty()) {
        const int d = sel ? 5 : 3;
        c.fillRect(X - d, y - d, 2 * d + 1, 2 * d + 1, r.checks[i] ? INK : PAPER);
        c.drawRect(X - d, y - d, 2 * d + 1, 2 * d + 1, INK);
      } else {
        c.fillCircle(X, y, sel ? 6 : 3, PAPER);
        if (sel) c.fillCircle(X, y, 5, INK); else c.drawCircle(X, y, 3, INK);
      }
      if (sel) {
        c.hline(X + 6, y, 8, INK);
        c.font(nullptr, 2); c.text(upper(r.items[i]).substr(0, r.values.empty() ? 14 : 7), 28, y - 7);
        if (!r.values.empty()) { c.font(nullptr, 1); c.right(upper(r.values[i]), 196, y - 3); }
      } else {
        small(c, upper(r.items[i]).substr(0, r.values.empty() ? 28 : 12), 28, y - 3, INK);
        if (!r.values.empty()) c.right(upper(r.values[i]), 196, y - 3);
      }
    }
    if (first + shown < n) small(c, "+" + std::to_string(n - first - shown), 10, end + 10, INK);
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    const Rows r = rowsOf(vm);
    const int n = static_cast<int>(r.items.size());
    const std::string path = "AURA-1 / " + upper(pageTitle(vm));
    switch (vm.place) {
      case Place::Menu:
        crumb(c, "AURA-1");
        spine(c, r, 5, 132);
        art.draw(c, watchId(vm.cursor), 132, 136, INK);
        gear(c, 58, 4, r.gearOn, INK);
        return;
      case Place::Quotes: {
        crumb(c, path + " " + std::to_string(vm.cursor + 1) + "/" + std::to_string(vm.items.size()));
        c.font(nullptr, vm.largeText ? 2 : 1);
        const int lh = vm.largeText ? 18 : 11;
        const auto lines = wrap(c, quotePage(vm), 166);
        const int h = static_cast<int>(lines.size()) * lh + 12;
        c.drawRoundRect(10, 28, 180, h, 6, INK); c.drawRoundRect(11, 29, 178, h - 2, 5, INK);
        for (size_t i = 0; i < lines.size(); ++i) c.text(lines[i], 18, 35 + static_cast<int>(i) * lh);
        c.fillTriangle(36, 28 + h - 2, 50, 28 + h - 2, 40, 28 + h + 12, INK);
        c.fillTriangle(39, 28 + h - 3, 47, 28 + h - 3, 41, 28 + h + 6, PAPER);
        if (!vm.source.empty()) small(c, fit(c, "- " + upper(vm.source), 110), 84, 28 + h + 8, INK);
        if (moreQuote(vm)) moreMark(c, 180, 28 + h + 4, INK);
        art.draw(c, "cameo", 8, 124, INK);
        return;
      }
      case Place::Settings:
        crumb(c, path);
        spine(c, r, 4, 0);
        batteryPanel(c, 28, 138, s, &FreeSansBold9pt7b, nullptr, INK);
        return;
      case Place::Habits:
        crumb(c, path + " " + std::to_string(done(r.checks)) + "/" + std::to_string(n));
        if (!n) break;
        spine(c, r, 3, 0);
        habitGraph(c, 28, 118, r.history[r.cur], Mark::Dot, INK);
        small(c, "STREAK", 124, 126, INK); c.font(nullptr, 2); c.text(std::to_string(streak(r.history[r.cur])), 124, 138);
        return;
      default:
        crumb(c, vm.place == Place::Todos ? path + " " + std::to_string(done(r.checks)) + "/" + std::to_string(n) : path);
        if (!n) break;
        spine(c, r, 6, 0);
        return;
    }
    small(c, upper(emptyNote(vm)), 28, 60, INK);
  }

  void caption(Canvas& c, const ViewModel&, const std::string& text) const override {
    const std::string t = upper(text);
    const int w = 6 * static_cast<int>(t.size()) + 26;
    c.fillRect(0, 0, w, 20, PAPER); c.hline(0, 20, w, INK); c.vline(w, 0, 21, INK);
    c.fillCircle(9, 10, 4, INK); c.hline(13, 10, 5, INK);
    small(c, t, 21, 7, INK);
  }
};

// ---------------------------------------------------------------- C: Focus
// One thing at a time, as SUN only ever steps forward: the chosen item large
// in the middle, its neighbours small above and below, dots for where you
// are, and him underneath looking up at it.
class Focus : public Look {
public:
  const char* name() const override { return "FOCUS"; }
  Corner corner(const ViewModel&, bool) const override { return { 4, INK }; }

  static void big(Canvas& c, const std::string& text, int y, int x0 = 0, int w = 200) {
    c.font(&FreeSansBold12pt7b);
    if (c.width(text) > w - 12) c.font(&FreeSansBold9pt7b);
    c.centered(fit(c, text, w - 8), y, INK, x0, w);
  }
  static void dots(Canvas& c, int cur, int n, int y) {
    if (n > 12) { c.font(nullptr, 1); c.centered(std::to_string(cur + 1) + " / " + std::to_string(n), y - 3); return; }
    const int x0 = 100 - (n - 1) * 5;
    for (int i = 0; i < n; ++i) if (i == cur) c.fillCircle(x0 + i * 10, y, 3, INK); else c.drawCircle(x0 + i * 10, y, 2, INK);
  }
  // Menu labels, where the settings stand as a small gear.
  static void neighbour(Canvas& c, const ViewModel& vm, int i, int y) {
    const int n = static_cast<int>(vm.items.size());
    i = (i % n + n) % n;
    if (i == vm.gear) { c.icon(94, y - 3, GEAR, 13); return; }
    c.font(nullptr, 1); c.centered(upper(vm.items[i]).substr(0, 30), y);
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    const int n = static_cast<int>(vm.items.size());
    const int cur = vm.cursor;
    c.font(nullptr, 1);
    if (vm.place == Place::Quotes) {
      c.centered("QUOTES", 6);
      c.font(vm.largeText ? &FreeSansBold12pt7b : &FreeSans9pt7b);
      const int lh = vm.largeText ? 24 : 18;
      const auto lines = wrap(c, quotePage(vm), 184);
      for (size_t i = 0; i < lines.size(); ++i) c.centered(lines[i], 36 + static_cast<int>(i) * lh);
      if (!vm.source.empty()) { c.font(nullptr, 1); c.centered(fit(c, upper(vm.source), 180), 36 + static_cast<int>(lines.size()) * lh); }
      if (moreQuote(vm)) moreMark(c, 186, 124, INK);
      art.draw(c, "watch-up", 68, 136, INK);
      return;
    }
    const Rows r = rowsOf(vm);
    const std::string head = vm.place == Place::Todos || vm.place == Place::Habits
      ? upper(pageTitle(vm)) + "  " + std::to_string(done(vm.checks)) + "/" + std::to_string(n) + " DONE" : upper(pageTitle(vm));
    c.centered(head, 6);
    if (!n) { c.centered(upper(emptyNote(vm)), 70); art.draw(c, "watch-up", 68, 136, INK); return; }
    if (n > 1) { neighbour(c, vm, cur - 1, 30); neighbour(c, vm, cur + 1, 98); }
    if (vm.place == Place::Menu && cur == vm.gear) {
      for (int j = 0; j < 13; ++j) for (int i = 0; GEAR[j][i]; ++i)
        if (GEAR[j][i] == '#') c.fillRect(70 + i * 2, 44 + j * 2, 2, 2, INK);
      c.font(&FreeSansBold9pt7b); c.text("Settings", 100, 70);
    } else if (!vm.checks.empty()) {
      c.font(&FreeSansBold12pt7b);
      const std::string t = fit(c, vm.items[cur], 150);
      const int w = c.width(t) + 26, x = 100 - w / 2;
      c.drawRect(x, 54, 17, 17, INK); c.drawRect(x + 1, 55, 15, 15, INK);
      if (vm.checks[cur]) c.fillRect(x + 4, 58, 9, 9, INK);
      c.text(t, x + 26, 70);
    } else if (!vm.values.empty()) {
      c.font(nullptr, 1); c.centered(upper(vm.items[cur]), 42);
      big(c, title(vm.values[cur]), 70);
    } else {
      big(c, vm.place == Place::Menu ? title(vm.items[cur]) : vm.items[cur], 70);
    }
    dots(c, cur, n, 120);
    if (vm.place == Place::Settings) batteryPanel(c, 26, 146, s, &FreeSansBold9pt7b, nullptr, INK);
    else if (vm.place == Place::Habits) {
      habitGraph(c, 58, 136, hist(vm, cur), Mark::Dot, INK);
      c.font(nullptr, 1); c.centered(upper(streakText(hist(vm, cur))) + " STREAK", 190);
    }
    else art.draw(c, "watch-up", 68, 136, INK);
    (void)r;
  }

  void caption(Canvas& c, const ViewModel& vm, const std::string& text) const override {
    const bool sealed = vm.screen == Screen::Stopped;
    c.font(sealed ? &FreeSansBold12pt7b : &FreeSansBold9pt7b);
    const int w = c.width(text) + 16;
    c.fillRect(100 - w / 2, sealed ? 174 : 180, w, 26, PAPER);
    c.centered(text, 195);
  }
};

// ---------------------------------------------------------------- D: Containment
// The Amygdala Inc. terminal he was locked in: a black masthead, a hazard
// band, numbered rows with a hard brutalist shadow, and him on a surveillance
// feed. Sessions play as camera footage.
class Containment : public Look {
public:
  const char* name() const override { return "CONTAINMENT"; }
  Corner corner(const ViewModel&, bool scene) const override { return scene ? Corner{ 2, INK } : Corner{ 3, PAPER }; }

  static void mast(Canvas& c) {
    c.fillRect(0, 0, 200, 17, INK);
    small(c, "AMYGDALA INC.", 4, 5, PAPER);
    for (int x = 0; x < 200; ++x) for (int j = 0; j < 4; ++j) if (((x + j) >> 2) % 2 == 0) c.pixel(x, 18 + j, INK);
  }
  static std::string num(int i) { return (i < 9 ? "0" : "") + std::to_string(i + 1); }
  static void rows(Canvas& c, const std::string& head, const Rows& r, int top, int step, int visible) {
    const int n = static_cast<int>(r.items.size());
    if (!head.empty()) {
      c.font(nullptr, 2); c.text(head, 6, 30);
      small(c, num(std::max(r.cur, 0)) + "/" + num(n - 1), 164, 34, INK);
    }
    const int first = firstRow(std::max(r.cur, 0), visible);
    for (int i = first; i < n && i < first + visible; ++i) {
      const int y = top + (i - first) * step;
      const bool sel = i == r.cur;
      const uint8_t fg = sel ? PAPER : INK;
      if (sel) { c.dither(9, y - 2, 188, step - 2, 2); c.fillRect(6, y - 5, 188, step - 2, INK); }
      small(c, num(i), 11, y + 2, fg);
      std::string label = upper(r.items[i]);
      if (!r.checks.empty()) label = std::string(r.checks[i] ? "[X] " : "[ ] ") + label;
      if (r.values.empty()) { c.font(nullptr, 2); c.text(label.substr(0, 14), 28, y - 2, fg); }
      else { small(c, label, 28, y + 2, fg); c.right(upper(r.values[i]), 188, y + 2, fg); }
    }
  }
  static void feed(Canvas& c, ArtSource& art, const std::string& id, int x, int y) {
    art.draw(c, id, x, y, INK);
    const int t[4][4] = { { x - 3, y - 3, 1, 1 }, { x + 66, y - 3, -1, 1 }, { x - 3, y + 66, 1, -1 }, { x + 66, y + 66, -1, -1 } };
    for (const auto& k : t) { c.hline(k[2] > 0 ? k[0] : k[0] - 6, k[1], 7, INK); c.vline(k[0], k[3] > 0 ? k[1] : k[1] - 6, 7, INK); }
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    mast(c);
    const Rows r = rowsOf(vm);
    const int n = static_cast<int>(r.items.size());
    switch (vm.place) {
      case Place::Menu:
        rows(c, "", r, 32, 20, 5);
        feed(c, art, watchId(vm.cursor), 130, 134);
        if (r.gearOn) c.fillRect(4, 131, 72, 19, INK);
        gear(c, 8, 134, false, r.gearOn ? PAPER : INK);
        small(c, "CONFIG", 26, 137, r.gearOn ? PAPER : INK);
        small(c, "SUBJECT KAEL'THOS", 6, 162, INK);
        small(c, "STATE   CONTAINED", 6, 176, INK);
        return;
      case Place::Quotes: {
        c.font(nullptr, 2); c.text("INTERCEPT", 6, 30);
        small(c, num(vm.cursor) + "/" + num(static_cast<int>(vm.items.size()) - 1), 164, 34, INK);
        c.font(nullptr, vm.largeText ? 2 : 1);
        const int lh = vm.largeText ? 18 : 11;
        const auto lines = wrap(c, upper(quotePage(vm)), 188);
        for (size_t i = 0; i < lines.size(); ++i) c.text(lines[i], 6, 52 + static_cast<int>(i) * lh);
        if (!vm.source.empty()) small(c, fit(c, "- " + upper(vm.source), 118), 6, 56 + static_cast<int>(lines.size()) * lh, INK);
        if (moreQuote(vm)) moreMark(c, 110, 190, INK);
        feed(c, art, "watch-left", 130, 134);
        return;
      }
      case Place::Settings:
        rows(c, "CONFIG", r, 52, 22, 4);
        c.hline(0, 144, 200, INK);
        small(c, "POWER CELL", 6, 150, INK);
        batteryPanel(c, 8, 164, s, &FreeSansBold9pt7b, nullptr, INK);
        return;
      case Place::Habits:
        rows(c, "HABITS", r, 52, 22, 3);
        if (!n) break;
        habitGraph(c, 8, 124, r.history[r.cur], Mark::Square, INK);
        small(c, "STREAK", 110, 128, INK); c.font(nullptr, 2); c.text(std::to_string(streak(r.history[r.cur])) + "D", 110, 142);
        return;
      default:
        rows(c, vm.place == Place::Todos ? "TODAY" : vm.place == Place::Activities ? (vm.top ? "INDEX" : "ACTIVITY") : upper(pageTitle(vm)), r, 52, 22, 6);
        if (!n) break;
        return;
    }
    small(c, upper(emptyNote(vm)), 6, 60, INK);
  }

  void caption(Canvas& c, const ViewModel& vm, const std::string& text) const override {
    c.fillRect(0, 0, 44, 15, PAPER); c.fillCircle(8, 7, 3, INK); small(c, "REC", 15, 4, INK);
    c.fillRect(0, 182, 200, 18, INK);
    small(c, (vm.screen == Screen::Stopped ? "LOG SEALED  " : "CAM 01  ") + upper(text), 6, 188, PAPER);
  }
};

// ---------------------------------------------------------------- E: Cathedral Ward
// Everything seen through a lancet arch: stone spandrels outside, Fraktur at
// the apex, sessions framed like a window.
class Cathedral : public Look {
public:
  const char* name() const override { return "CATHEDRAL"; }
  Corner corner(const ViewModel&, bool scene) const override { return { 4, scene ? PAPER : INK }; }

  // Half the arch's opening at row y: a pointed arch springing at y 110.
  static double half(int y) {
    constexpr double D = 12.8, R = 104.8, SPRING = 110;
    if (y >= SPRING) return 92;
    const double dy = SPRING - y;
    if (dy > std::sqrt(R * R - D * D)) return -1;
    return std::sqrt(R * R - dy * dy) - D;
  }
  static void arch(Canvas& c, bool ink) {
    for (int y = 0; y < 200; ++y) {
      const double h = half(y);
      const int l = h < 0 ? 100 : static_cast<int>(std::lround(100 - h)), r = h < 0 ? 100 : static_cast<int>(std::lround(100 + h));
      for (int x = 0; x < 200; ++x) {
        if (x >= l && x < r) continue;
        c.pixel(x, y, ink || ((x + y) % 2 == 0 && (x % 4 == 0 || y % 4 == 0)) ? INK : PAPER);
      }
      if (h >= 0) {
        c.fillRect(l - 1, y, 2, 1, INK); c.fillRect(r - 1, y, 2, 1, INK);
        const double h2 = half(y - 4) - 5;
        if (h2 > 0) { c.pixel(static_cast<int>(std::lround(100 - h2)), y, INK); c.pixel(static_cast<int>(std::lround(100 + h2)), y, INK); }
      }
    }
  }
  static void items(Canvas& c, const Rows& r, int top, int visible) {
    const int first = firstRow(std::max(r.cur, 0), visible);
    for (int i = first; i < static_cast<int>(r.items.size()) && i < first + visible; ++i) {
      const int y = top + (i - first) * 22;
      const bool sel = i == r.cur;
      std::string label = title(r.items[i]);
      if (!r.values.empty()) label += "  " + title(r.values[i]);
      c.font(sel ? &Fraktur14 : &Fell13);
      label = fit(c, label, 140);
      const int w = c.width(label);
      c.centered(label, y);
      if (sel) { c.icon(100 - w / 2 - 14, y - 10, CROSS, 7); c.icon(100 + w / 2 + 9, y - 10, CROSS, 7); }
      if (!r.checks.empty()) c.icon(22, y - 11, r.checks[i] ? CANDLE : CANDLE_OUT, 12);
    }
  }
  static void head(Canvas& c, const std::string& t) {
    c.font(&Fraktur20); c.centered(title(t), 52); c.hline(62, 60, 76, INK);
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    arch(c, false);
    const Rows r = rowsOf(vm);
    const int n = static_cast<int>(r.items.size());
    switch (vm.place) {
      case Place::Menu:
        art.draw(c, watchId(vm.cursor), 68, 10, INK);
        c.hline(40, 72, 120, INK);
        items(c, r, 96, 4);
        c.fillCircle(12, 11, 11, PAPER);
        gear(c, 6, 5, r.gearOn, INK);
        return;
      case Place::Quotes: {
        c.font(vm.largeText ? &Fraktur14 : &Fell13);
        const auto lines = wrap(c, quotePage(vm), 150);
        for (size_t i = 0; i < lines.size(); ++i) c.centered(lines[i], 56 + static_cast<int>(i) * 17);
        if (!vm.source.empty()) { c.font(&Fraktur14); c.centered(fit(c, title(vm.source), 140), 64 + static_cast<int>(lines.size()) * 17); }
        if (moreQuote(vm)) moreMark(c, 170, 116, INK);
        art.draw(c, "cameo", 64, 128, INK);
        return;
      }
      case Place::Settings:
        head(c, "Settings");
        items(c, r, 84, 4);
        batteryPanel(c, 36, 160, s, &Fraktur14, &Fell13, INK);
        return;
      case Place::Habits:
        head(c, "Habits");
        if (!n) break;
        items(c, r, 84, 2);
        habitGraph(c, 58, 120, r.history[r.cur], Mark::Dot, INK);
        c.font(&Fell13); c.centered(streakText(r.history[r.cur]) + " kept", 190);
        return;
      default:
        head(c, pageTitle(vm));
        if (!n) break;
        items(c, r, 88, 5);
        return;
    }
    c.font(&Fell13); c.centered(emptyNote(vm), 100);
  }

  void caption(Canvas& c, const ViewModel&, const std::string& text) const override {
    arch(c, true);
    c.fillRect(22, 178, 156, 22, PAPER); c.hline(22, 178, 156, INK);
    c.font(&Fraktur14); c.centered(title(text), 194);
  }
};

// ---------------------------------------------------------------- F: Byrgenwerth
// The college's manuscripts: an illuminated capital, a table of contents with
// dotted leaders and folio numerals, a pointing hand in the margin, and him in
// the margin too.
class Byrgenwerth : public Look {
public:
  const char* name() const override { return "BYRGENWERTH"; }
  Corner corner(const ViewModel&, bool scene) const override { return { scene ? 4 : 184, INK }; }

  static void capital(Canvas& c, char letter, int x, int y) {
    c.fillRect(x, y, 34, 34, INK); c.drawRect(x + 2, y + 2, 30, 30, PAPER);
    c.font(&Fraktur20);
    const std::string l(1, letter);
    c.text(l, x + 17 - c.width(l) / 2, y + 25, PAPER);
  }
  static void head(Canvas& c, const std::string& word) {
    const std::string w = title(word);
    capital(c, w[0], 8, 6);
    c.font(&Fraktur20); c.text(w.substr(1), 44, 30); c.hline(44, 36, 100, INK);
  }
  static void toc(Canvas& c, const Rows& r, int top, int visible) {
    const int first = firstRow(std::max(r.cur, 0), visible);
    const bool checks = !r.checks.empty();
    for (int i = first; i < static_cast<int>(r.items.size()) && i < first + visible; ++i) {
      const int y = top + (i - first) * 21;
      const int x = checks ? 44 : 30;
      if (checks) {
        c.drawRect(28, y - 9, 9, 9, INK);
        if (r.checks[i]) { c.line(27, y - 11, 38, y, INK); c.line(38, y - 11, 27, y, INK); }
      }
      const std::string right = r.values.empty() ? roman(i + 1) : title(r.values[i]);
      c.font(r.values.empty() ? &Fraktur14 : &Fell13);
      const int rw = c.width(right);
      c.text(right, 192 - rw, y);
      c.font(&Fell13);
      const std::string label = fit(c, title(r.items[i]), 186 - rw - x);
      c.text(label, x, y);
      for (int lx = x + c.width(label) + 4; lx < 188 - rw; lx += 4) c.pixel(lx, y - 1, INK);
      if (i == r.cur) c.icon(x - (checks ? 30 : 16) - 1, y - 8, HAND, 8);
    }
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    const Rows r = rowsOf(vm);
    const int n = static_cast<int>(r.items.size());
    switch (vm.place) {
      case Place::Menu:
        head(c, "Contents");
        toc(c, r, 62, 5);
        art.draw(c, watchId(vm.cursor), 136, 136, INK);
        if (r.gearOn) c.icon(160, 18, HAND, 8);
        gear(c, 180, 14, r.gearOn, INK);
        return;
      case Place::Quotes: {
        const std::string q = quotePage(vm);
        if (q.empty()) return;
        capital(c, static_cast<char>(std::toupper(static_cast<unsigned char>(q[0]))), 8, 8);
        c.font(vm.largeText ? &Fraktur14 : &Fell13);
        const int lh = vm.largeText ? 19 : 16;
        const auto beside = wrap(c, q.substr(1), 140);
        std::string rest;
        for (size_t i = 0; i < beside.size(); ++i) {
          if (i < 2) c.text(beside[i], 48, 20 + static_cast<int>(i) * lh);
          else rest += (rest.empty() ? "" : " ") + beside[i];
        }
        const auto lines = wrap(c, rest, 184);
        for (size_t i = 0; i < lines.size(); ++i) c.text(lines[i], 8, 56 + static_cast<int>(i) * lh);
        if (!vm.source.empty()) { c.font(&Fraktur14); c.right(fit(c, title(vm.source), 120), 192, 62 + static_cast<int>(lines.size()) * lh); }
        if (moreQuote(vm)) moreMark(c, 110, 190, INK);
        art.draw(c, "watch-left", 136, 136, INK);
        return;
      }
      case Place::Settings:
        head(c, "Settings");
        toc(c, r, 62, 4);
        batteryPanel(c, 30, 148, s, &Fraktur14, &Fell13, INK);
        return;
      case Place::Habits:
        head(c, "Habits");
        if (!n) break;
        toc(c, r, 62, 3);
        habitGraph(c, 30, 128, r.history[r.cur], Mark::Dot, INK);
        c.font(&Fell13); c.text("kept", 124, 146); c.font(&Fraktur14); c.text(streakText(r.history[r.cur]), 124, 164);
        return;
      default:
        head(c, pageTitle(vm));
        if (!n) break;
        toc(c, r, 62, 6);
        return;
    }
    c.font(&Fell13); c.text(emptyNote(vm), 30, 70);
  }

  void caption(Canvas& c, const ViewModel&, const std::string& text) const override {
    c.fillRect(0, 174, 200, 26, PAPER); c.hline(0, 174, 200, INK); c.hline(4, 177, 192, INK);
    c.font(&Fraktur14); c.centered(title(text), 194);
  }
};

// ---------------------------------------------------------------- G: Hunter's Dream
// Every item a headstone in the Dream's garden, walked past one at a time:
// the chosen stone in the middle, carved, the next ones at the edges. He
// peeks from behind the stone.
class Dream : public Look {
public:
  const char* name() const override { return "DREAM"; }
  Corner corner(const ViewModel& vm, bool scene) const override { return { !scene && vm.place == Place::Quotes ? 184 : 4, INK }; }

  static void stone(Canvas& c, int cx, int w, int h, int ground, bool big) {
    const int x = cx - w / 2, top = ground - h, r = w / 2;
    c.fillCircle(cx, top + r, r, INK); c.fillRect(x, top + r, w, h - r, INK);
    c.fillCircle(cx, top + r, r - 2, PAPER); c.fillRect(x + 2, top + r, w - 4, h - r, PAPER);
    if (big) {
      c.drawCircle(cx, top + r, r - 5, INK); c.fillRect(x + 5, top + r, w - 10, h - r, PAPER);
      c.vline(x + 5, top + r, h - r - 6, INK); c.vline(x + w - 6, top + r, h - r - 6, INK);
      c.dither(x + 2, ground - 8, w - 4, 8, 1);
    }
  }
  static void carve(Canvas& c, const std::string& text, int y, const std::string& sub = "") {
    c.font(&Cinzel14);
    const auto lines = wrap(c, upper(text), 84);
    const int n = std::min<int>(3, static_cast<int>(lines.size()));
    for (int i = 0; i < n; ++i) c.centered(lines[i], y + i * 18 - (n - 1) * 9);
    if (!sub.empty()) { c.font(&Cinzel11); c.centered(fit(c, upper(sub), 84), y + 22); }
  }
  static void garden(Canvas& c, ArtSource* art, const std::string& head, int cur, int n, int watchCursor, bool moon) {
    constexpr int GROUND = 168;
    if (moon) { c.fillCircle(30, 34, 14, INK); c.fillCircle(36, 30, 12, PAPER); }
    c.font(&Cinzel11); c.text(upper(head), 58, 16);
    stone(c, 16, 40, 48, GROUND, false);
    stone(c, 184, 40, 48, GROUND, false);
    if (art) art->draw(c, watchId(watchCursor), 68, 20, INK);
    stone(c, 100, 104, 96, GROUND, true);
    c.hline(0, GROUND, 200, INK); c.hline(0, GROUND + 1, 200, INK);
    for (int gx : { 8, 44, 60, 140, 150, 176 }) { c.line(gx, GROUND - 1, gx - 2, GROUND - 5, INK); c.line(gx + 2, GROUND - 1, gx + 3, GROUND - 6, INK); }
    if (n) { c.font(&Cinzel11); c.centered(upper(roman(cur + 1)) + "  /  " + upper(roman(n)), 188); }
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    const int n = static_cast<int>(vm.items.size()), cur = vm.cursor;
    if (vm.place == Place::Quotes) {
      c.font(vm.largeText ? &Cinzel14 : &Cinzel11);
      const int lh = vm.largeText ? 20 : 16;
      const auto lines = wrap(c, upper(quotePage(vm)), 176);
      for (size_t i = 0; i < lines.size(); ++i) c.centered(lines[i], 30 + static_cast<int>(i) * lh);
      if (!vm.source.empty()) { c.font(&Cinzel11); c.centered(fit(c, "- " + upper(vm.source) + " -", 176), 36 + static_cast<int>(lines.size()) * lh); }
      if (moreQuote(vm)) moreMark(c, 186, 120, INK);
      art.draw(c, "cameo", 64, 128, INK);
      return;
    }
    const bool settings = vm.place == Place::Settings, habits = vm.place == Place::Habits;
    garden(c, settings || habits ? nullptr : &art, pageTitle(vm), cur, n, cur, !settings);
    if (!n) { carve(c, emptyNote(vm), 124); return; }
    if (vm.place == Place::Menu && cur == vm.gear) {
      for (int j = 0; j < 13; ++j) for (int i = 0; GEAR[j][i]; ++i)
        if (GEAR[j][i] == '#') c.fillRect(87 + i * 2, 100 + j * 2, 2, 2, INK);
      c.font(&Cinzel11); c.centered("SETTINGS", 146);
    } else if (settings) {
      carve(c, vm.items[cur], 120, vm.values[cur]);
      batteryPanel(c, 10, 28, s, &Cinzel14, &Cinzel11, INK);
    } else if (habits) {
      c.font(&Cinzel11); c.centered(fit(c, upper(vm.items[cur]), 84), 104);
      habitGraph(c, 58, 110, hist(vm, cur), Mark::Dot, INK);
      c.font(&Cinzel14); c.centered(std::to_string(streak(hist(vm, cur))), 44);
      c.font(&Cinzel11); c.centered("DAYS KEPT", 58);
      if (vm.checks[cur]) c.icon(158, 156, CANDLE, 12); else c.icon(158, 156, CANDLE_OUT, 12);
    } else {
      carve(c, vm.items[cur], 124);
      if (!vm.checks.empty()) c.icon(158, 156, vm.checks[cur] ? CANDLE : CANDLE_OUT, 12);
    }
    if (vm.place == Place::Menu) gear(c, 6, 178, false, INK);
  }

  void caption(Canvas& c, const ViewModel& vm, const std::string& text) const override {
    c.fillRect(0, 178, 200, 22, PAPER); c.hline(0, 178, 200, INK);
    const bool epitaph = vm.screen == Screen::Stopped && vm.minutes >= 10;
    c.font(&Cinzel14); c.centered(fit(c, upper(epitaph ? "Here lies " + text : text), 196), 195);
  }
};

// ---------------------------------------------------------------- H: Blood Moon
// The glass turned to night: ink everywhere, a dithered moon, Pirata type in
// paper, the chosen row a paper bar that drips. He shows as his hologram, in
// negative; sessions play as negatives too.
class BloodMoon : public Look {
public:
  const char* name() const override { return "BLOOD MOON"; }
  bool negative() const override { return true; }
  Corner corner(const ViewModel&, bool scene) const override { return { scene ? 4 : 184, PAPER }; }

  static void night(Canvas& c) {
    c.clear(INK);
    for (int y = 0; y < 72; ++y) for (int x = 130; x < 200; ++x) {
      const double d = std::hypot(x - 176, y - 26);
      if (d < 44 && (x + y) % 2 == 0 && (d > 40 || (x * 7 + y * 3) % 5 != 0)) c.pixel(x, y, PAPER);
    }
  }
  static void rows(Canvas& c, const std::string& head, const Rows& r, int visible) {
    c.font(&Pirata24); c.text(title(head), 10, 40, PAPER);
    const int first = firstRow(std::max(r.cur, 0), visible);
    for (int i = first; i < static_cast<int>(r.items.size()) && i < first + visible; ++i) {
      const int y = 70 + (i - first) * 24;
      const bool sel = i == r.cur;
      const uint8_t fg = sel ? INK : PAPER;
      if (sel) {
        c.fillRect(0, y - 16, 200, 22, PAPER);
        const int drips[5][2] = { { 30, 5 }, { 58, 9 }, { 66, 4 }, { 120, 7 }, { 170, 11 } };
        for (const auto& d : drips) { c.fillRect(d[0], y + 6, 2, d[1], PAPER); c.fillCircle(d[0], y + 6 + d[1], 2, PAPER); }
      }
      c.font(sel ? &Pirata18 : &Pirata13);
      int x = 12;
      if (!r.checks.empty()) {
        c.drawRect(12, y - 10, 10, 10, fg);
        if (r.checks[i]) c.fillRect(14, y - 8, 6, 6, fg);
        x = 30;
      }
      c.text(fit(c, title(r.items[i]), r.values.empty() ? 186 - x : 100), x, y, fg);
      if (!r.values.empty()) c.right(title(r.values[i]), 190, y, fg);
    }
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    night(c);
    const Rows r = rowsOf(vm);
    const int n = static_cast<int>(r.items.size());
    switch (vm.place) {
      case Place::Menu:
        rows(c, "Aura", r, 5);
        art.draw(c, watchId(vm.cursor), 136, 136, PAPER);
        c.fillCircle(176, 26, 11, r.gearOn ? PAPER : INK);
        c.icon(170, 20, GEAR, 13, r.gearOn ? INK : PAPER);
        return;
      case Place::Quotes: {
        c.font(vm.largeText ? &Pirata18 : &Pirata13);
        const int lh = vm.largeText ? 22 : 18;
        const auto lines = wrap(c, quotePage(vm), 150);
        for (size_t i = 0; i < lines.size(); ++i) c.text(lines[i], 12, 30 + static_cast<int>(i) * lh, PAPER);
        if (!vm.source.empty()) { c.font(&Pirata18); c.text(fit(c, title(vm.source), 120), 12, 42 + static_cast<int>(lines.size()) * lh, PAPER); }
        if (moreQuote(vm)) moreMark(c, 110, 190, PAPER);
        art.draw(c, "watch-left", 136, 136, PAPER);
        return;
      }
      case Place::Settings:
        rows(c, "Settings", r, 4);
        batteryPanel(c, 12, 150, s, &Pirata18, &Pirata13, PAPER);
        return;
      case Place::Habits:
        rows(c, "Habits", r, 3);
        if (!n) break;
        habitGraph(c, 12, 136, r.history[r.cur], Mark::Dot, PAPER);
        c.font(&Pirata13); c.text("streak", 110, 150, PAPER); c.font(&Pirata18); c.text(streakText(r.history[r.cur]), 110, 170, PAPER);
        return;
      default:
        rows(c, pageTitle(vm), r, 5);
        if (!n) break;
        return;
    }
    c.font(&Pirata13); c.text(emptyNote(vm), 12, 80, PAPER);
  }

  void caption(Canvas& c, const ViewModel&, const std::string& text) const override {
    c.fillRect(0, 176, 200, 24, INK);
    c.font(&Pirata18); c.centered(title(text), 194, PAPER);
  }
};

// ---------------------------------------------------------------- I: The Rite
// A summoning circle: the items stand around the ring, the chosen one turned
// to the top, and he is summoned in the middle.
class Rite : public Look {
public:
  const char* name() const override { return "RITE"; }
  Corner corner(const ViewModel&, bool) const override { return { 4, INK }; }

  static constexpr int CX = 100, CY = 112, R = 62;
  static void ring(Canvas& c) {
    c.drawCircle(CX, CY, R, INK); c.drawCircle(CX, CY, R - 3, INK); c.drawCircle(CX, CY, R - 14, INK);
    for (int k = 0; k < 40; k += 5) {
      const double a = k / 40.0 * HALF_TURN * 2;
      c.line(static_cast<int>(CX + std::cos(a) * (R - 4)), static_cast<int>(CY + std::sin(a) * (R - 4)),
             static_cast<int>(CX + std::cos(a) * (R - 12)), static_cast<int>(CY + std::sin(a) * (R - 12)), INK);
    }
    // A five-pointed star within, dotted.
    for (int k = 0; k < 5; ++k) {
      const double a0 = (k * 2 % 5) / 5.0 * HALF_TURN * 2, a1 = ((k + 1) * 2 % 5) / 5.0 * HALF_TURN * 2;
      const double x0 = CX + std::sin(a0) * (R - 15), y0 = CY - std::cos(a0) * (R - 15);
      const double x1 = CX + std::sin(a1) * (R - 15), y1 = CY - std::cos(a1) * (R - 15);
      for (int t = 0; t <= 50; t += 2) c.pixel(static_cast<int>(x0 + (x1 - x0) * t / 50), static_cast<int>(y0 + (y1 - y0) * t / 50), INK);
    }
  }
  // The labels around the ring, the chosen one at the top; up to eight show.
  static void labels(Canvas& c, const ViewModel& vm) {
    const int n = static_cast<int>(vm.items.size());
    const int slots = std::min(n, 8);
    for (int k = -(slots - 1) / 2; k <= slots / 2; ++k) {
      const int i = ((vm.cursor + k) % n + n) % n;
      const double a = static_cast<double>(k) / slots * HALF_TURN * 2 - HALF_TURN / 2;
      const int x = static_cast<int>(CX + std::cos(a) * R), y = static_cast<int>(CY + std::sin(a) * R);
      const bool sel = k == 0;
      std::string text = vm.place == Place::Menu || !vm.values.empty() ? title(vm.items[i]) : vm.items[i];
      if (!vm.values.empty()) text += " " + title(vm.values[i]);
      if (!vm.checks.empty() && vm.checks[i]) text = "+ " + text;
      c.font(sel ? &Grenze18 : &Grenze13);
      text = fit(c, text, sel ? 150 : 84);
      const bool isGear = i == vm.gear;
      const int w = isGear ? 21 : c.width(text) + 10, h = sel ? 22 : 17;
      const int bx = std::max(2, std::min(198 - w, x - w / 2)), by = y - h / 2;
      c.fillRect(bx, by, w, h, sel ? INK : PAPER);
      if (!sel) c.drawRect(bx, by, w, h, INK);
      if (isGear) c.icon(bx + 4, by + (h - 13) / 2, GEAR, 13, sel ? PAPER : INK);
      else c.text(text, bx + 5, by + h - 5, sel ? PAPER : INK);
    }
  }

  void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const override {
    const int n = static_cast<int>(vm.items.size());
    std::string head = title(pageTitle(vm));
    if (vm.place == Place::Todos || vm.place == Place::Habits) head += "  " + std::to_string(done(vm.checks)) + "/" + std::to_string(n);
    if (vm.place == Place::Quotes) {
      c.font(vm.largeText ? &Grenze18 : &Grenze13);
      const int lh = vm.largeText ? 22 : 18;
      const auto lines = wrap(c, quotePage(vm), 176);
      for (size_t i = 0; i < lines.size(); ++i) c.centered(lines[i], 30 + static_cast<int>(i) * lh);
      if (!vm.source.empty()) { c.font(&Grenze18); c.centered(fit(c, title(vm.source), 176), 40 + static_cast<int>(lines.size()) * lh); }
      if (moreQuote(vm)) moreMark(c, 186, 124, INK);
      art.draw(c, "cameo", 64, 128, INK);
      return;
    }
    c.font(&Grenze13); c.text(head, 6, 16);
    ring(c);
    if (!n) { c.font(&Grenze13); c.centered(emptyNote(vm), CY + 4); return; }
    if (vm.place == Place::Habits) {
      c.fillCircle(CX, CY, R - 15, PAPER);
      habitGraph(c, CX - GRAPH_W / 2, CY - 30, hist(vm, vm.cursor), Mark::Dot, INK);
      c.font(&Grenze13); c.centered(streakText(hist(vm, vm.cursor)), CY + 36);
    } else if (vm.place == Place::Settings) {
      c.fillCircle(CX, CY, R - 15, PAPER);
      batteryPanel(c, CX - 24, CY - 22, s, &Grenze18, nullptr, INK, true);
    } else {
      c.fillCircle(CX, CY, R - 15, PAPER);
      art.draw(c, watchId(vm.cursor), CX - 32, CY - 36, INK);
    }
    labels(c, vm);
  }

  void caption(Canvas& c, const ViewModel&, const std::string& text) const override {
    c.fillRect(0, 176, 200, 24, PAPER); c.hline(0, 176, 200, INK);
    c.font(&Grenze18); c.centered(title(text), 195);
  }
};

const Codex CODEX;
const Nodes NODES;
const Focus FOCUS;
const Containment CONTAINMENT;
const Cathedral CATHEDRAL;
const Byrgenwerth BYRGENWERTH;
const Dream DREAM;
const BloodMoon BLOOD_MOON;
const Rite RITE;
const Look* const LOOKS[] = { &CODEX, &NODES, &FOCUS, &CONTAINMENT, &CATHEDRAL, &BYRGENWERTH, &DREAM, &BLOOD_MOON, &RITE };

}  // namespace

int lookCount() { return sizeof(LOOKS) / sizeof(LOOKS[0]); }

const Look& look(int index) {
  const int n = lookCount();
  return *LOOKS[((index % n) + n) % n];
}

int lookIndex(const std::string& name) {
  for (int i = 0; i < lookCount(); ++i) if (name == LOOKS[i]->name()) return i;
  return 0;
}

void drawCorner(Canvas& c, int y, const Status& s, uint8_t ink) {
  constexpr int X = 172, BW = 22, BH = 12;
  c.fillRect(X - 22, y - 2, 50, BH + 4, other(ink));
  c.drawRect(X, y, BW, BH, ink);
  c.fillRect(X + BW, y + 3, 2, BH - 6, ink);
  if (s.charging) c.icon(X + 8, y + 2, BOLT, 8, ink);
  else for (int q = 0; q < s.bars; ++q) c.fillRect(X + 2 + q * 5, y + 2, 4, BH - 4, ink);
  if (s.link != Link::Online) c.icon(X - 20, y - 2, s.link == Link::Syncing ? SPIRAL : CACTUS, 16, ink);
}
