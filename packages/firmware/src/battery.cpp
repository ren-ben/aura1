#include "battery.h"
#include <algorithm>
#include <iterator>

namespace {
struct Point { int mv; int percent; };
// A typical single-cell LiPo discharge curve at rest.
constexpr Point CURVE[] = {
  {3300, 0}, {3500, 5}, {3680, 20}, {3750, 40}, {3850, 60}, {4000, 80}, {4200, 100},
};
constexpr int FULL_MV = 4200;
constexpr int MAX_FULL_RAW = 4300;  // above this a reading is noise, not a full cell
}  // namespace

int batteryPercent(int millivolts) {
  if (millivolts <= CURVE[0].mv) return 0;
  for (const Point* p = CURVE + 1; p != std::end(CURVE); ++p) {
    if (millivolts <= p->mv) {
      const Point& lo = *(p - 1);
      return lo.percent + (millivolts - lo.mv) * (p->percent - lo.percent) / (p->mv - lo.mv);
    }
  }
  return 100;
}

void BatteryGauge::setFullRaw(int raw) {
  fullRaw_ = std::clamp(raw, DEFAULT_FULL_RAW, MAX_FULL_RAW);
}

int BatteryGauge::millivolts() const {
  return smooth_ * FULL_MV / fullRaw_;
}

void BatteryGauge::sample(int raw, bool usbHost) {
  usbHost_ = usbHost;
  // A moving average over about a minute of samples: single readings jitter.
  smooth_ = smooth_ == 0 ? raw : smooth_ + (raw - smooth_) / 4;
  if (floor_ == 0) floor_ = peak_ = smooth_;
  if (smooth_ > fullRaw_) setFullRaw(smooth_);

  if (rising_) {
    peak_ = std::max(peak_, smooth_);
    if (smooth_ <= peak_ - TREND_MV) { rising_ = false; floor_ = smooth_; }
  } else {
    floor_ = std::min(floor_, smooth_);
    if (smooth_ >= floor_ + TREND_MV) { rising_ = true; peak_ = smooth_; }
  }

  // Quarters, with a margin before a step so a reading on the line does not
  // flicker between two. On battery the level only ever goes down.
  const int p = percent();
  const int raw4 = std::clamp((p + 12) / 25, 0, 4);
  if (bars_ < 0) { bars_ = raw4; return; }
  if (raw4 < bars_ && p < bars_ * 25 - 12 - 4) bars_ = raw4;
  else if (raw4 > bars_ && charging() && p >= raw4 * 25 - 12 + 4) bars_ = raw4;
}
