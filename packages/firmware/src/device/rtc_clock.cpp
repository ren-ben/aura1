#include "rtc_clock.h"
#include <Wire.h>
#include "time_util.h"

// PCF85063 time registers, 0x04..0x0A, all BCD:
// seconds, minutes, hours, days, weekdays, months, years (0-99 from 2000).
// The RTC holds UTC. Calendar maths lives in time_util (host tested).

bool RtcClock::begin() {
  // Control_1 = 0x00: clock running (STOP = 0), 24-hour mode, no test mode.
  Wire.beginTransmission(ADDRESS);
  Wire.write(REG_CONTROL_1);
  Wire.write(0x00);
  return Wire.endTransmission() == 0;
}

uint64_t RtcClock::nowEpochSeconds() {
  // A failed or short read keeps the previous time rather than turning a
  // zero-filled buffer into a date.
  Wire.beginTransmission(ADDRESS);
  Wire.write(REG_SECONDS);
  if (Wire.endTransmission(false) != 0) return last_;
  if (Wire.requestFrom(ADDRESS, (uint8_t)7) != 7) return last_;
  uint8_t r[7] = {};
  if (Wire.readBytes(r, 7) != 7) return last_;

  last_ = civilToEpoch(2000 + bcdToDec(r[6]),
                       bcdToDec(r[5] & 0x1F),
                       bcdToDec(r[3] & 0x3F),
                       bcdToDec(r[2] & 0x3F),
                       bcdToDec(r[1] & 0x7F),
                       bcdToDec(r[0] & 0x7F));  // bit 7 is the oscillator-stop flag
  return last_;
}

void RtcClock::setEpochSeconds(uint64_t seconds) {
  const Civil c = epochToCivil(seconds);
  Wire.beginTransmission(ADDRESS);
  Wire.write(REG_SECONDS);
  Wire.write(decToBcd(c.second));  // writing bit 7 as 0 also clears the oscillator-stop flag
  Wire.write(decToBcd(c.minute));
  Wire.write(decToBcd(c.hour));
  Wire.write(decToBcd(c.day));
  Wire.write(decToBcd(c.weekday));
  Wire.write(decToBcd(c.month));
  Wire.write(decToBcd(c.year - 2000));
  Wire.endTransmission();
}
