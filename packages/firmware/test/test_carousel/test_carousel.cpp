#include <unity.h>
#include <type_traits>
#include "carousel.h"

static_assert(!std::is_copy_constructible_v<Carousel>);
static_assert(!std::is_copy_assignable_v<Carousel>);
static_assert(std::is_move_constructible_v<Carousel>);

void setUp() {}
void tearDown() {}

static void loadTwoFolders(Carousel& c) {
  c.load(
    { {1, "AXIOM"}, {2, "WORKSHOP"} },
    {
      {10, 1, "coursework",   100},
      {11, 1, "problem sets", 300},
      {20, 2, "aura-1",       200},
      {21, 2, "side project",   0},
    });
}

static Carousel makeCarousel() {
  Carousel c;
  loadTwoFolders(c);
  return c;
}

void test_starts_on_the_folder_list_with_nothing_to_start() {
  Carousel c = makeCarousel();
  TEST_ASSERT_TRUE(c.level() == Level::Folders);
  TEST_ASSERT_EQUAL_INT(0, c.currentActivityId());
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_STRING("FOLDERS", vm.title.c_str());
  TEST_ASSERT_EQUAL_INT(2, (int)vm.items.size());
  TEST_ASSERT_EQUAL_STRING("AXIOM", vm.items[0].c_str());
  TEST_ASSERT_TRUE(vm.top);
}

void test_next_on_the_folder_list_moves_and_wraps() {
  Carousel c = makeCarousel();
  c.next();
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_INT(1, vm.cursor);
  c.next();
  c.fill(vm);
  TEST_ASSERT_EQUAL_INT(0, vm.cursor);
}

void test_enter_opens_on_the_most_recently_used_activity() {
  Carousel c = makeCarousel();
  c.enter();
  TEST_ASSERT_TRUE(c.level() == Level::Activities);
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_STRING("AXIOM", vm.title.c_str());
  TEST_ASSERT_EQUAL_STRING("problem sets", vm.items[0].c_str());
  TEST_ASSERT_EQUAL_STRING("problem sets", vm.activity.c_str());
  TEST_ASSERT_FALSE(vm.top);
}

void test_next_inside_a_folder_cycles_its_activities() {
  Carousel c = makeCarousel();
  c.enter();
  c.next();
  TEST_ASSERT_EQUAL_INT(10, c.currentActivityId());
  c.next();
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
}

void test_up_returns_to_the_folder_it_came_from() {
  Carousel c = makeCarousel();
  c.next();
  c.enter();
  c.up();
  TEST_ASSERT_TRUE(c.level() == Level::Folders);
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_INT(1, vm.cursor);
}

void test_open_activity_jumps_into_its_folder() {
  Carousel c = makeCarousel();
  c.openActivity(21);
  TEST_ASSERT_TRUE(c.level() == Level::Activities);
  TEST_ASSERT_EQUAL_INT(21, c.currentActivityId());
}

void test_open_unknown_activity_falls_back_to_the_folder_list() {
  Carousel c = makeCarousel();
  c.openActivity(99);
  TEST_ASSERT_TRUE(c.level() == Level::Folders);
  TEST_ASSERT_EQUAL_INT(0, c.currentActivityId());
}

void test_reload_keeps_the_selected_activity() {
  Carousel c = makeCarousel();
  c.openActivity(21);
  loadTwoFolders(c);
  TEST_ASSERT_EQUAL_INT(21, c.currentActivityId());
}

void test_reload_keeps_the_folder_when_its_activity_is_gone() {
  Carousel c = makeCarousel();
  c.openActivity(21);
  c.load({ {1, "AXIOM"}, {2, "WORKSHOP"} },
         { {10, 1, "coursework", 0}, {20, 2, "aura-1", 0} });
  TEST_ASSERT_EQUAL_INT(20, c.currentActivityId());
}

void test_empty_folders_are_not_listed() {
  Carousel c;
  c.load({ {1, "AXIOM"}, {2, "WORKSHOP"} }, { {20, 2, "aura-1", 0} });
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_INT(1, (int)vm.items.size());
  TEST_ASSERT_EQUAL_STRING("WORKSHOP", vm.items[0].c_str());
}

void test_ties_break_by_id_ascending() {
  Carousel c;
  c.load({ {1, "AXIOM"} },
         {
           {30, 1, "third",  0},
           {10, 1, "first",  0},
           {20, 1, "second", 0},
         });
  c.enter();
  TEST_ASSERT_EQUAL_INT(10, c.currentActivityId());
  c.next();
  TEST_ASSERT_EQUAL_INT(20, c.currentActivityId());
  c.next();
  TEST_ASSERT_EQUAL_INT(30, c.currentActivityId());
}

void test_reloading_an_empty_config_leaves_nothing_selected() {
  Carousel c = makeCarousel();
  c.enter();
  c.load({}, {});
  c.next();
  c.enter();
  TEST_ASSERT_EQUAL_INT(0, c.currentActivityId());
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_STRING("", vm.folder.c_str());
  TEST_ASSERT_EQUAL_STRING("", vm.activity.c_str());
  TEST_ASSERT_EQUAL_INT(0, (int)vm.items.size());
  TEST_ASSERT_EQUAL_INT(0, vm.cursor);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_starts_on_the_folder_list_with_nothing_to_start);
  RUN_TEST(test_next_on_the_folder_list_moves_and_wraps);
  RUN_TEST(test_enter_opens_on_the_most_recently_used_activity);
  RUN_TEST(test_next_inside_a_folder_cycles_its_activities);
  RUN_TEST(test_up_returns_to_the_folder_it_came_from);
  RUN_TEST(test_open_activity_jumps_into_its_folder);
  RUN_TEST(test_open_unknown_activity_falls_back_to_the_folder_list);
  RUN_TEST(test_reload_keeps_the_selected_activity);
  RUN_TEST(test_reload_keeps_the_folder_when_its_activity_is_gone);
  RUN_TEST(test_empty_folders_are_not_listed);
  RUN_TEST(test_ties_break_by_id_ascending);
  RUN_TEST(test_reloading_an_empty_config_leaves_nothing_selected);
  return UNITY_END();
}
