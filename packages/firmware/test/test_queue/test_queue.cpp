#include <unity.h>
#include "queue.h"
#include "../fake_storage.h"

void setUp() {}
void tearDown() {}

static QueuedEvent event(const std::string& uuid) {
  return { uuid, 10, 1758100000ULL, 1758106420ULL, true };
}

void test_appended_event_is_pending() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b",
                           pending[0].uuid.c_str());
  TEST_ASSERT_EQUAL_INT(10, pending[0].activityId);
  TEST_ASSERT_EQUAL_UINT64(1758106420ULL, pending[0].endedAt);
}

void test_prune_removes_only_acked_uuids() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.append(event("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.prune({ "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b" });
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b",
                           pending[0].uuid.c_str());
}

void test_failed_sync_changes_nothing() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.prune({});
  TEST_ASSERT_EQUAL_INT(1, (int)q.pending().size());
}

void test_torn_final_line_is_discarded_not_fatal() {
  FakeStorage fs;
  fs.files["/queue.ndjson"] =
    "{\"uuid\":\"018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b\",\"activityId\":10,"
    "\"startedAt\":1758100000,\"endedAt\":1758106420,\"clockSynced\":true}\n"
    "{\"uuid\":\"028f3b2a-4c5d-7e8f";
  EventQueue q(fs);
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
}

void test_torn_newline_is_terminated_before_next_append() {
  FakeStorage fs;
  fs.files["/queue.ndjson"] = EventQueue::serialise(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  EventQueue q(fs);
  q.append(event("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(2, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b", pending[0].uuid.c_str());
  TEST_ASSERT_EQUAL_STRING("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b", pending[1].uuid.c_str());
}

void test_prune_never_rewrites_the_queue_file() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.append(event("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.prune({ "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b" });
  TEST_ASSERT_EQUAL_INT(0, fs.writeCounts["/queue.ndjson"]);
}

void test_drained_queue_removes_both_files() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.append(event("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.prune({ "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b",
            "028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b" });
  TEST_ASSERT_FALSE(fs.exists("/queue.ndjson"));
  TEST_ASSERT_FALSE(fs.exists("/acked.ndjson"));
}

void test_acked_filtering_survives_restart() {
  FakeStorage fs;
  {
    EventQueue q(fs);
    q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
    q.append(event("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
    q.prune({ "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b" });
  }
  EventQueue restarted(fs);
  auto pending = restarted.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b", pending[0].uuid.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_appended_event_is_pending);
  RUN_TEST(test_prune_removes_only_acked_uuids);
  RUN_TEST(test_failed_sync_changes_nothing);
  RUN_TEST(test_torn_final_line_is_discarded_not_fatal);
  RUN_TEST(test_torn_newline_is_terminated_before_next_append);
  RUN_TEST(test_prune_never_rewrites_the_queue_file);
  RUN_TEST(test_drained_queue_removes_both_files);
  RUN_TEST(test_acked_filtering_survives_restart);
  return UNITY_END();
}
