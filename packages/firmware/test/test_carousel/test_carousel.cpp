#include <unity.h>
#include "carousel.h"

void setUp() {}
void tearDown() {}

static Carousel makeCarousel() {
  Carousel c;
  c.load(
    { {1, "AXIOM"}, {2, "WORKSHOP"} },
    {
      {10, 1, "coursework",   100},
      {11, 1, "problem sets", 300},
      {20, 2, "aura-1",       200},
      {21, 2, "side project",   0},
    });
  return c;
}

void test_starts_on_most_recently_used_activity_of_first_folder() {
  Carousel c = makeCarousel();
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
}

void test_short_press_cycles_within_folder_and_wraps() {
  Carousel c = makeCarousel();
  c.nextActivity();
  TEST_ASSERT_EQUAL_INT(10, c.currentActivityId());
  c.nextActivity();
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
}

void test_long_press_moves_to_next_folder_most_recently_used() {
  Carousel c = makeCarousel();
  c.nextFolder();
  TEST_ASSERT_EQUAL_INT(20, c.currentActivityId());
}

void test_long_press_wraps_back_to_first_folder() {
  Carousel c = makeCarousel();
  c.nextFolder();
  c.nextFolder();
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
}

void test_fill_populates_the_view_model() {
  Carousel c = makeCarousel();
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_STRING("AXIOM", vm.folder.c_str());
  TEST_ASSERT_EQUAL_STRING("problem sets", vm.activity.c_str());
  TEST_ASSERT_EQUAL_INT(0, vm.cursor);
  TEST_ASSERT_EQUAL_INT(2, vm.count);
  TEST_ASSERT_EQUAL_INT(2, vm.folderCount);
}

void test_empty_folder_is_skipped_rather_than_stranding_the_cursor() {
  Carousel c;
  c.load({ {1, "AXIOM"}, {2, "WORKSHOP"} }, { {20, 2, "aura-1", 0} });
  TEST_ASSERT_EQUAL_INT(20, c.currentActivityId());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_starts_on_most_recently_used_activity_of_first_folder);
  RUN_TEST(test_short_press_cycles_within_folder_and_wraps);
  RUN_TEST(test_long_press_moves_to_next_folder_most_recently_used);
  RUN_TEST(test_long_press_wraps_back_to_first_folder);
  RUN_TEST(test_fill_populates_the_view_model);
  RUN_TEST(test_empty_folder_is_skipped_rather_than_stranding_the_cursor);
  return UNITY_END();
}
