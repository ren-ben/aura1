#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>
#include "ports.h"

// Today's bundle from the server (packages/shared/src/sync.ts, todayDtoSchema):
// todos and habits to tick on the device, quotes for Kael'thos to say, and
// how he is doing. Saved to the card by each sync and read back at boot, so
// it works offline. Ticks made here queue up as absolute states for the next
// sync; the server applies them in order, so the last one wins.
struct DailyItem {
  int id = 0;
  std::string text;
  bool done = false;
};

struct DailyQuote {
  std::string body;
  std::string source;
};

class Daily {
public:
  explicit Daily(Storage& storage) : storage_(storage) {}

  void load();
  // A fresh bundle from a sync. The server has applied every tick sent with
  // it, so the queued ticks go.
  void replace(const std::string& json);

  const std::string& date() const { return date_; }
  int level() const { return level_; }
  const std::vector<DailyItem>& todos() const { return todos_; }
  const std::vector<DailyItem>& habits() const { return habits_; }
  const std::vector<DailyQuote>& quotes() const { return quotes_; }

  // Flips an item and queues the tick. False if out of range or unsaved.
  bool toggleTodo(size_t i);
  bool toggleHabit(size_t i);
  bool allTodosDone() const;

  // "stable", "thinning", "fragmenting" or "dormant", from the hours since
  // his last session: the server's, or one ended here since.
  std::string form(uint64_t now) const;
  void sessionEnded(uint64_t endedAt);

  std::vector<std::string> ticks() const;

private:
  bool parse(const std::string& json);
  bool queueTick(const std::string& line);

  static constexpr const char* TODAY = "/today.json";
  static constexpr const char* TICKS = "/ticks.ndjson";
  static constexpr const char* LAST = "/last.txt";

  Storage& storage_;
  std::string date_;
  int level_ = 0;
  uint64_t lastSessionAt_ = 0;
  std::vector<DailyItem> todos_;
  std::vector<DailyItem> habits_;
  std::vector<DailyQuote> quotes_;
};
