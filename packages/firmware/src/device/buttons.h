#pragma once
#include <Arduino.h>
#include "session_machine.h"

// Waveshare ESP32-S3-ePaper-1.54. Both PWR and BOOT are user-programmable.
// GPIO0 is a strapping pin: never require it held during power-on.
constexpr int PIN_POWER_BTN   = 18;  // active LOW
constexpr int PIN_POWER_HOLD  = 17;  // HIGH keeps the board powered
constexpr int PIN_SUN_BTN     = 0;   // BOOT, active LOW
constexpr int PIN_PANEL_POWER = 6;   // LOW powers the panel
constexpr int PIN_EPD_BUSY    = 8;   // HIGH while busy, LOW when idle
constexpr int PIN_EPD_RST     = 9;
constexpr int PIN_EPD_DC      = 10;
constexpr int PIN_EPD_CS      = 11;
constexpr int PIN_EPD_SCK     = 12;
constexpr int PIN_EPD_MOSI    = 13;
constexpr int PIN_SD_CLK      = 39;  // SDMMC 1-bit, not SPI
constexpr int PIN_SD_D0       = 40;
constexpr int PIN_SD_CMD      = 41;
constexpr int PIN_I2C_SDA     = 47;
constexpr int PIN_I2C_SCL     = 48;

constexpr unsigned long LONG_PRESS_MS = 700;
constexpr unsigned long DEBOUNCE_MS = 30;

class Buttons {
public:
  void begin() {
    pinMode(PIN_POWER_HOLD, OUTPUT);
    digitalWrite(PIN_POWER_HOLD, HIGH);  // latch power on, first thing
    pinMode(PIN_POWER_BTN, INPUT_PULLUP);
    pinMode(PIN_SUN_BTN, INPUT_PULLUP);
    // Holding POWER is how the board turns on, so it is usually still held here.
    // Ignore POWER until it has been seen released once, or that release would
    // register as a long press and switch the device straight back off.
    pwrArmed_ = digitalRead(PIN_POWER_BTN) == HIGH;
  }

  bool poll(Input& out) {
    // Arming counts as an edge, so the release's own bounce cannot read as a new press.
    if (!pwrArmed_ && digitalRead(PIN_POWER_BTN) == HIGH) { pwrArmed_ = true; pwrEdge_ = millis(); }
    if (read(PIN_SUN_BTN, sunDown_, sunAt_, sunEdge_, Input::SunShort, Input::SunLong, out)) return true;
    return pwrArmed_ && read(PIN_POWER_BTN, pwrDown_, pwrAt_, pwrEdge_, Input::PowerShort, Input::PowerLong, out);
  }

  static void powerOff() { digitalWrite(PIN_POWER_HOLD, LOW); }

private:
  bool read(int pin, bool& down, unsigned long& at, unsigned long& edge,
            Input shortPress, Input longPress, Input& out) {
    const bool pressed = digitalRead(pin) == LOW;
    const unsigned long now = millis();
    // Contacts bounce for a few ms on both edges. Without this, one press reads as
    // press-release-press and fires a spurious short press.
    if (now - edge < DEBOUNCE_MS) return false;
    if (pressed && !down) { down = true; at = now; edge = now; return false; }
    if (!pressed && down) {
      down = false;
      edge = now;
      out = (now - at >= LONG_PRESS_MS) ? longPress : shortPress;
      return true;
    }
    return false;
  }

  bool sunDown_ = false, pwrDown_ = false;
  bool pwrArmed_ = false;
  unsigned long sunAt_ = 0, pwrAt_ = 0;
  unsigned long sunEdge_ = 0, pwrEdge_ = 0;
};
