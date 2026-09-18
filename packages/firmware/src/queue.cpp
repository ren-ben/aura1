#include "queue.h"
#include <algorithm>
#include <cstdlib>

static bool field(const std::string& line, const std::string& key, std::string& out) {
  const std::string needle = "\"" + key + "\":";
  const size_t at = line.find(needle);
  if (at == std::string::npos) return false;
  size_t start = at + needle.size();
  if (start >= line.size()) return false;
  if (line[start] == '"') {
    const size_t end = line.find('"', ++start);
    if (end == std::string::npos) return false;
    out = line.substr(start, end - start);
    return true;
  }
  const size_t end = line.find_first_of(",}", start);
  if (end == std::string::npos) return false;
  out = line.substr(start, end - start);
  return true;
}

std::string EventQueue::serialise(const QueuedEvent& e) {
  return "{\"uuid\":\"" + e.uuid + "\",\"activityId\":" + std::to_string(e.activityId)
       + ",\"startedAt\":" + std::to_string(e.startedAt)
       + ",\"endedAt\":" + std::to_string(e.endedAt)
       + ",\"clockSynced\":" + (e.clockSynced ? "true" : "false") + "}";
}

bool EventQueue::parse(const std::string& line, QueuedEvent& out) {
  std::string uuid, activityId, startedAt, endedAt, clockSynced;
  if (!field(line, "uuid", uuid)) return false;
  if (!field(line, "activityId", activityId)) return false;
  if (!field(line, "startedAt", startedAt)) return false;
  if (!field(line, "endedAt", endedAt)) return false;
  if (!field(line, "clockSynced", clockSynced)) return false;
  out.uuid = uuid;
  out.activityId = std::atoi(activityId.c_str());
  out.startedAt = std::strtoull(startedAt.c_str(), nullptr, 10);
  out.endedAt = std::strtoull(endedAt.c_str(), nullptr, 10);
  out.clockSynced = clockSynced == "true";
  return true;
}

void EventQueue::append(const QueuedEvent& event) {
  storage_.append(PATH, serialise(event));
}

std::vector<QueuedEvent> EventQueue::pending() {
  std::vector<QueuedEvent> out;
  for (const auto& line : storage_.readLines(PATH)) {
    QueuedEvent event;
    // A torn final line fails to parse and is skipped. This is the power-cut case.
    if (parse(line, event)) out.push_back(event);
  }
  return out;
}

void EventQueue::prune(const std::vector<std::string>& uuids) {
  if (uuids.empty()) return;
  std::string rewritten;
  for (const auto& event : pending()) {
    if (std::find(uuids.begin(), uuids.end(), event.uuid) == uuids.end()) {
      rewritten += serialise(event) + "\n";
    }
  }
  storage_.write(PATH, rewritten);
}

size_t EventQueue::size() { return pending().size(); }
