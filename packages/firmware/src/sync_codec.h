#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>
#include "carousel.h"
#include "queue.h"

// The sync wire format (packages/shared/src/sync.ts), host tested. Pure C++17
// plus ArduinoJson; the device adapter only moves bytes over Wi-Fi.

// The server's syncRequestSchema caps events at 200. More would 400 on every
// attempt, forever. The append-only queue copes with a partial drain.
constexpr size_t MAX_SYNC_EVENTS = 200;

// The request body, with at most the first MAX_SYNC_EVENTS events and
// ISO 8601 timestamps. Empty if the document overflowed: never send a
// truncated request.
std::string buildRequest(const std::string& deviceId, int configVersion,
                         const std::vector<QueuedEvent>& pending);

struct SyncResult {
  bool ok = false;                    // well formed; otherwise apply nothing
  std::vector<std::string> settled;   // acked then rejected: both leave the queue
  bool hasServerTime = false;         // only if serverTime parsed
  uint64_t serverTime = 0;
  bool hasConfig = false;
  std::string config;                 // the config object, re-serialised
};

SyncResult parseResponse(const std::string& body);

struct CarouselConfig {
  bool ok = false;
  int version = 0;
  std::vector<FolderEntry> folders;
  std::vector<ActivityEntry> activities;  // lastUsedAt null -> 0
};

CarouselConfig configToCarousel(const std::string& json);
