#include <unity.h>
#include "daily.h"
#include "../fake_storage.h"

void setUp() {}
void tearDown() {}

static const char* BUNDLE =
  "{\"date\":\"2026-09-19\",\"form\":\"stable\",\"level\":3,\"lastSessionAt\":\"2026-09-19T08:00:00Z\","
  "\"todos\":[{\"id\":7,\"body\":\"write\",\"done\":false},{\"id\":8,\"body\":\"read\",\"done\":true}],"
  "\"habits\":[{\"id\":2,\"name\":\"stretch\",\"done\":false}],"
  "\"quotes\":[{\"body\":\"Fear the old blood.\",\"source\":null}]}";

// 2026-09-19T08:00:00Z
constexpr uint64_t LAST = 1789804800ULL;

void test_replace_parses_and_saves_the_bundle() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(BUNDLE);
  TEST_ASSERT_EQUAL_STRING("2026-09-19", daily.date().c_str());
  TEST_ASSERT_EQUAL_INT(3, daily.level());
  TEST_ASSERT_EQUAL_INT(2, (int)daily.todos().size());
  TEST_ASSERT_EQUAL_STRING("stretch", daily.habits()[0].text.c_str());
  TEST_ASSERT_EQUAL_STRING("Fear the old blood.", daily.quotes()[0].body.c_str());
  Daily reloaded(storage);
  reloaded.load();
  TEST_ASSERT_EQUAL_INT(2, (int)reloaded.todos().size());
}

// Vienna in summer: UTC+2. 2026-09-19T22:30:00Z is already the 20th there.
static const char* DAY =
  "{\"date\":\"2026-09-19\",\"utcOffset\":120,\"level\":1,\"lastSessionAt\":null,"
  "\"todos\":[{\"id\":7,\"body\":\"write\",\"done\":false},{\"id\":8,\"body\":\"read\",\"done\":true}],"
  "\"habits\":[{\"id\":2,\"name\":\"stretch\",\"done\":true,\"history\":\"0011\"}],\"quotes\":[]}";

void test_the_day_turning_drops_done_todos_and_opens_habits() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(DAY);
  const uint64_t evening = 1789851600ULL;  // 2026-09-19T21:00:00Z, 23:00 local
  TEST_ASSERT_FALSE(daily.rollover(evening));
  TEST_ASSERT_EQUAL_INT(2, (int)daily.todos().size());
  TEST_ASSERT_TRUE(daily.rollover(evening + 5400));  // 00:30 local
  TEST_ASSERT_EQUAL_STRING("2026-09-20", daily.date().c_str());
  TEST_ASSERT_EQUAL_INT(1, (int)daily.todos().size());
  TEST_ASSERT_EQUAL_STRING("write", daily.todos()[0].text.c_str());
  TEST_ASSERT_FALSE(daily.habits()[0].done);
  TEST_ASSERT_EQUAL_STRING("00110", daily.habits()[0].history.c_str());
  TEST_ASSERT_FALSE(daily.rollover(evening + 7200));
}

void test_ticking_a_habit_marks_today_in_its_graph() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(DAY);
  TEST_ASSERT_TRUE(daily.toggleHabit(0));
  TEST_ASSERT_EQUAL_STRING("0010", daily.habits()[0].history.c_str());
}

void test_toggling_queues_absolute_ticks() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(BUNDLE);
  TEST_ASSERT_TRUE(daily.toggleTodo(0));
  TEST_ASSERT_TRUE(daily.todos()[0].done);
  TEST_ASSERT_TRUE(daily.toggleTodo(1));
  TEST_ASSERT_TRUE(daily.toggleHabit(0));
  TEST_ASSERT_FALSE(daily.toggleTodo(9));
  const auto ticks = daily.ticks();
  TEST_ASSERT_EQUAL_INT(3, (int)ticks.size());
  TEST_ASSERT_EQUAL_STRING("todo 7 1", ticks[0].c_str());
  TEST_ASSERT_EQUAL_STRING("todo 8 0", ticks[1].c_str());
  TEST_ASSERT_EQUAL_STRING("habit 2 2026-09-19 1", ticks[2].c_str());
}

void test_a_fresh_bundle_clears_the_ticks() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(BUNDLE);
  daily.toggleTodo(0);
  daily.replace(BUNDLE);
  TEST_ASSERT_EQUAL_INT(0, (int)daily.ticks().size());
}

void test_a_bad_bundle_changes_nothing() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(BUNDLE);
  daily.replace("not json");
  TEST_ASSERT_EQUAL_INT(2, (int)daily.todos().size());
}

void test_all_todos_done() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(BUNDLE);
  TEST_ASSERT_FALSE(daily.allTodosDone());
  daily.toggleTodo(0);
  TEST_ASSERT_TRUE(daily.allTodosDone());
}

void test_form_by_hours_since_the_last_session() {
  FakeStorage storage;
  Daily daily(storage);
  TEST_ASSERT_EQUAL_STRING("stable", daily.form(LAST).c_str());
  daily.replace(BUNDLE);
  TEST_ASSERT_EQUAL_STRING("stable", daily.form(LAST + 23 * 3600).c_str());
  TEST_ASSERT_EQUAL_STRING("thinning", daily.form(LAST + 24 * 3600).c_str());
  TEST_ASSERT_EQUAL_STRING("fragmenting", daily.form(LAST + 48 * 3600).c_str());
  TEST_ASSERT_EQUAL_STRING("dormant", daily.form(LAST + 72 * 3600).c_str());
}

void test_a_session_ended_here_counts_before_the_next_sync() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace(BUNDLE);
  daily.sessionEnded(LAST + 70 * 3600, 5, 30);
  TEST_ASSERT_EQUAL_STRING("stable", daily.form(LAST + 72 * 3600).c_str());
}

void test_once_dormant_only_the_ritual_wakes_him_here() {
  FakeStorage storage;
  Daily daily(storage);
  daily.replace("{\"date\":\"2026-09-19\",\"form\":\"dormant\",\"resurrectionId\":42,\"lastSessionAt\":null}");
  TEST_ASSERT_EQUAL_INT(42, daily.resurrectionId());
  daily.sessionEnded(LAST, 5, 90);
  TEST_ASSERT_EQUAL_STRING("dormant", daily.form(LAST + 60).c_str());
  daily.sessionEnded(LAST, 42, 59);
  TEST_ASSERT_EQUAL_STRING("dormant", daily.form(LAST + 60).c_str());
  daily.sessionEnded(LAST, 42, 60);
  TEST_ASSERT_EQUAL_STRING("stable", daily.form(LAST + 60).c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_replace_parses_and_saves_the_bundle);
  RUN_TEST(test_toggling_queues_absolute_ticks);
  RUN_TEST(test_a_fresh_bundle_clears_the_ticks);
  RUN_TEST(test_a_bad_bundle_changes_nothing);
  RUN_TEST(test_all_todos_done);
  RUN_TEST(test_the_day_turning_drops_done_todos_and_opens_habits);
  RUN_TEST(test_ticking_a_habit_marks_today_in_its_graph);
  RUN_TEST(test_form_by_hours_since_the_last_session);
  RUN_TEST(test_a_session_ended_here_counts_before_the_next_sync);
  RUN_TEST(test_once_dormant_only_the_ritual_wakes_him_here);
  return UNITY_END();
}
