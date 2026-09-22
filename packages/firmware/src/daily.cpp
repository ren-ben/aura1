#include "daily.h"
#include <algorithm>
#include <cstdlib>
#include <ArduinoJson.h>
#include "art_index.h"
#include "time_util.h"

bool Daily::parse(const std::string& json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc["date"].is<const char*>()) return false;
  date_ = doc["date"].as<std::string>();
  level_ = doc["level"] | 0;
  resurrectionId_ = doc["resurrectionId"] | 0;
  utcOffsetMinutes_ = doc["utcOffset"] | 0;
  serverDormant_ = std::string(doc["form"] | "") == "dormant";
  lastSessionAt_ = 0;
  fromIso8601(doc["lastSessionAt"] | "", lastSessionAt_);
  todos_.clear();
  habits_.clear();
  quotes_.clear();
  for (JsonObjectConst t : doc["todos"].as<JsonArrayConst>()) {
    todos_.push_back({ t["id"] | 0, t["body"] | "", t["done"] | false });
  }
  for (JsonObjectConst h : doc["habits"].as<JsonArrayConst>()) {
    habits_.push_back({ h["id"] | 0, h["name"] | "", h["done"] | false, h["history"] | "" });
  }
  for (JsonObjectConst q : doc["quotes"].as<JsonArrayConst>()) {
    quotes_.push_back({ q["body"] | "", q["source"] | "" });
  }
  return true;
}

void Daily::load() {
  std::string json;
  for (const auto& line : storage_.readLines(TODAY)) json += line + "\n";
  parse(json);
  const auto hash = storage_.readLines(HASH);
  hash_ = hash.empty() ? "" : hash[0];
  const auto local = storage_.readLines(LAST);
  last_ = local.empty() ? "" : local[0];
}

void Daily::replace(const std::string& json, const std::string& hash) {
  if (!parse(json)) return;
  storage_.write(TODAY, json);
  storage_.write(HASH, hash + "\n");
  hash_ = hash;
  storage_.remove(TICKS);
}

void Daily::clearTicks() {
  storage_.remove(TICKS);
}

bool Daily::queueTick(const std::string& line) {
  return storage_.append(TICKS, line);
}

bool Daily::toggleTodo(size_t i) {
  if (i >= todos_.size()) return false;
  DailyItem& t = todos_[i];
  if (!queueTick("todo " + std::to_string(t.id) + (t.done ? " 0" : " 1"))) return false;
  t.done = !t.done;
  return true;
}

bool Daily::toggleHabit(size_t i) {
  if (i >= habits_.size()) return false;
  DailyItem& h = habits_[i];
  if (!queueTick("habit " + std::to_string(h.id) + " " + date_ + (h.done ? " 0" : " 1"))) return false;
  h.done = !h.done;
  if (h.history.empty()) h.history = "0";
  h.history.back() = h.done ? '1' : '0';
  return true;
}

static std::string isoDate(const Civil& c) {
  const auto two = [](unsigned v) { return std::string(v < 10 ? "0" : "") + std::to_string(v); };
  return std::to_string(c.year) + "-" + two(c.month) + "-" + two(c.day);
}

bool Daily::rollover(uint64_t now) {
  if (date_.size() != 10) return false;
  const int64_t local = static_cast<int64_t>(now) + utcOffsetMinutes_ * 60;
  if (local <= 0) return false;
  const std::string today = isoDate(epochToCivil(static_cast<uint64_t>(local)));
  if (today <= date_) return false;
  const uint64_t from = civilToEpoch(std::atoi(date_.substr(0, 4).c_str()), std::atoi(date_.substr(5, 2).c_str()),
                                     std::atoi(date_.substr(8, 2).c_str()), 0, 0, 0);
  const uint64_t to = civilToEpoch(std::atoi(today.substr(0, 4).c_str()), std::atoi(today.substr(5, 2).c_str()),
                                   std::atoi(today.substr(8, 2).c_str()), 0, 0, 0);
  const size_t days = std::min<uint64_t>(HISTORY_DAYS, (to - from) / 86400);
  todos_.erase(std::remove_if(todos_.begin(), todos_.end(), [](const DailyItem& t) { return t.done; }), todos_.end());
  for (auto& h : habits_) {
    h.done = false;
    h.history += std::string(days, '0');
    if (h.history.size() > HISTORY_DAYS) h.history.erase(0, h.history.size() - HISTORY_DAYS);
  }
  date_ = today;
  return true;
}

bool Daily::allTodosDone() const {
  if (todos_.empty()) return false;
  for (const auto& t : todos_) {
    if (!t.done) return false;
  }
  return true;
}

// /last.txt holds the last session ended here and whether it completed the
// ritual: "<endedAt> <0|1>". Kept in memory too: the menu asks for his form
// on every press. A session under ten minutes is dropped by the server, so it
// does not count here either.
void Daily::sessionEnded(uint64_t endedAt, int activityId, int minutes) {
  if (minutes < MIN_SESSION_MINUTES) return;
  const bool rite = activityId == resurrectionId_ && resurrectionId_ > 0 && minutes >= 60;
  last_ = std::to_string(endedAt) + (rite ? " 1" : " 0");
  storage_.write(LAST, last_ + "\n");
}

std::string Daily::form(uint64_t now) const {
  uint64_t last = lastSessionAt_;
  bool rite = false;
  if (!last_.empty()) {
    const uint64_t here = std::strtoull(last_.c_str(), nullptr, 10);
    rite = last_.size() > 2 && last_.compare(last_.size() - 2, 2, " 1") == 0;
    if (here > last) last = here;
  }
  if (serverDormant_ && !rite) return "dormant";
  // No history at all (a new device, never synced) is a fresh start, not
  // neglect: he greets rather than sulks.
  if (last == 0 || now < last) return "stable";
  const uint64_t hours = (now - last) / 3600;
  if (hours < 24) return "stable";
  if (hours < 48) return "thinning";
  if (hours < 72) return "fragmenting";
  return "dormant";
}

std::vector<std::string> Daily::ticks() const {
  return storage_.readLines(TICKS);
}
