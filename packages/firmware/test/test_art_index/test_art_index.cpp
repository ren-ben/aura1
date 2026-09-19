#include <unity.h>
#include "art_index.h"

void setUp() {}
void tearDown() {}

void test_parses_scene_lines() {
  auto scenes = parseArtIndex({ "wake wake-wave 3 200", "cameo cameo-happy 1 72" });
  TEST_ASSERT_EQUAL_INT(2, (int)scenes.size());
  TEST_ASSERT_EQUAL_STRING("wake-wave", scenes[0].id.c_str());
  TEST_ASSERT_EQUAL_INT(3, scenes[0].frames);
  TEST_ASSERT_EQUAL_INT(72, scenes[1].size);
}

void test_skips_malformed_lines() {
  auto scenes = parseArtIndex({ "wake wake-wave", "", "wake x 0 200", "wake y 1 900", "sleep ok 1 200" });
  TEST_ASSERT_EQUAL_INT(1, (int)scenes.size());
  TEST_ASSERT_EQUAL_STRING("ok", scenes[0].id.c_str());
}

void test_picks_only_matching_scenes() {
  auto scenes = parseArtIndex({ "wake a 1 200", "sleep b 1 200", "wake c 1 200" });
  TEST_ASSERT_EQUAL_STRING("a", pickScene(scenes, "wake", 0)->id.c_str());
  TEST_ASSERT_EQUAL_STRING("c", pickScene(scenes, "wake", 1)->id.c_str());
  TEST_ASSERT_EQUAL_STRING("a", pickScene(scenes, "wake", 2)->id.c_str());
  TEST_ASSERT_NULL(pickScene(scenes, "lore", 0));
}

void test_reads_the_optional_env() {
  auto scenes = parseArtIndex({ "sleep a 3 200 desk", "sleep b 3 200" });
  TEST_ASSERT_EQUAL_STRING("desk", scenes[0].env.c_str());
  TEST_ASSERT_EQUAL_STRING("", scenes[1].env.c_str());
}

void test_prefers_scenes_in_the_same_place() {
  auto scenes = parseArtIndex({ "sleep a 1 200 room", "sleep b 1 200 void", "sleep c 1 200 room", "wake d 1 200 room" });
  for (uint32_t roll = 0; roll < 4; ++roll) {
    TEST_ASSERT_EQUAL_STRING("b", pickScene(scenes, "sleep", roll, "void")->id.c_str());
  }
  // A place with no scene for the moment falls back to any of them.
  TEST_ASSERT_EQUAL_STRING("b", pickScene(scenes, "sleep", 1, "desk")->id.c_str());
  TEST_ASSERT_EQUAL_STRING("d", pickScene(scenes, "wake", 0, "void")->id.c_str());
}

void test_session_moment_is_the_lowercased_folder() {
  TEST_ASSERT_EQUAL_STRING("session-axiom", sessionMoment("AXIOM").c_str());
}

void test_sealed_moment_by_duration() {
  TEST_ASSERT_EQUAL_STRING("sealed-short", sealedMoment(9).c_str());
  TEST_ASSERT_EQUAL_STRING("sealed", sealedMoment(10).c_str());
  TEST_ASSERT_EQUAL_STRING("sealed-long", sealedMoment(90).c_str());
  TEST_ASSERT_EQUAL_STRING("sealed-marathon", sealedMoment(360).c_str());
}

void test_wake_after_decay_is_neglect() {
  TEST_ASSERT_EQUAL_STRING("wake", wakeMoment("stable").c_str());
  TEST_ASSERT_EQUAL_STRING("wake", wakeMoment("thinning").c_str());
  TEST_ASSERT_EQUAL_STRING("neglected", wakeMoment("dormant").c_str());
}

void test_screensaver_by_form_and_season() {
  TEST_ASSERT_EQUAL_STRING("lore", screensaverMoment("stable", "2026-09-19").c_str());
  TEST_ASSERT_EQUAL_STRING("decay-thinning", screensaverMoment("thinning", "2026-09-19").c_str());
  TEST_ASSERT_EQUAL_STRING("halloween", screensaverMoment("stable", "2026-10-31").c_str());
  TEST_ASSERT_EQUAL_STRING("lore", screensaverMoment("stable", "2026-10-23").c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_parses_scene_lines);
  RUN_TEST(test_skips_malformed_lines);
  RUN_TEST(test_picks_only_matching_scenes);
  RUN_TEST(test_reads_the_optional_env);
  RUN_TEST(test_prefers_scenes_in_the_same_place);
  RUN_TEST(test_session_moment_is_the_lowercased_folder);
  RUN_TEST(test_sealed_moment_by_duration);
  RUN_TEST(test_wake_after_decay_is_neglect);
  RUN_TEST(test_screensaver_by_form_and_season);
  return UNITY_END();
}
