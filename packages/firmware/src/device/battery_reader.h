#pragma once
#include <Arduino.h>
#include "buttons.h"

// Averaged over 8 samples; the pin sees half the battery voltage.
inline int readBatteryMillivolts() {
  uint32_t mv = 0;
  for (int i = 0; i < 8; ++i) mv += analogReadMilliVolts(PIN_BATTERY);
  return static_cast<int>(mv / 8 * 2);
}
