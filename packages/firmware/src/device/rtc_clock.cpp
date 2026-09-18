#include "rtc_clock.h"
#include <Wire.h>
#include <time.h>

// PCF85063 time registers, 0x04..0x0A, all BCD:
// seconds, minutes, hours, days, weekdays, months, years (0-99 from 2000).
// newlib has no timegm(). mktime() is UTC here because nothing on the device
// sets TZ; never call configTime() or setenv("TZ") in this firmware.

bool RtcClock::begin() {
  Wire.beginTransmission(ADDRESS);
  return Wire.endTransmission() == 0;
}

uint64_t RtcClock::nowEpochSeconds() {
  Wire.beginTransmission(ADDRESS);
  Wire.write(REG_SECONDS);
  Wire.endTransmission(false);
  Wire.requestFrom(ADDRESS, (uint8_t)7);
  uint8_t r[7] = {};
  Wire.readBytes(r, 7);

  struct tm t = {};
  t.tm_sec = bcdToDec(r[0] & 0x7F);  // bit 7 is the oscillator-stop flag
  t.tm_min = bcdToDec(r[1] & 0x7F);
  t.tm_hour = bcdToDec(r[2] & 0x3F);
  t.tm_mday = bcdToDec(r[3] & 0x3F);
  t.tm_mon = bcdToDec(r[5] & 0x1F) - 1;
  t.tm_year = 100 + bcdToDec(r[6]);
  return static_cast<uint64_t>(mktime(&t));
}

void RtcClock::setEpochSeconds(uint64_t seconds) {
  const time_t now = static_cast<time_t>(seconds);
  struct tm t;
  gmtime_r(&now, &t);
  Wire.beginTransmission(ADDRESS);
  Wire.write(REG_SECONDS);
  Wire.write(decToBcd(t.tm_sec));  // writing bit 7 as 0 also clears the oscillator-stop flag
  Wire.write(decToBcd(t.tm_min));
  Wire.write(decToBcd(t.tm_hour));
  Wire.write(decToBcd(t.tm_mday));
  Wire.write(decToBcd(t.tm_wday));
  Wire.write(decToBcd(t.tm_mon + 1));
  Wire.write(decToBcd(t.tm_year - 100));
  Wire.endTransmission();
}
