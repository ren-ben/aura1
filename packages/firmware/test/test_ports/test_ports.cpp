#include <unity.h>
#include "view_model.h"

void setUp() {}
void tearDown() {}

void test_view_model_defaults_to_idle() {
  ViewModel vm;
  TEST_ASSERT_TRUE(vm.screen == Screen::Idle);
  TEST_ASSERT_EQUAL_INT(0, vm.cursor);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_view_model_defaults_to_idle);
  return UNITY_END();
}
