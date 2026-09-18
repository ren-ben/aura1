#pragma once
#include <cstdint>
#include "ports.h"

// PCF85063 on the shared I2C bus at 0x51. Battery backed, so it survives
// reboots and holds real wall-clock time through weeks offline.
class RtcClock : public Clock {
public:
  bool begin();
  uint64_t nowEpochSeconds() override;
  void setEpochSeconds(uint64_t seconds) override;

private:
  static constexpr uint8_t ADDRESS = 0x51;
  static constexpr uint8_t REG_CONTROL_1 = 0x00;
  static constexpr uint8_t REG_SECONDS = 0x04;
  uint64_t last_ = 0;  // returned when a read fails, never a zero-filled date
  static uint8_t bcdToDec(uint8_t v) { return (v >> 4) * 10 + (v & 0x0F); }
  static uint8_t decToBcd(uint8_t v) { return ((v / 10) << 4) | (v % 10); }
};
