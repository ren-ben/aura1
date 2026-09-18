#include <unity.h>
#include "session_machine.h"
#include "../fake_storage.h"
#include "../fake_clock.h"
#include "../fake_renderer.h"
#include "../fake_random.h"

void setUp() {}
void tearDown() {}

struct Rig {
  FakeStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  Carousel carousel;
  EventQueue queue{storage};

  FakeRandom random;

  Rig() { carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} }); }

  SessionMachine machine() {
    return SessionMachine(carousel, queue, clock, storage, renderer, random);
  }
};

void test_power_short_starts_a_session() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  TEST_ASSERT_TRUE(rig.storage.exists("/session.open"));
}

void test_running_screen_never_shows_elapsed_time() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 3600;
  m.handle(Input::Tick);
  TEST_ASSERT_EQUAL_INT(0, rig.renderer.last().minutes);
}

void test_second_power_short_queues_the_session_and_clears_the_marker() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 6420;  // 1h 47m
  m.handle(Input::PowerShort);
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_INT(10, pending[0].activityId);
  TEST_ASSERT_EQUAL_UINT64(6420, pending[0].endedAt - pending[0].startedAt);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
}

void test_stopped_screen_shows_the_duration_once() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 6420;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Stopped);
  TEST_ASSERT_EQUAL_INT(107, rig.renderer.last().minutes);
}

void test_sun_presses_are_ignored_while_running() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  m.handle(Input::SunShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
}

void test_power_cut_mid_session_recovers_at_the_last_heartbeat() {
  Rig rig;
  {
    auto m = rig.machine();
    m.begin();
    m.handle(Input::PowerShort);
    rig.clock.now += 300;
    m.handle(Input::Tick);   // writes a heartbeat
    rig.clock.now += 120;    // two more minutes, then the battery dies
  }
  auto recovered = rig.machine();
  recovered.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_UINT64(300, pending[0].endedAt - pending[0].startedAt);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
  TEST_ASSERT_TRUE(recovered.screen() == Screen::Idle);
}

void test_uuid_is_rfc9562_version_4() {
  FakeRandom random;
  const std::string id = uuidV4(random);
  TEST_ASSERT_EQUAL_INT(36, (int)id.size());
  TEST_ASSERT_EQUAL_CHAR('-', id[8]);
  TEST_ASSERT_EQUAL_CHAR('-', id[13]);
  TEST_ASSERT_EQUAL_CHAR('-', id[18]);
  TEST_ASSERT_EQUAL_CHAR('-', id[23]);
  TEST_ASSERT_EQUAL_CHAR('4', id[14]);
  TEST_ASSERT_TRUE(id[19] == '8' || id[19] == '9' || id[19] == 'a' || id[19] == 'b');
}

void test_consecutive_uuids_differ_even_within_the_same_second() {
  // The clock never advances here. The server silently keeps only the first row
  // for a repeated device_uuid, so a collision would lose a session.
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  m.handle(Input::PowerShort);
  m.handle(Input::SunShort);   // leave Stopped
  m.handle(Input::PowerShort);
  m.handle(Input::PowerShort);
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(2, (int)pending.size());
  TEST_ASSERT_FALSE(pending[0].uuid == pending[1].uuid);
}

class FailingAppendStorage : public FakeStorage {
public:
  bool append(const std::string& path, const std::string& line) override {
    if (path == "/queue.ndjson") return false;
    return FakeStorage::append(path, line);
  }
};

void test_failed_queue_append_keeps_the_session_running() {
  FailingAppendStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} });
  EventQueue queue(storage);
  SessionMachine m(carousel, queue, clock, storage, renderer, random);
  m.begin();
  m.handle(Input::PowerShort);
  clock.now += 600;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  TEST_ASSERT_TRUE(storage.exists("/session.open"));
}

void test_recovery_reuses_the_uuid_minted_at_start() {
  Rig rig;
  std::string markerUuid;
  {
    auto m = rig.machine();
    m.begin();
    m.handle(Input::PowerShort);
    const auto line = rig.storage.readLines("/session.open")[0];
    markerUuid = line.substr(line.rfind(' ') + 1);
    rig.clock.now += 300;
    m.handle(Input::Tick);
  }
  auto recovered = rig.machine();
  recovered.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING(markerUuid.c_str(), pending[0].uuid.c_str());
}

void test_normal_stop_uses_the_uuid_minted_at_start() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  const auto line = rig.storage.readLines("/session.open")[0];
  const std::string markerUuid = line.substr(line.rfind(' ') + 1);
  rig.clock.now += 60;
  m.handle(Input::PowerShort);
  TEST_ASSERT_EQUAL_STRING(markerUuid.c_str(), rig.queue.pending()[0].uuid.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_failed_queue_append_keeps_the_session_running);
  RUN_TEST(test_recovery_reuses_the_uuid_minted_at_start);
  RUN_TEST(test_normal_stop_uses_the_uuid_minted_at_start);
  RUN_TEST(test_uuid_is_rfc9562_version_4);
  RUN_TEST(test_consecutive_uuids_differ_even_within_the_same_second);
  RUN_TEST(test_power_short_starts_a_session);
  RUN_TEST(test_running_screen_never_shows_elapsed_time);
  RUN_TEST(test_second_power_short_queues_the_session_and_clears_the_marker);
  RUN_TEST(test_stopped_screen_shows_the_duration_once);
  RUN_TEST(test_sun_presses_are_ignored_while_running);
  RUN_TEST(test_power_cut_mid_session_recovers_at_the_last_heartbeat);
  return UNITY_END();
}
