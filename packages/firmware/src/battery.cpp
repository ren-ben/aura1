#include "battery.h"
#include <iterator>

namespace {
struct Point { int mv; int percent; };
// A typical single-cell LiPo discharge curve at rest.
constexpr Point CURVE[] = {
  {3300, 0}, {3500, 5}, {3680, 20}, {3750, 40}, {3850, 60}, {4000, 80}, {4200, 100},
};
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
