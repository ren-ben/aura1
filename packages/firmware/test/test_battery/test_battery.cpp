#include <unity.h>
#include "battery.h"

void setUp() {}
void tearDown() {}

void test_clamps_outside_the_curve() {
  TEST_ASSERT_EQUAL_INT(0, batteryPercent(3000));
  TEST_ASSERT_EQUAL_INT(0, batteryPercent(3300));
  TEST_ASSERT_EQUAL_INT(100, batteryPercent(4200));
  TEST_ASSERT_EQUAL_INT(100, batteryPercent(4400));
}

void test_hits_the_curve_points() {
  TEST_ASSERT_EQUAL_INT(20, batteryPercent(3680));
  TEST_ASSERT_EQUAL_INT(60, batteryPercent(3850));
  TEST_ASSERT_EQUAL_INT(80, batteryPercent(4000));
}

void test_interpolates_between_points() {
  TEST_ASSERT_EQUAL_INT(90, batteryPercent(4100));
  TEST_ASSERT_EQUAL_INT(50, batteryPercent(3800));
}

static void feed(BatteryGauge& g, int raw, int times, bool usb = false) {
  for (int i = 0; i < times; ++i) g.sample(raw, usb);
}

// The divider reads low: a full cell reads about 3.88 V, and shows full.
void test_a_low_reading_full_cell_shows_four_bars() {
  BatteryGauge g;
  feed(g, 3880, 5);
  TEST_ASSERT_EQUAL_INT(4200, g.millivolts());
  TEST_ASSERT_EQUAL_INT(4, g.bars());
}

void test_learns_the_full_reading_from_the_charger() {
  BatteryGauge g;
  feed(g, 3950, 40);
  TEST_ASSERT_INT_WITHIN(5, 3950, g.fullRaw());
  TEST_ASSERT_INT_WITHIN(10, 4200, g.millivolts());
  g.setFullRaw(9999);
  TEST_ASSERT_EQUAL_INT(4300, g.fullRaw());
  g.setFullRaw(100);
  TEST_ASSERT_EQUAL_INT(BatteryGauge::DEFAULT_FULL_RAW, g.fullRaw());
}

void test_jitter_on_a_step_does_not_flicker() {
  BatteryGauge g;
  // Right on the line between 1 and 2 bars, jittering 40 mV either way.
  feed(g, 3455, 10);
  const int bars = g.bars();
  for (int i = 0; i < 40; ++i) g.sample(i % 2 ? 3415 : 3495, false);
  TEST_ASSERT_EQUAL_INT(bars, g.bars());
}

void test_on_battery_the_bars_never_climb() {
  BatteryGauge g;
  feed(g, 3500, 20);
  const int bars = g.bars();
  feed(g, 3530, 20);  // recovering after a load, not charging
  TEST_ASSERT_FALSE(g.charging());
  TEST_ASSERT_EQUAL_INT(bars, g.bars());
}

static void ramp(BatteryGauge& g, int from, int to, int step) {
  for (int raw = from; raw <= to; raw += step) g.sample(raw, false);
}

void test_a_climbing_voltage_is_charging_until_it_falls() {
  BatteryGauge g;
  feed(g, 3500, 25);
  TEST_ASSERT_FALSE(g.charging());
  ramp(g, 3500, 3620, 3);  // plugged in: the cell climbs, minute after minute
  TEST_ASSERT_TRUE(g.charging());
  ramp(g, 3620, 3860, 3);
  feed(g, 3860, 40);        // full: held there, still plugged in
  TEST_ASSERT_TRUE(g.charging());
  TEST_ASSERT_EQUAL_INT(4, g.bars());
  feed(g, 3780, 20);  // unplugged: it drops back
  TEST_ASSERT_FALSE(g.charging());
}

// Waking sags the cell under the display and the radio; it jumps back and
// settles. That is not charging.
void test_a_cell_recovering_from_a_load_is_not_charging() {
  BatteryGauge g;
  feed(g, 3440, 2);
  feed(g, 3560, 60);
  TEST_ASSERT_FALSE(g.charging());
}

void test_a_climb_that_stalls_below_full_stops_charging() {
  BatteryGauge g;
  feed(g, 3500, 25);
  ramp(g, 3500, 3600, 3);
  TEST_ASSERT_TRUE(g.charging());
  feed(g, 3600, 40);
  TEST_ASSERT_FALSE(g.charging());
}

void test_a_computer_on_usb_is_charging() {
  BatteryGauge g;
  feed(g, 3600, 3, true);
  TEST_ASSERT_TRUE(g.charging());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_clamps_outside_the_curve);
  RUN_TEST(test_hits_the_curve_points);
  RUN_TEST(test_interpolates_between_points);
  RUN_TEST(test_a_low_reading_full_cell_shows_four_bars);
  RUN_TEST(test_learns_the_full_reading_from_the_charger);
  RUN_TEST(test_jitter_on_a_step_does_not_flicker);
  RUN_TEST(test_on_battery_the_bars_never_climb);
  RUN_TEST(test_a_climbing_voltage_is_charging_until_it_falls);
  RUN_TEST(test_a_cell_recovering_from_a_load_is_not_charging);
  RUN_TEST(test_a_climb_that_stalls_below_full_stops_charging);
  RUN_TEST(test_a_computer_on_usb_is_charging);
  return UNITY_END();
}
