#include <unity.h>
#include <string>
#include <vector>
#include <ArduinoJson.h>
#include "sync_codec.h"

void setUp() {}
void tearDown() {}

static const char* UUID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
static const char* UUID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

static std::string uuidFor(int i) {
  std::string n = std::to_string(i);
  return "00000000-0000-4000-8000-" + std::string(12 - n.size(), '0') + n;
}

// ---- buildRequest ----

void test_request_has_the_exact_wire_shape() {
  const std::vector<QueuedEvent> pending = {
    { UUID_A, 7, 1789639200ULL, 1789641000ULL, true },
    { UUID_B, 12, 1758103200ULL, 1758106800ULL, false },
  };
  const std::string body = buildRequest("aura-1", 3, pending);
  TEST_ASSERT_EQUAL_STRING(
    "{\"deviceId\":\"aura-1\",\"configVersion\":3,\"events\":["
    "{\"uuid\":\"0f8fad5b-d9cb-469f-a165-70867728950e\",\"activityId\":7,"
    "\"startedAt\":\"2026-09-17T10:00:00Z\",\"endedAt\":\"2026-09-17T10:30:00Z\",\"clockSynced\":true},"
    "{\"uuid\":\"7c9e6679-7425-40de-944b-e07fc1f90ae7\",\"activityId\":12,"
    "\"startedAt\":\"2025-09-17T10:00:00Z\",\"endedAt\":\"2025-09-17T11:00:00Z\",\"clockSynced\":false}"
    "],\"ticks\":[]}",
    body.c_str());
}

void test_request_with_nothing_pending_sends_an_empty_array() {
  TEST_ASSERT_EQUAL_STRING("{\"deviceId\":\"aura-1\",\"configVersion\":0,\"events\":[],\"ticks\":[]}",
                           buildRequest("aura-1", 0, {}).c_str());
}

void test_request_is_capped_at_200_events_in_queue_order() {
  std::vector<QueuedEvent> pending;
  for (int i = 0; i < 250; ++i) {
    pending.push_back({ uuidFor(i), 1, 1789639200ULL, 1789639260ULL, true });
  }
  JsonDocument doc;
  TEST_ASSERT_FALSE(deserializeJson(doc, buildRequest("aura-1", 1, pending)));
  JsonArray events = doc["events"].as<JsonArray>();
  TEST_ASSERT_EQUAL_INT(200, (int)events.size());
  TEST_ASSERT_EQUAL_STRING(uuidFor(0).c_str(), events[0]["uuid"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING(uuidFor(199).c_str(), events[199]["uuid"].as<const char*>());
}

// ---- parseResponse ----

static const char* GOOD_RESPONSE =
  "{\"serverTime\":\"2026-09-17T10:00:00.123Z\",\"configVersion\":4,"
  "\"acked\":[\"0f8fad5b-d9cb-469f-a165-70867728950e\"],"
  "\"rejected\":[\"7c9e6679-7425-40de-944b-e07fc1f90ae7\"]}";

void test_well_formed_response_settles_acked_and_rejected() {
  const SyncResult r = parseResponse(GOOD_RESPONSE);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_INT(2, (int)r.settled.size());
  TEST_ASSERT_EQUAL_STRING(UUID_A, r.settled[0].c_str());
  TEST_ASSERT_EQUAL_STRING(UUID_B, r.settled[1].c_str());
  TEST_ASSERT_TRUE(r.hasServerTime);
  TEST_ASSERT_EQUAL_UINT64(1789639200ULL, r.serverTime);
  TEST_ASSERT_FALSE(r.hasConfig);
}

void test_malformed_responses_settle_nothing() {
  const char* bad[] = {
    "",
    "not json",
    "{\"serverTime\":\"2026-09-17T10:00:00Z\",\"acked\":[\"x\"",  // truncated
    "{\"serverTime\":\"2026-09-17T10:00:00Z\",\"rejected\":[]}",   // acked missing
    "{\"serverTime\":\"2026-09-17T10:00:00Z\",\"acked\":\"0f8fad5b-d9cb-469f-a165-70867728950e\",\"rejected\":[]}",
    "{\"serverTime\":\"2026-09-17T10:00:00Z\",\"acked\":[],\"rejected\":{}}",
    "{\"serverTime\":\"2026-09-17T10:00:00Z\",\"acked\":[42],\"rejected\":[]}",
    "[]",
  };
  for (const char* body : bad) {
    const SyncResult r = parseResponse(body);
    TEST_ASSERT_FALSE_MESSAGE(r.ok, body);
    TEST_ASSERT_EQUAL_INT_MESSAGE(0, (int)r.settled.size(), body);
    TEST_ASSERT_FALSE_MESSAGE(r.hasServerTime, body);
    TEST_ASSERT_FALSE_MESSAGE(r.hasConfig, body);
  }
}

void test_bad_server_time_is_not_reported() {
  const char* bodies[] = {
    "{\"serverTime\":\"2026-09-17T10:00:00\",\"acked\":[],\"rejected\":[]}",
    "{\"serverTime\":1789639200,\"acked\":[],\"rejected\":[]}",
    "{\"acked\":[],\"rejected\":[]}",
  };
  for (const char* body : bodies) {
    const SyncResult r = parseResponse(body);
    TEST_ASSERT_TRUE_MESSAGE(r.ok, body);
    TEST_ASSERT_FALSE_MESSAGE(r.hasServerTime, body);
  }
}

void test_config_is_returned_only_when_present() {
  const SyncResult with = parseResponse(
    "{\"serverTime\":\"2026-09-17T10:00:00Z\",\"configVersion\":5,\"acked\":[],\"rejected\":[],"
    "\"config\":{\"version\":5,\"folders\":[],\"activities\":[]}}");
  TEST_ASSERT_TRUE(with.ok);
  TEST_ASSERT_TRUE(with.hasConfig);
  TEST_ASSERT_EQUAL_STRING("{\"version\":5,\"folders\":[],\"activities\":[]}", with.config.c_str());

  const SyncResult without = parseResponse(GOOD_RESPONSE);
  TEST_ASSERT_FALSE(without.hasConfig);
  TEST_ASSERT_EQUAL_STRING("", without.config.c_str());
}

// ---- configToCarousel ----

void test_config_maps_folders_activities_and_last_used() {
  const CarouselConfig c = configToCarousel(
    "{\"version\":9,"
    "\"folders\":[{\"id\":1,\"name\":\"AXIOM\",\"sortOrder\":0},{\"id\":2,\"name\":\"WORKSHOP\",\"sortOrder\":1}],"
    "\"activities\":["
    "{\"id\":10,\"folderId\":1,\"name\":\"coursework\",\"lastUsedAt\":\"2025-09-17T10:00:00.000Z\"},"
    "{\"id\":20,\"folderId\":2,\"name\":\"aura-1\",\"lastUsedAt\":null}]}");
  TEST_ASSERT_TRUE(c.ok);
  TEST_ASSERT_EQUAL_INT(9, c.version);
  TEST_ASSERT_EQUAL_INT(2, (int)c.folders.size());
  TEST_ASSERT_EQUAL_INT(2, c.folders[1].id);
  TEST_ASSERT_EQUAL_STRING("WORKSHOP", c.folders[1].name.c_str());
  TEST_ASSERT_EQUAL_INT(2, (int)c.activities.size());
  TEST_ASSERT_EQUAL_INT(10, c.activities[0].id);
  TEST_ASSERT_EQUAL_INT(1, c.activities[0].folderId);
  TEST_ASSERT_EQUAL_STRING("coursework", c.activities[0].name.c_str());
  TEST_ASSERT_EQUAL_UINT64(1758103200ULL, c.activities[0].lastUsedAt);
  TEST_ASSERT_EQUAL_UINT64(0, c.activities[1].lastUsedAt);  // null -> 0
}

void test_unparseable_config_is_not_ok() {
  const CarouselConfig c = configToCarousel("{\"version\":9,\"folders\":[");
  TEST_ASSERT_FALSE(c.ok);
  TEST_ASSERT_EQUAL_INT(0, c.version);
  TEST_ASSERT_EQUAL_INT(0, (int)c.folders.size());
  TEST_ASSERT_FALSE(configToCarousel("").ok);
}

void test_request_carries_ticks_and_skips_malformed_ones() {
  const std::string body = buildRequest("aura-1", 1, {},
    { "todo 7 1", "habit 3 2026-09-19 0", "todo x 1", "habit 4 1", "sock 1 1" });
  TEST_ASSERT_TRUE(body.find("\"ticks\":[{\"kind\":\"todo\",\"id\":7,\"done\":true},"
    "{\"kind\":\"habit\",\"id\":3,\"date\":\"2026-09-19\",\"done\":false}]") != std::string::npos);
}

void test_today_is_returned_when_present() {
  const SyncResult r = parseResponse(
    "{\"serverTime\":\"2026-09-19T10:00:00Z\",\"configVersion\":1,\"acked\":[],\"rejected\":[],"
    "\"today\":{\"date\":\"2026-09-19\",\"todos\":[]}}");
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_TRUE(r.hasToday);
  TEST_ASSERT_TRUE(r.today.find("2026-09-19") != std::string::npos);
}

void test_request_carries_the_status_and_response_a_look() {
  DeviceStatus status{ 70, 3912, true, "CODEX" };
  JsonDocument doc;
  TEST_ASSERT_FALSE(deserializeJson(doc, buildRequest("aura-1", 1, {}, {}, "", &status)));
  TEST_ASSERT_EQUAL_INT(70, doc["status"]["battery"].as<int>());
  TEST_ASSERT_TRUE(doc["status"]["charging"].as<bool>());
  TEST_ASSERT_EQUAL_STRING("CODEX", doc["status"]["look"].as<const char*>());
  const SyncResult r = parseResponse("{\"acked\":[],\"rejected\":[],\"look\":\"CARMILLA\"}");
  TEST_ASSERT_EQUAL_STRING("CARMILLA", r.look.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_request_has_the_exact_wire_shape);
  RUN_TEST(test_request_with_nothing_pending_sends_an_empty_array);
  RUN_TEST(test_request_is_capped_at_200_events_in_queue_order);
  RUN_TEST(test_well_formed_response_settles_acked_and_rejected);
  RUN_TEST(test_malformed_responses_settle_nothing);
  RUN_TEST(test_bad_server_time_is_not_reported);
  RUN_TEST(test_config_is_returned_only_when_present);
  RUN_TEST(test_config_maps_folders_activities_and_last_used);
  RUN_TEST(test_unparseable_config_is_not_ok);
  RUN_TEST(test_request_carries_ticks_and_skips_malformed_ones);
  RUN_TEST(test_today_is_returned_when_present);
  RUN_TEST(test_request_carries_the_status_and_response_a_look);
  return UNITY_END();
}
