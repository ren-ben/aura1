#pragma once

// LiPo charge from its resting voltage. The curve is flat in the middle, so
// this is an estimate: good for a 4-step icon, not for a percentage readout.
int batteryPercent(int millivolts);

// The battery as the icon shows it, from raw readings of the sense pin.
//
// The pin sits on a 200k/200k divider, which the ADC loads: raw readings run
// several percent low, and a full cell never read as full. The charger holds
// the cell at exactly 4.2 V when full, so the highest reading ever seen is
// what 4.2 V reads as on this board; every reading is scaled by it.
//
// The board has no charge-status pin and the sense pin only ever sees the
// cell, never USB. Charging shows as the voltage climbing, and stops when it
// falls back; a computer on the USB port counts as charging straight away.
class BatteryGauge {
public:
  // Once every few seconds, with the radio off (it sags the cell).
  void sample(int rawMillivolts, bool usbHost);
  int millivolts() const;  // smoothed and corrected
  int percent() const { return batteryPercent(millivolts()); }
  int bars() const { return bars_; }  // 0..4, never climbing on battery
  bool charging() const { return usbHost_ || rising_; }
  // The learned full reading, kept on the card across boots.
  int fullRaw() const { return fullRaw_; }
  void setFullRaw(int raw);

  static constexpr int DEFAULT_FULL_RAW = 3880;  // before a full charge is seen
  static constexpr int TREND_MV = 50;            // a climb or fall this big

private:
  int smooth_ = 0;  // raw, smoothed
  int fullRaw_ = DEFAULT_FULL_RAW;
  int floor_ = 0;   // lowest since charging stopped
  int peak_ = 0;    // highest since charging started
  int bars_ = -1;
  bool rising_ = false;
  bool usbHost_ = false;
};
