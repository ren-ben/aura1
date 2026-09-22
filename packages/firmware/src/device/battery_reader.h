#pragma once
#include <Arduino.h>
#include "buttons.h"

// Raw millivolts at the cell, before BatteryGauge corrects them: the pin sees
// half the battery through a 200k/200k divider. Many spaced samples, as the
// divider is slow to recharge the ADC between them.
inline int readBatteryMillivolts() {
  uint32_t mv = 0;
  for (int i = 0; i < 32; ++i) {
    mv += analogReadMilliVolts(PIN_BATTERY);
    delayMicroseconds(100);
  }
  return static_cast<int>(mv / 32 * 2);
}

// A computer on the USB port (it sends frames; a wall charger does not).
inline bool usbHost() { return HWCDC::isPlugged(); }
