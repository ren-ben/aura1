#include <unity.h>
#include "time_util.h"

void setUp() {}
void tearDown() {}

// Every pair below was checked with GNU date: date -u -d @N / date -u -d ISO +%s.

void test_formats_known_epochs() {
  TEST_ASSERT_EQUAL_STRING("1970-01-01T00:00:00Z", toIso8601(0).c_str());
  TEST_ASSERT_EQUAL_STRING("2025-09-17T10:00:00Z", toIso8601(1758103200ULL).c_str());
  TEST_ASSERT_EQUAL_STRING("2026-09-17T10:00:00Z", toIso8601(1789639200ULL).c_str());
  TEST_ASSERT_EQUAL_STRING("2000-02-29T12:34:56Z", toIso8601(951827696ULL).c_str());
}

void test_parses_known_iso_strings() {
  uint64_t out = 1;
  TEST_ASSERT_TRUE(fromIso8601("1970-01-01T00:00:00Z", out));
  TEST_ASSERT_EQUAL_UINT64(0, out);
  TEST_ASSERT_TRUE(fromIso8601("2025-09-17T10:00:00Z", out));
  TEST_ASSERT_EQUAL_UINT64(1758103200ULL, out);
  TEST_ASSERT_TRUE(fromIso8601("2000-02-29T12:34:56Z", out));
  TEST_ASSERT_EQUAL_UINT64(951827696ULL, out);
}

void test_leap_day_2028() {
  TEST_ASSERT_EQUAL_STRING("2028-02-29T00:00:00Z", toIso8601(1835395200ULL).c_str());
  TEST_ASSERT_EQUAL_STRING("2028-02-29T23:59:59Z", toIso8601(1835481599ULL).c_str());
  TEST_ASSERT_EQUAL_STRING("2028-03-01T00:00:00Z", toIso8601(1835481600ULL).c_str());
  uint64_t out = 0;
  TEST_ASSERT_TRUE(fromIso8601("2028-02-29T00:00:00Z", out));
  TEST_ASSERT_EQUAL_UINT64(1835395200ULL, out);
}

void test_2100_is_not_a_leap_year() {
  TEST_ASSERT_EQUAL_UINT64(4107456000ULL, civilToEpoch(2100, 2, 28, 0, 0, 0));
  TEST_ASSERT_EQUAL_UINT64(4107542400ULL, civilToEpoch(2100, 3, 1, 0, 0, 0));
  TEST_ASSERT_EQUAL_STRING("2100-03-01T00:00:00Z", toIso8601(4107456000ULL + 86400).c_str());
  uint64_t out = 0;
  TEST_ASSERT_FALSE(fromIso8601("2100-02-29T00:00:00Z", out));
}

void test_after_2038() {
  TEST_ASSERT_EQUAL_STRING("2040-01-01T00:00:00Z", toIso8601(2208988800ULL).c_str());
  TEST_ASSERT_EQUAL_STRING("2099-12-31T23:59:59Z", toIso8601(4102444799ULL).c_str());
  uint64_t out = 0;
  TEST_ASSERT_TRUE(fromIso8601("2040-01-01T00:00:00Z", out));
  TEST_ASSERT_EQUAL_UINT64(2208988800ULL, out);
}

void test_round_trips() {
  const uint64_t samples[] = { 0, 59, 86399, 86400, 951827696ULL, 1758103200ULL,
                               1835481599ULL, 2208988800ULL, 4102444799ULL, 4107542400ULL };
  for (const uint64_t s : samples) {
    uint64_t back = 0;
    TEST_ASSERT_TRUE(fromIso8601(toIso8601(s), back));
    TEST_ASSERT_EQUAL_UINT64(s, back);
    const Civil c = epochToCivil(s);
    TEST_ASSERT_EQUAL_UINT64(s, civilToEpoch(c.year, c.month, c.day, c.hour, c.minute, c.second));
  }
}

void test_civil_fields_and_weekday() {
  const Civil c = epochToCivil(1789639200ULL + 3723);  // 2026-09-17T11:02:03Z, a Thursday
  TEST_ASSERT_EQUAL_INT(2026, c.year);
  TEST_ASSERT_EQUAL_UINT(9, c.month);
  TEST_ASSERT_EQUAL_UINT(17, c.day);
  TEST_ASSERT_EQUAL_UINT(11, c.hour);
  TEST_ASSERT_EQUAL_UINT(2, c.minute);
  TEST_ASSERT_EQUAL_UINT(3, c.second);
  TEST_ASSERT_EQUAL_UINT(4, c.weekday);  // 0 = Sunday
  TEST_ASSERT_EQUAL_UINT(4, epochToCivil(0).weekday);  // 1970-01-01 was a Thursday
}

void test_parses_millisecond_server_time() {
  uint64_t out = 0;
  TEST_ASSERT_TRUE(fromIso8601("2026-09-17T10:00:00.123Z", out));
  TEST_ASSERT_EQUAL_UINT64(1789639200ULL, out);
  TEST_ASSERT_TRUE(fromIso8601("2026-09-17T10:00:00.999Z", out));
  TEST_ASSERT_EQUAL_UINT64(1789639200ULL, out);
}

void test_rejects_malformed() {
  uint64_t out = 42;
  const char* bad[] = {
    "2026-09-17T10:00:00",       // no Z
    "2026-13-01T00:00:00Z",      // month 13
    "garbage",
    "",
    "2026-09-17T10:00:00+00:00",
    "2026-09-17 10:00:00Z",
    "2026-09-17T10:00:00.Z",
    "2026-09-17T10:00:00ZZ",
    "2026-09-31T00:00:00Z",
    "2026-00-10T00:00:00Z",
    "2026-09-17T24:00:00Z",
    "2026-09-17T10:60:00Z",
    "2026-09-17T10:00:60Z",
    "1969-12-31T23:59:59Z",
    "2026-9-17T10:00:00Z",
  };
  for (const char* s : bad) {
    TEST_ASSERT_FALSE_MESSAGE(fromIso8601(s, out), s);
  }
  TEST_ASSERT_EQUAL_UINT64(42, out);  // untouched on failure
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_formats_known_epochs);
  RUN_TEST(test_parses_known_iso_strings);
  RUN_TEST(test_leap_day_2028);
  RUN_TEST(test_2100_is_not_a_leap_year);
  RUN_TEST(test_after_2038);
  RUN_TEST(test_round_trips);
  RUN_TEST(test_civil_fields_and_weekday);
  RUN_TEST(test_parses_millisecond_server_time);
  RUN_TEST(test_rejects_malformed);
  return UNITY_END();
}
