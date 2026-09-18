#include "queue.h"
#include <cstdlib>
#include <set>

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
  // A leading newline terminates any unterminated previous line left by a
  // power cut mid-write, so the two lines never glue into one.
  storage_.append(PATH, "\n" + serialise(event));
}

std::vector<QueuedEvent> EventQueue::pending() {
  std::set<std::string> acked;
  for (const auto& line : storage_.readLines(ACKED)) {
    // A blank line (e.g. from a torn write) contributes no uuid.
    if (!line.empty()) acked.insert(line);
  }
  std::vector<QueuedEvent> out;
  for (const auto& line : storage_.readLines(PATH)) {
    QueuedEvent event;
    // A torn final line fails to parse and is skipped. This is the power-cut case.
    if (parse(line, event) && acked.find(event.uuid) == acked.end()) {
      out.push_back(event);
    }
  }
  return out;
}

void EventQueue::prune(const std::vector<std::string>& uuids) {
  if (uuids.empty()) return;
  for (const auto& uuid : uuids) {
    storage_.append(ACKED, uuid);
  }
  if (pending().empty()) {
    // Order matters: removing the queue first means a cut between the two
    // removes leaves a stale acked file, which filters nothing and is
    // harmless. Removing acked first would leave a queue with nothing
    // filtering it, re-sending already-settled events.
    storage_.remove(PATH);
    storage_.remove(ACKED);
  }
}

size_t EventQueue::size() { return pending().size(); }
