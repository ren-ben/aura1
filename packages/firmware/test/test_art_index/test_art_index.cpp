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

void test_session_moment_is_the_lowercased_folder() {
  TEST_ASSERT_EQUAL_STRING("session-axiom", sessionMoment("AXIOM").c_str());
}

void test_sealed_moment_by_duration() {
  TEST_ASSERT_EQUAL_STRING("sealed-short", sealedMoment(4).c_str());
  TEST_ASSERT_EQUAL_STRING("sealed", sealedMoment(5).c_str());
  TEST_ASSERT_EQUAL_STRING("sealed-long", sealedMoment(90).c_str());
  TEST_ASSERT_EQUAL_STRING("sealed-marathon", sealedMoment(360).c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_parses_scene_lines);
  RUN_TEST(test_skips_malformed_lines);
  RUN_TEST(test_picks_only_matching_scenes);
  RUN_TEST(test_session_moment_is_the_lowercased_folder);
  RUN_TEST(test_sealed_moment_by_duration);
  return UNITY_END();
}
