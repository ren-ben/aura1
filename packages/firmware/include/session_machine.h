#pragma once
#include <cstdint>
#include <string>
#include "carousel.h"
#include "daily.h"
#include "queue.h"
#include "ports.h"
#include "renderer.h"
#include "view_model.h"

enum class Input { SunShort, SunLong, PowerShort, PowerLong, Tick };

std::string uuidV4(Random& random);

class SessionMachine {
public:
  SessionMachine(Carousel& carousel, EventQueue& queue, Clock& clock,
                 Storage& storage, Renderer& renderer, Random& random);

  void begin();
  void handle(Input input);
  Screen screen() const { return screen_; }
  // Redraws after the carousel was reloaded under the machine (a sync pulled a
  // new config). Only Idle shows the selection; other screens pick it up on
  // their next transition.
  void redraw();
  // A moment of joy (a level up, the list done): a scene held briefly.
  void celebrate(const std::string& moment);
  Daily& daily() { return daily_; }

private:
  void draw(int minutes = 0);
  void startSession(int activityId = 0);
  std::vector<Place> menu() const;
  void stopSession();
  std::string serialiseMarker(uint64_t heartbeat) const;
  bool writeMarker(uint64_t heartbeat);
  void appendHeartbeat(uint64_t heartbeat);
  void recoverMarker();
  void browse(Input input);
  void enter(Place place);

  static constexpr const char* MARKER = "/session.open";
  static constexpr const char* NAV = "/nav.txt";  // last started activity id
  static constexpr uint64_t HEARTBEAT_SECONDS = 300;
  static constexpr uint64_t STOPPED_HOLD_SECONDS = 5;
  static constexpr uint64_t CELEBRATE_SECONDS = 5;
  static constexpr uint64_t SCREENSAVER_SECONDS = 180;
  static constexpr uint64_t RITUAL_STAGE_SECONDS = 15 * 60;  // one candle each
  // 2025-01-01T00:00:00Z. Below this the clock is treated as unset: the
  // PCF85063 restarts at 2000-01-01 after a battery/power-loss reset, and
  // RtcClock returns 0 if the first I2C read fails. A session logged under
  // either lands in Postgres under a permanently wrong date, with no
  // correction path, so refuse to start rather than log it. Deliberately
  // below FakeClock's default of 1758100000, so existing tests are unaffected.
  static constexpr uint64_t MIN_VALID_CLOCK_EPOCH_SECONDS = 1735689600;

  Carousel& carousel_;
  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
  Renderer& renderer_;
  Random& random_;

  Screen screen_ = Screen::Idle;
  int activityId_ = 0;
  std::string sessionUuid_;
  uint64_t startedAt_ = 0;
  uint64_t lastHeartbeat_ = 0;
  uint64_t stoppedAt_ = 0;

  Daily daily_{storage_};
  Place place_ = Place::Activities;
  size_t menuCursor_ = 0;
  size_t listCursor_ = 0;
  size_t quote_ = 0;
  int quotePage_ = 0;  // a long quote's page, turned by SUN
  uint64_t lastInput_ = 0;
  uint64_t celebrateAt_ = 0;
  std::string moment_;
  bool ritual_ = false;
};
