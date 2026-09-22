#pragma once
#include <cstdint>
#include <string>
#include <Adafruit_GFX.h>  // GFXfont; on the host a shim in test/shim

// The screen as 1-bit pixels in GxEPD2's bitmap layout (rows of bytes, most
// significant bit first, 1 = ink). Every look draws here, on the device and
// in host tests alike; the renderer then pushes it to the glass.
constexpr uint8_t INK = 1, PAPER = 0;

class Canvas {
public:
  static constexpr int W = 200, H = 200;

  void clear(uint8_t c = PAPER);
  void pixel(int x, int y, uint8_t c);
  bool get(int x, int y) const;
  const uint8_t* bits() const { return buf_; }
  uint8_t* bits() { return buf_; }

  void fillRect(int x, int y, int w, int h, uint8_t c);
  void hline(int x, int y, int w, uint8_t c) { fillRect(x, y, w, 1, c); }
  void vline(int x, int y, int h, uint8_t c) { fillRect(x, y, 1, h, c); }
  void drawRect(int x, int y, int w, int h, uint8_t c);
  void line(int x0, int y0, int x1, int y1, uint8_t c);
  // Sets ink over a rect: level 1 a quarter, 2 half (checker), 3 three quarters.
  void dither(int x, int y, int w, int h, int level, uint8_t c = INK);
  void drawCircle(int x0, int y0, int r, uint8_t c);
  void fillCircle(int x0, int y0, int r, uint8_t c);
  void drawRoundRect(int x, int y, int w, int h, int r, uint8_t c);
  void fillRoundRect(int x, int y, int w, int h, int r, uint8_t c);
  void fillTriangle(int x0, int y0, int x1, int y1, int x2, int y2, uint8_t c);
  // A 1-bit bitmap: its set bits in colour c, the rest left alone.
  void bitmap(int x, int y, const uint8_t* bits, int w, int h, uint8_t c = INK);
  // A small icon as rows of '#' and '.'.
  void icon(int x, int y, const char* const* rows, int n, uint8_t c = INK);

  // Text. font null: the classic 6x8 font scaled by size, from the top-left.
  // A GFX font: from the baseline. Returns the x after the text.
  void font(const GFXfont* f, int size = 1) { font_ = f; size_ = size; }
  const GFXfont* font() const { return font_; }
  int text(const std::string& s, int x, int y, uint8_t c = INK);
  int width(const std::string& s) const;
  void centered(const std::string& s, int y, uint8_t c = INK, int x0 = 0, int w = W);
  void right(const std::string& s, int xr, int y, uint8_t c = INK) { text(s, xr - width(s), y, c); }

private:
  void circleHelper(int x0, int y0, int r, int corner, uint8_t c);
  void fillCircleHelper(int x0, int y0, int r, int corners, int delta, uint8_t c);
  int glyph(char ch, int x, int y, uint8_t c);

  uint8_t buf_[W * H / 8] = {};
  const GFXfont* font_ = nullptr;
  int size_ = 1;
};
