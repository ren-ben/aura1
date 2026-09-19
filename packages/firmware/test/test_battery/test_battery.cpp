#include <unity.h>
#include "battery.h"

void setUp() {}
void tearDown() {}

void test_clamps_outside_the_curve() {
  TEST_ASSERT_EQUAL_INT(0, batteryPercent(3000));
  TEST_ASSERT_EQUAL_INT(0, batteryPercent(3300));
  TEST_ASSERT_EQUAL_INT(100, batteryPercent(4200));
  TEST_ASSERT_EQUAL_INT(100, batteryPercent(4400));  // charging on USB
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

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_clamps_outside_the_curve);
  RUN_TEST(test_hits_the_curve_points);
  RUN_TEST(test_interpolates_between_points);
  return UNITY_END();
}
