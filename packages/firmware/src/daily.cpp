#include "daily.h"
#include <cstdlib>
#include <ArduinoJson.h>
#include "time_util.h"

bool Daily::parse(const std::string& json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc["date"].is<const char*>()) return false;
  date_ = doc["date"].as<std::string>();
  level_ = doc["level"] | 0;
  resurrectionId_ = doc["resurrectionId"] | 0;
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
    habits_.push_back({ h["id"] | 0, h["name"] | "", h["done"] | false });
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
}

void Daily::replace(const std::string& json) {
  if (!parse(json)) return;
  storage_.write(TODAY, json);
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
// ritual: "<endedAt> <0|1>".
void Daily::sessionEnded(uint64_t endedAt, int activityId, int minutes) {
  const bool rite = activityId == resurrectionId_ && resurrectionId_ > 0 && minutes >= 60;
  storage_.write(LAST, std::to_string(endedAt) + (rite ? " 1" : " 0") + "\n");
}

std::string Daily::form(uint64_t now) const {
  uint64_t last = lastSessionAt_;
  bool rite = false;
  const auto local = storage_.readLines(LAST);
  if (!local.empty()) {
    const uint64_t here = std::strtoull(local[0].c_str(), nullptr, 10);
    rite = local[0].size() > 2 && local[0].compare(local[0].size() - 2, 2, " 1") == 0;
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
