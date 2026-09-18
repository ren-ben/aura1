#pragma once
#include <cstddef>
#include <string>

// Shared line-validation primitives for the SD-backed marker (session.open)
// and queue (queue.ndjson) formats. Both are plain-text field/value lines,
// so an atoi/strtoull call happily turns garbage ("abc", "-5") into 0, or a
// too-long digit string into a wrapped positive number. Reject those before
// they are ever parsed as numbers.
namespace validate {

// Digit-count caps close the atoi/strtoull overflow, e.g. "99999999999" (11
// digits) wrapping to a small positive int. 9 digits comfortably covers any
// real activityId while still rejecting the overflow case; 10 digits covers
// epoch seconds out past the year 5000.
constexpr size_t MAX_ACTIVITY_ID_DIGITS = 9;
constexpr size_t MAX_TIMESTAMP_DIGITS = 10;

// True only for a non-empty string made entirely of ASCII digits. Rejects
// "-5" (a leading '-'), "abc" (strtoull/atoi silently return 0 for these)
// and "17581x" (strtoull stops at the first non-digit and still returns a
// value), any of which would otherwise parse as a plausible-looking number.
inline bool isDigitsOnly(const std::string& s) {
  if (s.empty()) return false;
  for (const char c : s) {
    if (c < '0' || c > '9') return false;
  }
  return true;
}

// True only for a 36-character string shaped exactly like a uuid: '-' at
// positions 8, 13, 18, 23, and a lowercase hex digit everywhere else.
inline bool isValidUuid(const std::string& s) {
  if (s.size() != 36) return false;
  for (size_t i = 0; i < s.size(); ++i) {
    const char c = s[i];
    if (i == 8 || i == 13 || i == 18 || i == 23) {
      if (c != '-') return false;
    } else if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) {
      return false;
    }
  }
  return true;
}

}  // namespace validate
