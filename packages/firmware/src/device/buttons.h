#pragma once
#include <Arduino.h>
#include "session_machine.h"

// Waveshare ESP32-S3-ePaper-1.54. Both PWR and BOOT are user-programmable.
// GPIO0 is a strapping pin: never require it held during power-on.
constexpr int PIN_POWER_BTN   = 18;  // active LOW
constexpr int PIN_POWER_HOLD  = 17;  // HIGH keeps the board powered
constexpr int PIN_SUN_BTN     = 0;   // BOOT, active LOW
constexpr int PIN_PANEL_POWER = 6;   // LOW powers the panel
constexpr int PIN_AUX_POWER   = 42;  // LOW powers the "audio" rail, which also feeds the I2C bus (RTC)
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
constexpr int PIN_BATTERY     = 4;   // ADC1 ch3, battery through a 1:2 divider

constexpr unsigned long LONG_PRESS_MS = 700;
constexpr unsigned long DEBOUNCE_MS = 30;
constexpr unsigned long DOUBLE_MS = 260;  // a second SUN within this goes back up

class Buttons {
public:
  void begin() {
    pinMode(PIN_POWER_HOLD, OUTPUT);
    digitalWrite(PIN_POWER_HOLD, HIGH);  // latch power on, first thing
    pinMode(PIN_POWER_BTN, INPUT_PULLUP);
    pinMode(PIN_SUN_BTN, INPUT_PULLUP);
    // Holding POWER is how the board turns on, so it is usually still held here.
    // Ignore POWER until it has been seen released, or that release would
    // register as a long press and switch the device straight back off.
    pwrEdge_ = millis();
  }

  bool poll(Input& out) {
    arm();
    Input sun;
    if (read(PIN_SUN_BTN, sunDown_, sunLong_, sunAt_, sunEdge_, Input::SunShort, Input::SunLong, sun)) {
      // A short press is held back long enough to see whether a second one
      // follows: two together move the selection back up the list.
      if (sun == Input::SunShort) {
        if (held_) { held_ = false; out = Input::SunDouble; return true; }
        held_ = true;
        heldAt_ = millis();
        return false;
      }
      held_ = false;  // a long press cancels anything waiting
      out = sun;
      return true;
    }
    if (held_ && millis() - heldAt_ >= DOUBLE_MS) { held_ = false; out = Input::SunShort; return true; }
    return pwrArmed_ && read(PIN_POWER_BTN, pwrDown_, pwrLong_, pwrAt_, pwrEdge_, Input::PowerShort, Input::PowerLong, out);
  }

  // True while a button is down. Lets a sync give way to the user; the press
  // itself is still delivered by poll() once the sync has stopped.
  bool anyDown() {
    arm();
    return digitalRead(PIN_SUN_BTN) == LOW || (pwrArmed_ && digitalRead(PIN_POWER_BTN) == LOW);
  }

  // Nothing held and nothing half-handled: safe to sleep until the next press.
  bool settled() const {
    return !held_ && !sunDown_ && !pwrDown_
        && digitalRead(PIN_SUN_BTN) == HIGH && digitalRead(PIN_POWER_BTN) == HIGH;
  }

  static void powerOff() { digitalWrite(PIN_POWER_HOLD, LOW); }

private:
  // Arm POWER only once it has read HIGH for a full DEBOUNCE_MS, so the
  // bounce of the boot-hold release cannot read as a new press.
  void arm() {
    if (pwrArmed_) return;
    if (digitalRead(PIN_POWER_BTN) == LOW) pwrEdge_ = millis();
    else if (millis() - pwrEdge_ >= DEBOUNCE_MS) pwrArmed_ = true;
  }

  // A long press fires the moment it is held long enough, not on release, so
  // there is no guessing how long to hold. Its release then fires nothing.
  bool read(int pin, bool& down, bool& longFired, unsigned long& at, unsigned long& edge,
            Input shortPress, Input longPress, Input& out) {
    const bool pressed = digitalRead(pin) == LOW;
    const unsigned long now = millis();
    // Contacts bounce for a few ms on both edges. Without this, one press reads as
    // press-release-press and fires a spurious short press.
    if (now - edge < DEBOUNCE_MS) return false;
    if (pressed && !down) { down = true; longFired = false; at = now; edge = now; return false; }
    if (pressed && !longFired && now - at >= LONG_PRESS_MS) {
      longFired = true;
      out = longPress;
      return true;
    }
    if (!pressed && down) {
      down = false;
      edge = now;
      if (longFired) return false;
      out = shortPress;
      return true;
    }
    return false;
  }

  bool held_ = false;         // a short SUN waiting to see if a second follows
  unsigned long heldAt_ = 0;
  bool sunDown_ = false, pwrDown_ = false;
  bool sunLong_ = false, pwrLong_ = false;
  bool pwrArmed_ = false;
  unsigned long sunAt_ = 0, pwrAt_ = 0;
  unsigned long sunEdge_ = 0, pwrEdge_ = 0;
};
