#pragma once
#include <cstdint>
#include <string>
#include <vector>
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

// Where a look sets a page of a book: the font it is read in, how wide a
// line runs, how many lines stand above him, and where he sits reading. The
// same box paginates the chapter, so every look turns its own pages.
struct ReaderBox {
  const GFXfont* font;
  int size;
  int width;
  int lines;
  int top;          // the first line's baseline
  int leading;      // between lines
  int catX, catY;   // where he reads, or -1 for a look that does not show him
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
  // The row the session's start time sits on, top left over its scene:
  // level with the corner, unless the caption is up there.
  virtual int startedY(const ViewModel& vm) const { return corner(vm, true).y; }
  virtual QuoteBox quoteBox(bool large) const = 0;
  // Every look reads the same way unless it says otherwise: the book's own
  // page, in the look's serif, with him reading in the lower right.
  virtual ReaderBox readerBox(bool large) const;
};

// Where each page of a chapter begins, measured in the look's own reader
// box: the offsets SUN turns through. Always at least one page.
std::vector<int> readerPages(const Look& look, const std::string& text, bool large);
// The page of whatever the device is showing: a look's own page, or the page
// of a book, which every look reads the same way.
void drawPage(Canvas& c, const Look& look, const ViewModel& vm, const Status& s, ArtSource& art);
// The page itself: the text, the chapter, how far through, and him reading.
void readerPage(Canvas& c, const Look& look, const ViewModel& vm, ArtSource& art);

// The day as it is wired, the same in every look: what to be doing now,
// what comes after, and the day around it.
void planPage(Canvas& c, const Look& look, const ViewModel& vm);
// The Hunt, the same in every look: the verdict and the exercises, then a
// set, its adjustment, the rest after it and how it felt, with him in the
// exercise's pose.
void huntPage(Canvas& c, const Look& look, const ViewModel& vm, ArtSource& art);
// Where the corner goes: the look's own, except on the plan, which keeps
// the top right for it in every look.
Corner pageCorner(const Look& look, const ViewModel& vm, bool scene);

// How many pages a quote takes in a look, for SUN to turn through.
int quotePageCount(const Look& look, const std::string& text, bool large);

int lookCount();
const Look& look(int index);  // wraps around
int lookIndex(const std::string& name);  // 0 when unknown

// When the running session began, "SINCE 14:32", top left over its scene.
void drawStarted(Canvas& c, const Look& look, const ViewModel& vm);

// The battery and the link icon, on one midline, at row y.
void drawCorner(Canvas& c, int y, const Status& s, uint8_t ink);
// The corner's bounds, for redrawing it alone: x and width are byte aligned.
constexpr int CORNER_X = 144, CORNER_W = 56, CORNER_H = 18;
