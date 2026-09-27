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

// Where the reading got to in one book, and anything kept there. One is sent
// for every book read since the last sync.
struct ReadingState {
  int bookId = 0;
  int chapterIdx = 0;
  int through = 0;
  // "<chapter> <start> <end> <text>", one a line, as the card holds them.
  std::vector<std::string> marks;
};

// How the device is, sent with each sync for the dashboard.
struct DeviceStatus {
  int battery = 0;  // percent
  int millivolts = 0;
  bool charging = false;
  std::string look;
  std::string skin;  // what he wears, so the dashboard dresses him the same
};

// The request body, with at most the first MAX_SYNC_EVENTS events and
// ISO 8601 timestamps, plus the queued ticks (lines "todo <id> <0|1>" or
// "habit <id> <date> <0|1>"; malformed ones are skipped), and the hash of
// the day's bundle held, so an unchanged one is not sent back. Empty if the
// document overflowed: never send a truncated request.
std::string buildRequest(const std::string& deviceId, int configVersion,
                         const std::vector<QueuedEvent>& pending,
                         const std::vector<std::string>& ticks = {},
                         const std::string& todayHash = "",
                         const DeviceStatus* status = nullptr,
                         const std::vector<ReadingState>& readings = {},
                         const std::vector<std::string>& hunt = {});

struct SyncResult {
  bool ok = false;                    // well formed; otherwise apply nothing
  std::vector<std::string> settled;   // acked then rejected: both leave the queue
  bool hasServerTime = false;         // only if serverTime parsed
  uint64_t serverTime = 0;
  bool hasConfig = false;
  std::string config;                 // the config object, re-serialised
  bool hasToday = false;
  std::string today;                  // today's bundle, re-serialised
  std::string todayHash;              // the server's bundle, sent or not
  std::string look;                   // a look chosen on the web, to wear
  bool hasShelf = false;
  std::string shelf;                  // every book he has, re-serialised
};

SyncResult parseResponse(const std::string& body);

struct CarouselConfig {
  bool ok = false;
  int version = 0;
  std::vector<FolderEntry> folders;
  std::vector<ActivityEntry> activities;  // lastUsedAt null -> 0
};

CarouselConfig configToCarousel(const std::string& json);
