#pragma once
#include <Adafruit_GFX.h>
#include <cstdint>
#include <map>
#include <string>
#include <vector>
#include "art_index.h"
#include "canvas.h"
#include "looks.h"
#include "renderer.h"
#include "status.h"

// Draws the screens. Kael'thos comes from the SD card's art pack (see
// art_index.h): wake and sleep animations, and a scene for a running or
// sealed session. Pages are drawn by the chosen look (looks.h) into a canvas,
// then pushed to the glass. Without the pack it falls back to plain text.
class EinkRenderer : public Renderer, private ArtSource {
public:
  void begin();
  void render(const ViewModel& vm) override;
  // Redraws only the corner, and only when something in it changed.
  void setStatus(const Status& status);

private:
  bool draw(Canvas& c, const std::string& id, int x, int y, uint8_t colour) override;
  void drawWaking();
  static void drawDormant(Adafruit_GFX& g);
  // Plays a scene's frames in order; the last one gets a full refresh if asked.
  bool play(const std::string& moment, bool fullLast, bool negative);
  bool playScene(const ArtScene* scene, bool fullLast, bool negative);
  // The first frame of the sleep: the press has taken.
  bool goodnight(const ArtScene& scene, const Look& lk);
  // A whole-screen scene into the canvas; false when the pack has none.
  bool drawScene(const ArtScene* scene, bool negative, int frame = 0);
  // counted: whether this partial counts toward the next full refresh. The
  // breath of a sit does not, or a five minute sit would flash every 40 s.
  void push(bool full, bool counted = true);
  void drawStatus();

  Status status_;
  Canvas base_;           // the page on the glass, without its corner
  Canvas out_;            // the page with its corner, as pushed
  Corner corner_{ 0, INK };
  bool cornered_ = false; // a page with a corner is on the glass

  std::vector<ArtScene> art_;
  // The place (scene env) now on the glass; empty for lists and text.
  std::string env_;
  // The skin he wears: its own scenes first, his usual ones for the rest.
  std::string skin_;
  // His head on the menus, by skin ("" his own): left, up, right.
  std::map<std::string, std::vector<std::vector<uint8_t>>> watch_;
  int watchSize_ = 0;
  // The scene of the running session: kept while it runs, so a redraw (the
  // minutes left, the breath) never swaps it for another.
  const ArtScene* running_ = nullptr;
  std::string runningMoment_;

  static constexpr int PARTIALS_BEFORE_FULL = 40;
  int partials_ = 0;
};
