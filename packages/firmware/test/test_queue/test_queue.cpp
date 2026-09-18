#include <unity.h>
#include "queue.h"
#include "../fake_storage.h"

class FailingStorage : public FakeStorage {
public:
  bool append(const std::string&, const std::string&) override { return false; }
};

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
  const std::string before = fs.files["/queue.ndjson"];
  q.prune({ "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b" });
  TEST_ASSERT_EQUAL_STRING(before.c_str(), fs.files["/queue.ndjson"].c_str());
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

void test_crlf_acked_lines_still_match_and_drain_the_queue() {
  FakeStorage fs;
  // Simulates the SD adapter's println() writing "\r\n" and readLines
  // splitting on '\n' only, so an already-acked uuid reads back as
  // "<uuid>\r".
  fs.files["/acked.ndjson"] =
    "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b\r\n"
    "028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b\r\n";
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.append(event("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));

  TEST_ASSERT_TRUE(q.pending().empty());

  q.prune({ "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b",
            "028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b" });
  TEST_ASSERT_FALSE(fs.exists("/queue.ndjson"));
  TEST_ASSERT_FALSE(fs.exists("/acked.ndjson"));
}

void test_append_returns_false_when_storage_write_fails() {
  FailingStorage fs;
  EventQueue q(fs);
  TEST_ASSERT_FALSE(q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b")));
}

// (a) Each corrupt line, alone on top of an empty queue, parses to nothing.
static const char* GOOD_UUID = "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b";

struct CorruptLineCase {
  const char* label;
  std::string line;
};

static std::string lineWith(const std::string& uuid, const std::string& activityId,
                             const std::string& startedAt, const std::string& endedAt,
                             const std::string& clockSynced) {
  return "{\"uuid\":\"" + uuid + "\",\"activityId\":" + activityId
       + ",\"startedAt\":" + startedAt + ",\"endedAt\":" + endedAt
       + ",\"clockSynced\":" + clockSynced + "}";
}

void test_corrupt_queue_lines_are_each_rejected() {
  const std::vector<CorruptLineCase> cases = {
    { "bad uuid", lineWith("not-a-uuid", "10", "1758100000", "1758106420", "true") },
    { "uppercase-hex uuid",
      lineWith("018F3B2A-4C5D-7E8F-9A0B-1C2D3E4F5A6B", "10", "1758100000", "1758106420",
               "true") },
    { "activityId zero", lineWith(GOOD_UUID, "0", "1758100000", "1758106420", "true") },
    { "activityId negative", lineWith(GOOD_UUID, "-5", "1758100000", "1758106420", "true") },
    { "activityId overflow (11 digits)",
      lineWith(GOOD_UUID, "99999999999", "1758100000", "1758106420", "true") },
    { "startedAt non-digit", lineWith(GOOD_UUID, "10", "abc", "1758106420", "true") },
    { "startedAt 11 digits",
      lineWith(GOOD_UUID, "10", "17581000001", "1758106420", "true") },
    { "clockSynced not a bool", lineWith(GOOD_UUID, "10", "1758100000", "1758106420", "\"yes\"") },
    { "missing key",
      "{\"uuid\":\"" + std::string(GOOD_UUID) + "\",\"activityId\":10,"
      "\"startedAt\":1758100000,\"endedAt\":1758106420}" },
  };

  for (const auto& c : cases) {
    FakeStorage fs;
    fs.files["/queue.ndjson"] = c.line;
    EventQueue q(fs);
    TEST_ASSERT_TRUE_MESSAGE(q.pending().empty(), c.label);
  }
}

// (b) One good event plus one corrupt line: pending() returns only the good
// one, and prune() still drains both files, proving a corrupt line cannot
// block draining.
void test_corrupt_line_does_not_block_a_good_line_or_draining() {
  FakeStorage fs;
  fs.files["/queue.ndjson"] =
    EventQueue::serialise(event(GOOD_UUID)) + "\n" + lineWith("garbage", "0", "x", "y", "maybe");
  EventQueue q(fs);
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING(GOOD_UUID, pending[0].uuid.c_str());

  q.prune({ GOOD_UUID });
  TEST_ASSERT_FALSE(fs.exists("/queue.ndjson"));
  TEST_ASSERT_FALSE(fs.exists("/acked.ndjson"));
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
  RUN_TEST(test_crlf_acked_lines_still_match_and_drain_the_queue);
  RUN_TEST(test_append_returns_false_when_storage_write_fails);
  RUN_TEST(test_corrupt_queue_lines_are_each_rejected);
  RUN_TEST(test_corrupt_line_does_not_block_a_good_line_or_draining);
  return UNITY_END();
}
