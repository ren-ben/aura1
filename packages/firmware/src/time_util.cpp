#include "time_util.h"

namespace {

constexpr uint64_t SECONDS_PER_DAY = 86400;

// Hinnant: days since 1970-01-01 for a proleptic Gregorian date.
int64_t daysFromCivil(int64_t y, unsigned m, unsigned d) {
  y -= m <= 2;
  const int64_t era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = static_cast<unsigned>(y - era * 400);             // [0, 399]
  const unsigned doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;  // [0, 365]
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;            // [0, 146096]
  return era * 146097 + static_cast<int64_t>(doe) - 719468;
}

// Hinnant: the inverse of daysFromCivil.
void civilFromDays(int64_t z, int64_t& y, unsigned& m, unsigned& d) {
  z += 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(z - era * 146097);                // [0, 146096]
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;  // [0, 399]
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);                // [0, 365]
  const unsigned mp = (5 * doy + 2) / 153;                                     // [0, 11]
  d = doy - (153 * mp + 2) / 5 + 1;
  m = mp < 10 ? mp + 3 : mp - 9;
  y = static_cast<int64_t>(yoe) + era * 400 + (m <= 2);
}

bool isLeap(int y) { return y % 4 == 0 && (y % 100 != 0 || y % 400 == 0); }

unsigned daysInMonth(int y, unsigned m) {
  static const unsigned DAYS[] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
  return (m == 2 && isLeap(y)) ? 29 : DAYS[m - 1];
}

bool isDigit(char c) { return c >= '0' && c <= '9'; }

// Reads exactly n digits at s[at].
bool readDigits(const std::string& s, size_t at, size_t n, unsigned& out) {
  if (at + n > s.size()) return false;
  unsigned v = 0;
  for (size_t i = at; i < at + n; ++i) {
    if (!isDigit(s[i])) return false;
    v = v * 10 + static_cast<unsigned>(s[i] - '0');
  }
  out = v;
  return true;
}

void appendPadded(std::string& s, unsigned v, int width) {
  std::string digits = std::to_string(v);
  while (static_cast<int>(digits.size()) < width) digits.insert(digits.begin(), '0');
  s += digits;
}

}  // namespace

uint64_t civilToEpoch(int year, unsigned month, unsigned day,
                      unsigned hour, unsigned minute, unsigned second) {
  const int64_t days = daysFromCivil(year, month, day);
  return static_cast<uint64_t>(days) * SECONDS_PER_DAY + hour * 3600ULL + minute * 60ULL + second;
}

Civil epochToCivil(uint64_t epochSeconds) {
  const int64_t days = static_cast<int64_t>(epochSeconds / SECONDS_PER_DAY);
  const unsigned rest = static_cast<unsigned>(epochSeconds % SECONDS_PER_DAY);
  int64_t y = 0;
  Civil c{};
  civilFromDays(days, y, c.month, c.day);
  c.year = static_cast<int>(y);
  c.hour = rest / 3600;
  c.minute = rest % 3600 / 60;
  c.second = rest % 60;
  c.weekday = static_cast<unsigned>((days + 4) % 7);  // 1970-01-01 was a Thursday
  return c;
}

std::string toIso8601(uint64_t epochSeconds) {
  const Civil c = epochToCivil(epochSeconds);
  std::string s;
  s.reserve(20);
  appendPadded(s, static_cast<unsigned>(c.year), 4);
  s += '-';
  appendPadded(s, c.month, 2);
  s += '-';
  appendPadded(s, c.day, 2);
  s += 'T';
  appendPadded(s, c.hour, 2);
  s += ':';
  appendPadded(s, c.minute, 2);
  s += ':';
  appendPadded(s, c.second, 2);
  s += 'Z';
  return s;
}

bool fromIso8601(const std::string& iso, uint64_t& out) {
  unsigned year, month, day, hour, minute, second;
  if (!readDigits(iso, 0, 4, year) || iso.size() < 20 || iso[4] != '-'
      || !readDigits(iso, 5, 2, month) || iso[7] != '-'
      || !readDigits(iso, 8, 2, day) || iso[10] != 'T'
      || !readDigits(iso, 11, 2, hour) || iso[13] != ':'
      || !readDigits(iso, 14, 2, minute) || iso[16] != ':'
      || !readDigits(iso, 17, 2, second)) {
    return false;
  }

  // Optional fraction, then 'Z' as the final character.
  size_t at = 19;
  if (iso[at] == '.') {
    const size_t start = ++at;
    while (at < iso.size() && isDigit(iso[at])) ++at;
    if (at == start) return false;
  }
  if (at != iso.size() - 1 || iso[at] != 'Z') return false;

  const int y = static_cast<int>(year);
  if (y < 1970 || month < 1 || month > 12 || day < 1 || day > daysInMonth(y, month)
      || hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  out = civilToEpoch(y, month, day, hour, minute, second);
  return true;
}
