#pragma once
#include <cstdint>
#include <string>
#include "canvas.h"
#include "status.h"
#include "view_model.h"

// Where a look gets Kael'thos from: the art pack's heads and busts, drawn in
// a colour. "watch" is his head, eyes on the cursor; "cameo" a bust of any
// mood. False when the pack does not have it.
class ArtSource {
public:
  virtual ~ArtSource() = default;
  virtual bool draw(Canvas& c, const std::string& id, int x, int y, uint8_t colour) = 0;
};

struct Corner { int y; uint8_t ink; };

// Where a look sets a quote: its font, the width of a line and how many lines
// fit above Kael'thos. A long quote is paged to fit, measured in that font.
struct QuoteBox {
  const GFXfont* font;  // null: the classic font at size
  int size;
  int width;
  int lines;
  bool upper = false;   // set in capitals
};

// How every page is drawn: the menu, lists, quotes and settings, and the
// caption over a running or sealed scene. Chosen in the settings.
class Look {
public:
  virtual ~Look() = default;
  virtual const char* name() const = 0;
  virtual void page(Canvas& c, const ViewModel& vm, const Status& s, ArtSource& art) const = 0;
  // Over the scene, already on the canvas.
  virtual void caption(Canvas& c, const ViewModel& vm, const std::string& text) const = 0;
  // Scenes in negative: white ink on a black glass.
  virtual bool negative() const { return false; }
  // Where the battery and link sit, over a page or over a scene.
  virtual Corner corner(const ViewModel& vm, bool scene) const = 0;
  virtual QuoteBox quoteBox(bool large) const = 0;
};

// How many pages a quote takes in a look, for SUN to turn through.
int quotePageCount(const Look& look, const std::string& text, bool large);

int lookCount();
const Look& look(int index);  // wraps around
int lookIndex(const std::string& name);  // 0 when unknown

// The battery and the link icon, on one midline, at row y.
void drawCorner(Canvas& c, int y, const Status& s, uint8_t ink);
// The corner's bounds, for redrawing it alone: x and width are byte aligned.
constexpr int CORNER_X = 144, CORNER_W = 56, CORNER_H = 18;
