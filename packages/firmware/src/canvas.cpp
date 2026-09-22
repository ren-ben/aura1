#include "canvas.h"
#include <algorithm>
#include <cstdlib>
#include "classic_font.h"

// The drawing follows Adafruit GFX, so a look reads the same as on a GFX
// display; only the pixels land in our own buffer.

void Canvas::clear(uint8_t c) {
  std::fill(buf_, buf_ + sizeof buf_, c ? 0xFF : 0x00);
}

void Canvas::pixel(int x, int y, uint8_t c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  uint8_t& b = buf_[y * (W / 8) + (x >> 3)];
  const uint8_t m = 0x80 >> (x & 7);
  b = c ? (b | m) : (b & ~m);
}

bool Canvas::get(int x, int y) const {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  return buf_[y * (W / 8) + (x >> 3)] & (0x80 >> (x & 7));
}

void Canvas::fillRect(int x, int y, int w, int h, uint8_t c) {
  const int x0 = std::max(x, 0), x1 = std::min(x + w, W), y0 = std::max(y, 0), y1 = std::min(y + h, H);
  for (int j = y0; j < y1; ++j) for (int i = x0; i < x1; ++i) pixel(i, j, c);
}

void Canvas::drawRect(int x, int y, int w, int h, uint8_t c) {
  hline(x, y, w, c); hline(x, y + h - 1, w, c);
  vline(x, y, h, c); vline(x + w - 1, y, h, c);
}

void Canvas::line(int x0, int y0, int x1, int y1, uint8_t c) {
  const bool steep = std::abs(y1 - y0) > std::abs(x1 - x0);
  if (steep) { std::swap(x0, y0); std::swap(x1, y1); }
  if (x0 > x1) { std::swap(x0, x1); std::swap(y0, y1); }
  const int dx = x1 - x0, dy = std::abs(y1 - y0), ys = y0 < y1 ? 1 : -1;
  int err = dx / 2;
  for (; x0 <= x1; ++x0) {
    if (steep) pixel(y0, x0, c); else pixel(x0, y0, c);
    err -= dy;
    if (err < 0) { y0 += ys; err += dx; }
  }
}

void Canvas::dither(int x, int y, int w, int h, int level, uint8_t c) {
  for (int j = y; j < y + h; ++j) for (int i = x; i < x + w; ++i) {
    const bool even = i % 2 == 0 && j % 2 == 0;
    const bool on = level == 2 ? (i + j) % 2 == 0 : level == 1 ? even : !even;
    if (on) pixel(i, j, c);
  }
}

void Canvas::circleHelper(int x0, int y0, int r, int corner, uint8_t c) {
  int f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
  while (x < y) {
    if (f >= 0) { --y; ddy += 2; f += ddy; }
    ++x; ddx += 2; f += ddx;
    if (corner & 4) { pixel(x0 + x, y0 + y, c); pixel(x0 + y, y0 + x, c); }
    if (corner & 2) { pixel(x0 + x, y0 - y, c); pixel(x0 + y, y0 - x, c); }
    if (corner & 8) { pixel(x0 - y, y0 + x, c); pixel(x0 - x, y0 + y, c); }
    if (corner & 1) { pixel(x0 - y, y0 - x, c); pixel(x0 - x, y0 - y, c); }
  }
}

void Canvas::drawCircle(int x0, int y0, int r, uint8_t c) {
  pixel(x0, y0 + r, c); pixel(x0, y0 - r, c); pixel(x0 + r, y0, c); pixel(x0 - r, y0, c);
  circleHelper(x0, y0, r, 15, c);
}

void Canvas::fillCircleHelper(int x0, int y0, int r, int corners, int delta, uint8_t c) {
  int f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r, px = x, py = y;
  ++delta;
  while (x < y) {
    if (f >= 0) { --y; ddy += 2; f += ddy; }
    ++x; ddx += 2; f += ddx;
    if (x < y + 1) {
      if (corners & 1) vline(x0 + x, y0 - y, 2 * y + delta, c);
      if (corners & 2) vline(x0 - x, y0 - y, 2 * y + delta, c);
    }
    if (y != py) {
      if (corners & 1) vline(x0 + py, y0 - px, 2 * px + delta, c);
      if (corners & 2) vline(x0 - py, y0 - px, 2 * px + delta, c);
      py = y;
    }
    px = x;
  }
}

void Canvas::fillCircle(int x0, int y0, int r, uint8_t c) {
  vline(x0, y0 - r, 2 * r + 1, c);
  fillCircleHelper(x0, y0, r, 3, 0, c);
}

void Canvas::drawRoundRect(int x, int y, int w, int h, int r, uint8_t c) {
  hline(x + r, y, w - 2 * r, c); hline(x + r, y + h - 1, w - 2 * r, c);
  vline(x, y + r, h - 2 * r, c); vline(x + w - 1, y + r, h - 2 * r, c);
  circleHelper(x + r, y + r, r, 1, c); circleHelper(x + w - r - 1, y + r, r, 2, c);
  circleHelper(x + w - r - 1, y + h - r - 1, r, 4, c); circleHelper(x + r, y + h - r - 1, r, 8, c);
}

void Canvas::fillRoundRect(int x, int y, int w, int h, int r, uint8_t c) {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillCircleHelper(x + w - r - 1, y + r, r, 1, h - 2 * r - 1, c);
  fillCircleHelper(x + r, y + r, r, 2, h - 2 * r - 1, c);
}

void Canvas::fillTriangle(int x0, int y0, int x1, int y1, int x2, int y2, uint8_t c) {
  if (y0 > y1) { std::swap(y0, y1); std::swap(x0, x1); }
  if (y1 > y2) { std::swap(y2, y1); std::swap(x2, x1); }
  if (y0 > y1) { std::swap(y0, y1); std::swap(x0, x1); }
  if (y0 == y2) {
    const int a = std::min({ x0, x1, x2 }), b = std::max({ x0, x1, x2 });
    hline(a, y0, b - a + 1, c);
    return;
  }
  const int dx01 = x1 - x0, dy01 = y1 - y0, dx02 = x2 - x0, dy02 = y2 - y0, dx12 = x2 - x1, dy12 = y2 - y1;
  int sa = 0, sb = 0, y = y0;
  const int last = y1 == y2 ? y1 : y1 - 1;
  for (; y <= last; ++y) {
    int a = x0 + sa / dy01, b = x0 + sb / dy02;
    sa += dx01; sb += dx02;
    if (a > b) std::swap(a, b);
    hline(a, y, b - a + 1, c);
  }
  sa = dx12 * (y - y1); sb = dx02 * (y - y0);
  for (; y <= y2; ++y) {
    int a = x1 + sa / dy12, b = x0 + sb / dy02;
    sa += dx12; sb += dx02;
    if (a > b) std::swap(a, b);
    hline(a, y, b - a + 1, c);
  }
}

void Canvas::bitmap(int x, int y, const uint8_t* bits, int w, int h, uint8_t c) {
  const int stride = (w + 7) / 8;
  for (int j = 0; j < h; ++j) for (int i = 0; i < w; ++i)
    if (bits[j * stride + (i >> 3)] & (0x80 >> (i & 7))) pixel(x + i, y + j, c);
}

void Canvas::icon(int x, int y, const char* const* rows, int n, uint8_t c) {
  for (int j = 0; j < n; ++j)
    for (int i = 0; rows[j][i]; ++i)
      if (rows[j][i] == '#') pixel(x + i, y + j, c);
}

int Canvas::glyph(char ch, int x, int y, uint8_t c) {
  const uint8_t code = static_cast<uint8_t>(ch);
  if (!font_) {
    for (int i = 0; i < 5; ++i) {
      uint8_t col = CLASSIC_FONT[code * 5 + i];
      for (int j = 0; j < 8; ++j, col >>= 1)
        if (col & 1) fillRect(x + i * size_, y + j * size_, size_, size_, c);
    }
    return 6 * size_;
  }
  if (code < font_->first || code > font_->last) return 0;
  const GFXglyph& g = font_->glyph[code - font_->first];
  const uint8_t* bits = font_->bitmap + g.bitmapOffset;
  int bit = 0;
  uint8_t byte = 0;
  for (int yy = 0; yy < g.height; ++yy) for (int xx = 0; xx < g.width; ++xx) {
    if (!(bit++ & 7)) byte = *bits++;
    if (byte & 0x80) fillRect(x + (g.xOffset + xx) * size_, y + (g.yOffset + yy) * size_, size_, size_, c);
    byte <<= 1;
  }
  return g.xAdvance * size_;
}

int Canvas::text(const std::string& s, int x, int y, uint8_t c) {
  for (char ch : s) x += glyph(ch, x, y, c);
  return x;
}

int Canvas::width(const std::string& s) const {
  if (!font_) return static_cast<int>(s.size()) * 6 * size_;
  int w = 0;
  for (char ch : s) {
    const uint8_t code = static_cast<uint8_t>(ch);
    if (code >= font_->first && code <= font_->last) w += font_->glyph[code - font_->first].xAdvance * size_;
  }
  return w;
}

void Canvas::centered(const std::string& s, int y, uint8_t c, int x0, int w) {
  text(s, x0 + (w - width(s)) / 2, y, c);
}
