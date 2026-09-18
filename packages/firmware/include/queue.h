#pragma once
#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include "ports.h"

struct QueuedEvent {
  std::string uuid;
  int activityId;
  uint64_t startedAt;
  uint64_t endedAt;
  bool clockSynced;
};

class EventQueue {
public:
  explicit EventQueue(Storage& storage) : storage_(storage) {}

  bool append(const QueuedEvent& event);
  std::vector<QueuedEvent> pending();
  void prune(const std::vector<std::string>& uuids);
  size_t size();

  static std::string serialise(const QueuedEvent& event);
  static bool parse(const std::string& line, QueuedEvent& out);

private:
  static constexpr const char* PATH = "/queue.ndjson";
  static constexpr const char* ACKED = "/acked.ndjson";
  Storage& storage_;
};
