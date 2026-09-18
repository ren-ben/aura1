#pragma once
#include <cstdint>
#include <string>
#include <time.h>

// ISO 8601 UTC <-> epoch seconds, for the sync wire format only. The queue and
// the RTC stay in epoch seconds.
// newlib has no timegm(). mktime() is UTC here because nothing on the device
// sets TZ; never call configTime() or setenv("TZ") in this firmware.

// Emits exactly "2026-09-17T10:00:00Z", the form zod's z.iso.datetime() accepts.
inline std::string isoFromEpoch(uint64_t seconds) {
  const time_t t = static_cast<time_t>(seconds);
  struct tm tm;
  gmtime_r(&t, &tm);
  char buf[21];
  strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%SZ", &tm);
  return buf;
}

// Accepts "2026-09-17T10:00:00Z" and the server's "2026-09-17T10:00:00.123Z":
// strptime stops at the seconds and the fraction is dropped. 0 if unparseable.
inline uint64_t epochFromIso(const char* iso) {
  struct tm tm = {};
  if (strptime(iso, "%Y-%m-%dT%H:%M:%S", &tm) == nullptr) return 0;
  return static_cast<uint64_t>(mktime(&tm));
}
