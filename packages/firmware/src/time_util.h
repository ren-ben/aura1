#pragma once
#include <cstdint>
#include <string>

// UTC calendar <-> epoch seconds. Pure C++17, no libc time functions: newlib on
// the device and glibc on the host disagree on timegm, TZ and time_t width.
// Uses Howard Hinnant's days_from_civil / civil_from_days
// (https://howardhinnant.github.io/date_algorithms.html).

struct Civil {
  int year;
  unsigned month;    // 1-12
  unsigned day;      // 1-31
  unsigned hour;
  unsigned minute;
  unsigned second;
  unsigned weekday;  // 0 = Sunday
};

uint64_t civilToEpoch(int year, unsigned month, unsigned day,
                      unsigned hour, unsigned minute, unsigned second);
Civil epochToCivil(uint64_t epochSeconds);

// Exactly "YYYY-MM-DDTHH:MM:SSZ", the form zod's z.iso.datetime() accepts.
std::string toIso8601(uint64_t epochSeconds);

// Accepts "YYYY-MM-DDTHH:MM:SSZ" with optional fractional seconds before the Z
// (the server's toISOString() sends ".123Z"); the fraction is truncated.
// Rejects anything else, any out-of-range field, and dates before 1970.
// On failure returns false and leaves out untouched.
bool fromIso8601(const std::string& iso, uint64_t& out);
