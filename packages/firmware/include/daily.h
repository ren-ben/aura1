#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>
#include "ports.h"
#include "view_model.h"

// Today's bundle from the server (packages/shared/src/sync.ts, todayDtoSchema):
// todos and habits to tick on the device, quotes for Kael'thos to say, and
// how he is doing. Saved to the card by each sync and read back at boot, so
// it works offline. Ticks made here queue up as absolute states for the next
// sync; the server applies them in order, so the last one wins.
struct DailyItem {
  int id = 0;
  std::string text;
  bool done = false;
  // Habits: the last days, oldest first, '1' where done; today is the last.
  std::string history;
};

// A practice of the Vigil (packages/shared/src/vigil.ts): a system activity,
// its default length (0: open), the breath drawn while sitting, and the
// minutes between interval bells (0: none).
enum class Pacer { None, Sigh, Resonance };
struct VigilPractice {
  int id = 0;
  std::string name;
  int minutes = 0;
  Pacer pacer = Pacer::None;
  int bell = 0;
};

// The Hunt (packages/shared/src/hunt.ts): each exercise with what to lift
// next, the verdict of the morning, and the session a hunt runs as.
struct HuntTarget { double load = 0; int reps = 0; };
struct HuntExercise {
  int id = 0;
  std::string name;
  std::string pose;
  int rest = 120;          // seconds between sets
  double step = 2.5;       // the load's smallest move
  bool bodyweight = false; // reps only
  std::vector<HuntTarget> sets;
  std::string last;
};

struct DailyQuote {
  std::string body;
  std::string source;
};

class Daily {
public:
  explicit Daily(Storage& storage) : storage_(storage) {}

  void load();
  // A fresh bundle from a sync, and the server's hash of it. The server has
  // applied every tick sent with it, so the queued ticks go.
  void replace(const std::string& json, const std::string& hash = "");
  // A sync that found the bundle unchanged: the ticks sent are applied.
  void clearTicks();
  const std::string& hash() const { return hash_; }

  const std::string& date() const { return date_; }
  int level() const { return level_; }
  // The ritual's activity, 0 before the first bundle.
  int resurrectionId() const { return resurrectionId_; }
  const std::vector<DailyItem>& todos() const { return todos_; }
  const std::vector<DailyItem>& habits() const { return habits_; }
  const std::vector<DailyQuote>& quotes() const { return quotes_; }
  const std::vector<VigilPractice>& vigil() const { return vigil_; }
  // A sit: a session on one of the Vigil's practices.
  bool isSit(int activityId) const;
  // The four sun hours to toll (minutes after local midnight), when they
  // are on; and whether now is one of them, to the minute. Each is answered
  // yes once only.
  const std::vector<int>& hours() const { return hours_; }
  bool sunHour(uint64_t now);
  // Today's rewiring, and the minute of the user's day it is at now.
  const std::vector<Tap>& plan() const { return plan_; }
  int minuteOfDay(uint64_t now) const;

  // Flips an item and queues the tick. False if out of range or unsaved.
  bool toggleTodo(size_t i);
  bool toggleHabit(size_t i);
  bool allTodosDone() const;

  // At the user's midnight, before the next sync brings the new day: the
  // todos done go, the habits open again and their graphs move on a day.
  // True when the day turned.
  bool rollover(uint64_t now);
  static constexpr size_t HISTORY_DAYS = 84;

  // "stable", "thinning", "fragmenting" or "dormant", from the hours since
  // his last session: the server's, or one ended here since. Once the server
  // has him dormant, only the ritual completed here wakes him before the
  // next sync.
  std::string form(uint64_t now) const;
  void sessionEnded(uint64_t endedAt, int activityId, int minutes);

  std::vector<std::string> ticks() const;

  // The Hunt. Sets and feels queue as lines, "set <uuid> <exercise> <epoch>
  // <idx> <load> <reps>" and "feel <uuid> <exercise> <date> <feel>", and
  // leave the card once the server has settled their uuids.
  const std::vector<HuntExercise>& huntExercises() const { return hunt_; }
  const std::string& huntShort() const { return huntShort_; }
  const std::string& huntLine() const { return huntLine_; }
  int liftingId() const { return liftingId_; }
  bool queueHunt(const std::string& line);
  std::vector<std::string> huntLines() const;
  void pruneHunt(const std::vector<std::string>& settled);

private:
  bool parse(const std::string& json);
  bool queueTick(const std::string& line);

  static constexpr const char* TODAY = "/today.json";
  static constexpr const char* TICKS = "/ticks.ndjson";
  static constexpr const char* HASH = "/today.hash";
  static constexpr const char* LAST = "/last.txt";
  static constexpr const char* HUNT = "/hunt.ndjson";

  Storage& storage_;
  std::string date_;
  int level_ = 0;
  int resurrectionId_ = 0;
  int utcOffsetMinutes_ = 0;
  std::string hash_;  // the server's hash of the bundle held  // the server's time zone, for the user's day
  bool serverDormant_ = false;
  std::string last_;  // /last.txt
  uint64_t lastSessionAt_ = 0;
  std::vector<DailyItem> todos_;
  std::vector<DailyItem> habits_;
  std::vector<DailyQuote> quotes_;
  std::vector<VigilPractice> vigil_;
  std::vector<int> hours_;
  std::vector<Tap> plan_;
  std::vector<HuntExercise> hunt_;
  std::string huntShort_, huntLine_;
  int liftingId_ = 0;
  int64_t lastHour_ = -1;  // the local minute last tolled, since the epoch
};
