#pragma once
#include <cstdint>
#include <map>
#include <string>
#include "carousel.h"
#include "book.h"
#include "daily.h"
#include "queue.h"
#include "ports.h"
#include "renderer.h"
#include "view_model.h"

enum class Input { SunShort, SunDouble, SunLong, PowerShort, PowerLong, Tick };

std::string uuidV4(Random& random);

class SessionMachine {
public:
  SessionMachine(Carousel& carousel, EventQueue& queue, Clock& clock,
                 Storage& storage, Renderer& renderer, Random& random);

  void begin();
  void handle(Input input);
  Screen screen() const { return screen_; }
  // A page of a book is on the glass. Holding POWER here goes back to the
  // menu instead of switching off: the device cannot be switched off from
  // the middle of a book, by design.
  bool reading() const { return screen_ == Screen::Idle && place_ == Place::Reading; }
  // Redraws after the carousel was reloaded under the machine (a sync pulled a
  // new config). Only Idle shows the selection; other screens pick it up on
  // their next transition.
  void redraw();
  // A moment of joy (a level up, the list done): a scene held briefly.
  void celebrate(const std::string& moment);
  Daily& daily() { return daily_; }
  Book& book() { return book_; }
  // The open book moved under the reader (its place came from the web): its
  // pages are set again, where it now is.
  void bookChanged();
  // A chapter of a book came onto the card; the screen waiting on it counts.
  void copying(int bookId, int done, int total);
  // A book came onto the card whole: the one waited on opens.
  void bookArrived(int bookId);
  // SYNC NOW in the settings asks for a sync; the main loop takes the ask
  // and reports back with a word for the list.
  bool takeSyncRequest();
  void setSyncNote(const std::string& note);
  // The battery reading moved: the settings show it.
  void batteryChanged();
  // The look by name, as chosen on the web; unknown names change nothing.
  void setLook(const std::string& name);
  const char* lookName() const;
  // The speaker, for the Vigil's sounds. Without one a sit is silent.
  void setSound(Sound* sound) { sound_ = sound; }

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
  void read(Input input);        // the reading place
  void repaginate();             // the chapter, cut into pages for this look
  void turn(int pages);          // forward or back, over chapter ends
  std::string pageText() const;
  void enter(Place place);
  void vigil(Input input);       // the Vigil: a practice, then a length
  void startSit();
  void sitTick(uint64_t now);    // bells, the minutes left, the breath
  int sitLength(const VigilPractice& p) const;  // the last length chosen, or its own
  int leftInFives(uint64_t now) const;
  void chime(const char* name) { if (sound_) sound_->play(name); }
  void loadSettings();
  void saveSettings();
  void redrawSettings();

  static constexpr const char* MARKER = "/session.open";
  static constexpr const char* NAV = "/nav.txt";  // last started activity id
  static constexpr const char* SETTINGS = "/settings.txt";  // "<large 0|1> <skin>", then the look name
  static constexpr const char* SITS = "/vigil.txt";  // "<practice id> <minutes>", the length last chosen
  static constexpr uint64_t HEARTBEAT_SECONDS = 300;
  static constexpr uint64_t STOPPED_HOLD_SECONDS = 5;
  static constexpr uint64_t CELEBRATE_SECONDS = 5;
  static constexpr uint64_t SCREENSAVER_SECONDS = 180;
  static constexpr uint64_t PLAN_REDRAW_SECONDS = 300;
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
  Book book_{storage_};
  std::vector<int> pageStarts_;  // where each page of the chapter begins
  size_t page_ = 0;
  Place place_ = Place::Activities;
  size_t menuCursor_ = 0;
  uint64_t planDrawn_ = 0;  // the five minutes the plan was last drawn in
  size_t listCursor_ = 0;
  size_t quote_ = 0;
  int quotePage_ = 0;  // a long quote's page, turned by SUN
  uint64_t lastInput_ = 0;
  uint64_t celebrateAt_ = 0;
  std::string moment_;
  bool ritual_ = false;

  int copied_ = 0;     // chapters of the book waited on, on the card so far
  int toCopy_ = 0;
  bool largeText_ = false;
  std::string skin_ = "jiji";
  bool syncRequested_ = false;
  int look_ = 0;
  std::string syncNote_ = "NOW";

  // The Vigil.
  size_t vigilCursor_ = 0;
  bool choosingLength_ = false;
  size_t lengthCursor_ = 0;
  bool sit_ = false;             // the session running, or just kept, is a sit
  int sitMinutes_ = 0;           // 0: open, ended by hand
  int sitBell_ = 0;
  Pacer sitPacer_ = Pacer::None;
  int shownLeft_ = -1;
  int lastBell_ = 0;
  std::map<int, int> lengths_;   // practice id to the length last chosen
  Sound* sound_ = nullptr;
};
