#include <unity.h>
#include <string>
#include <vector>
#include "session_machine.h"
#include "looks.h"
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

  Rig() {
    carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} });
    carousel.enter();
  }

  SessionMachine machine() {
    return SessionMachine(carousel, queue, clock, storage, renderer, random);
  }
};

class FailingAppendStorage : public FakeStorage {
public:
  bool append(const std::string& path, const std::string& line) override {
    if (path == "/queue.ndjson") return false;
    return FakeStorage::append(path, line);
  }
};

class FailingWriteStorage : public FakeStorage {
public:
  bool write(const std::string& path, const std::string& content) override {
    if (path == "/session.open") return false;
    return FakeStorage::write(path, content);
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
  // A single activity would make this pass for the wrong reason: nextActivity()
  // would have nothing to change to. Load two so a SUN press would actually move
  // the cursor if it were not ignored.
  FakeStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0}, {11, 1, "reading", 0} });
  carousel.enter();
  EventQueue queue(storage);
  SessionMachine m(carousel, queue, clock, storage, renderer, random);
  m.begin();
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  const int activityIdBeforeSun = carousel.currentActivityId();
  const size_t framesBeforeSun = renderer.frames.size();
  m.handle(Input::SunShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  // Stopping reads the activityId saved at start, so that alone would pass
  // even if SUN silently moved the carousel. Assert directly that SUN
  // touched neither the carousel's cursor nor the renderer.
  TEST_ASSERT_EQUAL_INT(activityIdBeforeSun, carousel.currentActivityId());
  TEST_ASSERT_EQUAL_INT((int)framesBeforeSun, (int)renderer.frames.size());
  clock.now += 60;
  m.handle(Input::PowerShort);
  auto pending = queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_INT(10, pending[0].activityId);
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

void test_torn_final_heartbeat_line_does_not_lose_the_valid_marker() {
  // Built directly, as append-only heartbeats would leave it: an initial
  // zero-length line, a good heartbeat at 300, then a line torn by a power
  // cut mid-append (missing its uuid field). Recovery must use the last
  // line that parses cleanly, not just the first line in the file.
  Rig rig;
  const std::string uuid = "11111111-1111-4111-8111-111111111111";
  rig.storage.write("/session.open", "10 1758100000 1758100000 " + uuid + "\n");
  rig.storage.append("/session.open", "\n10 1758100000 1758100300 " + uuid);
  rig.storage.append("/session.open", "\n10 1758100000 17581");
  auto m = rig.machine();
  m.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_UINT64(300, pending[0].endedAt - pending[0].startedAt);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
}

void test_garbage_heartbeat_field_does_not_override_the_last_good_line() {
  // A line that parses "successfully" with strtoull's partial-parse leniency
  // (heartbeat "xyz" -> 0) must not beat a real, earlier heartbeat: 0 would
  // read as heartbeat <= startedAt and recovery would delete the session.
  Rig rig;
  const std::string uuid = "11111111-1111-4111-8111-111111111111";
  rig.storage.write("/session.open", "10 1758100000 1758100300 " + uuid + "\n");
  rig.storage.append("/session.open", "\n10 1758100000 xyz " + uuid);
  auto m = rig.machine();
  m.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_UINT64(300, pending[0].endedAt - pending[0].startedAt);
}

void test_corrupted_marker_lines_are_rejected_not_parsed() {
  const std::string uuid = "11111111-1111-4111-8111-111111111111";
  const std::string noHexUuid(36, 'z');
  const std::vector<std::string> garbageLines = {
    "10 abc 1758100300 " + uuid,               // startedAt is not digits
    "10 17581x 1758100300 " + uuid,            // startedAt has trailing garbage
    " 10 1758100000 1758100300 " + uuid,       // leading space empties the activityId field
    "0 1758100000 1758100300 " + uuid,         // activityId zero
    "-5 1758100000 1758100300 " + uuid,        // activityId negative
    "abc 1758100000 1758100300 " + uuid,       // activityId is not digits
    "10 1758100000 1758100300 " + noHexUuid,   // uuid has no dashes or hex digits
    "99999999999 1758100000 1758100300 " + uuid,  // activityId overflow (11 digits)
  };
  for (const auto& line : garbageLines) {
    Rig rig;
    rig.storage.write("/session.open", line + "\n");
    auto m = rig.machine();
    m.begin();
    TEST_ASSERT_EQUAL_INT(0, (int)rig.queue.pending().size());
  }
}

void test_heartbeats_accumulate_as_separate_marker_lines() {
  // Pins the append-only marker: each heartbeat must be its own line, not a
  // truncating overwrite of the last one. Fails if appendHeartbeat used
  // storage_.write() instead of storage_.append().
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 300;
  m.handle(Input::Tick);   // first heartbeat
  rig.clock.now += 300;
  m.handle(Input::Tick);   // second heartbeat
  int nonBlankLines = 0;
  for (const auto& line : rig.storage.readLines("/session.open")) {
    if (!line.empty()) ++nonBlankLines;
  }
  TEST_ASSERT_EQUAL_INT(3, nonBlankLines);
}

void test_tick_does_not_redraw_while_running() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  const size_t framesAfterStart = rig.renderer.frames.size();
  for (int i = 0; i < 10; ++i) {
    rig.clock.now += 60;
    m.handle(Input::Tick);
  }
  TEST_ASSERT_EQUAL_INT((int)framesAfterStart, (int)rig.renderer.frames.size());
}

void test_power_long_while_running_saves_a_final_heartbeat() {
  Rig rig;
  {
    auto m = rig.machine();
    m.begin();
    m.handle(Input::PowerShort);
    rig.clock.now += 120;
    m.handle(Input::PowerLong);
    TEST_ASSERT_TRUE(m.screen() == Screen::Dormant);
    // the device powers off here
  }
  auto recovered = rig.machine();
  recovered.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_UINT64(120, pending[0].endedAt - pending[0].startedAt);
}

void test_failed_marker_write_keeps_the_session_from_starting() {
  FailingWriteStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} });
  carousel.enter();
  EventQueue queue(storage);
  SessionMachine m(carousel, queue, clock, storage, renderer, random);
  m.begin();
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_EQUAL_INT(0, (int)queue.pending().size());
}

void test_start_never_overwrites_an_unrecovered_marker() {
  FailingAppendStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} });
  carousel.enter();
  EventQueue queue(storage);
  storage.write("/session.open",
                 "10 1758100000 1758100300 11111111-1111-4111-8111-111111111111\n");
  SessionMachine m(carousel, queue, clock, storage, renderer, random);
  m.begin();
  TEST_ASSERT_TRUE(storage.exists("/session.open"));
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_TRUE(storage.exists("/session.open"));
  TEST_ASSERT_EQUAL_INT(0, (int)queue.pending().size());
}

void test_stopped_screen_holds_for_five_seconds_then_returns_to_idle() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 60;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Stopped);
  rig.clock.now += 1;
  m.handle(Input::Tick);
  TEST_ASSERT_TRUE(m.screen() == Screen::Stopped);
  rig.clock.now += 4;  // 5 s since stop
  m.handle(Input::Tick);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
}

void test_power_cut_between_queue_append_and_marker_clear_requeues_with_the_same_uuid() {
  Rig rig;
  std::string markerLine;
  {
    auto m = rig.machine();
    m.begin();
    m.handle(Input::PowerShort);
    rig.clock.now += 300;
    m.handle(Input::Tick);  // heartbeat at 300, so the marker is non-zero-length
    markerLine = rig.storage.readLines("/session.open").back();
    rig.clock.now += 60;
    m.handle(Input::PowerShort);  // queues the event and clears the marker
  }
  // The SD write that removes the marker never completed, so it reappears
  // with the content it held just before the crash.
  rig.storage.write("/session.open", markerLine + "\n");
  auto recovered = rig.machine();
  recovered.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(2, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING(pending[0].uuid.c_str(), pending[1].uuid.c_str());
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

void test_failed_queue_append_keeps_the_session_running() {
  FailingAppendStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} });
  carousel.enter();
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

void test_redraw_in_idle_shows_the_reloaded_carousel() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  const size_t before = rig.renderer.frames.size();
  rig.carousel.load({ {2, "WORKSHOP"} }, { {30, 2, "aura-1", 0} });
  m.redraw();
  TEST_ASSERT_EQUAL_INT((int)before + 1, (int)rig.renderer.frames.size());
  // The open folder vanished, so the list falls back to the folder list.
  TEST_ASSERT_EQUAL_STRING("FOLDERS", rig.renderer.last().title.c_str());
  TEST_ASSERT_EQUAL_STRING("WORKSHOP", rig.renderer.last().items[0].c_str());
}

void test_power_short_on_a_reset_rtc_stays_idle_and_writes_nothing() {
  // 2000-01-01T00:00:00Z: the PCF85063's power-on default after an RTC reset
  // (flat battery / power loss), well below the 2025-01-01 floor.
  Rig rig;
  auto m = rig.machine();
  m.begin();
  rig.clock.now = 946684805ULL;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
  TEST_ASSERT_EQUAL_INT(0, (int)rig.queue.pending().size());
}

void test_power_short_on_a_zero_clock_stays_idle_and_writes_nothing() {
  // A failed first I2C read: RtcClock returns 0.
  Rig rig;
  auto m = rig.machine();
  m.begin();
  rig.clock.now = 0;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
  TEST_ASSERT_EQUAL_INT(0, (int)rig.queue.pending().size());
}

void test_power_short_at_exactly_the_clock_floor_starts_the_session() {
  // 1735689600 = 2025-01-01T00:00:00Z, the boundary: this must start.
  Rig rig;
  auto m = rig.machine();
  m.begin();
  rig.clock.now = 1735689600ULL;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  TEST_ASSERT_TRUE(rig.storage.exists("/session.open"));
}

void test_redraw_outside_idle_draws_nothing() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  const size_t running = rig.renderer.frames.size();
  m.redraw();
  TEST_ASSERT_EQUAL_INT((int)running, (int)rig.renderer.frames.size());
  rig.clock.now += 60;
  m.handle(Input::PowerShort);
  const size_t stopped = rig.renderer.frames.size();
  m.redraw();
  TEST_ASSERT_EQUAL_INT((int)stopped, (int)rig.renderer.frames.size());
}

struct TwoFolderRig {
  FakeStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  EventQueue queue{storage};

  TwoFolderRig() { load(); }
  void load() {
    carousel.load({ {1, "AXIOM"}, {2, "WORKSHOP"} },
                  { {10, 1, "coursework", 0}, {20, 2, "aura-1", 0}, {21, 2, "side", 0} });
  }
  SessionMachine machine() {
    return SessionMachine(carousel, queue, clock, storage, renderer, random);
  }
};

void test_begin_shows_waking_then_the_list() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.begin();
  TEST_ASSERT_EQUAL_INT(2, (int)rig.renderer.frames.size());
  TEST_ASSERT_TRUE(rig.renderer.frames[0].screen == Screen::Waking);
  TEST_ASSERT_TRUE(rig.renderer.last().screen == Screen::Idle);
  TEST_ASSERT_EQUAL_STRING("FOLDERS", rig.renderer.last().title.c_str());
}

void test_power_on_a_folder_opens_it_instead_of_starting() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::SunShort);
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
  TEST_ASSERT_EQUAL_STRING("WORKSHOP", rig.renderer.last().title.c_str());
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  TEST_ASSERT_EQUAL_STRING("aura-1", rig.renderer.last().activity.c_str());
}

void test_holding_sun_goes_up_a_level_and_then_to_the_menu() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::SunShort);
  m.handle(Input::PowerShort);
  m.handle(Input::SunLong);
  TEST_ASSERT_EQUAL_STRING("FOLDERS", rig.renderer.last().title.c_str());
  TEST_ASSERT_EQUAL_INT(1, rig.renderer.last().cursor);  // still on WORKSHOP
  m.handle(Input::SunLong);
  TEST_ASSERT_TRUE(rig.renderer.last().place == Place::Menu);
  TEST_ASSERT_EQUAL_STRING("ACTIVITIES", rig.renderer.last().items[0].c_str());
  m.handle(Input::PowerShort);
  TEST_ASSERT_EQUAL_STRING("FOLDERS", rig.renderer.last().title.c_str());
}

static const char* BUNDLE =
  "{\"date\":\"2026-09-19\",\"level\":1,\"lastSessionAt\":null,"
  "\"todos\":[{\"id\":7,\"body\":\"write\",\"done\":false},{\"id\":8,\"body\":\"read\",\"done\":true}],"
  "\"habits\":[{\"id\":2,\"name\":\"stretch\",\"done\":false}],"
  "\"quotes\":[{\"body\":\"A\",\"source\":null},{\"body\":\"B\",\"source\":\"Kos\"}]}";

// From the folder list: hold SUN for the menu, then SUN to a place and POWER.
static void openPlace(SessionMachine& m, int index) {
  m.handle(Input::SunLong);
  for (int i = 0; i < index; ++i) m.handle(Input::SunShort);
  m.handle(Input::PowerShort);
}

// The same, by the name of the item rather than by how far along it sits: the
// menu grows, and a test about quotes should not care where quotes are in it.
template <typename Rig>
static void openNamed(Rig& rig, SessionMachine& m, const char* label) {
  m.handle(Input::SunLong);
  for (int i = 0; i < 12; ++i) {
    const ViewModel& vm = rig.renderer.last();
    if (!vm.items.empty() && vm.items[vm.cursor].rfind(label, 0) == 0) break;
    m.handle(Input::SunShort);
  }
  m.handle(Input::PowerShort);
}

void test_the_menu_shows_todays_progress() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.daily().replace(BUNDLE);
  m.begin();
  m.handle(Input::SunLong);
  TEST_ASSERT_EQUAL_STRING("TODAY 1/2", rig.renderer.last().items[1].c_str());
  TEST_ASSERT_EQUAL_STRING("HABITS 0/1", rig.renderer.last().items[2].c_str());
}

void test_power_ticks_a_todo_and_the_last_one_celebrates() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.daily().replace(BUNDLE);
  m.begin();
  openPlace(m, 1);
  TEST_ASSERT_EQUAL_STRING("TODAY", rig.renderer.last().title.c_str());
  TEST_ASSERT_FALSE(rig.renderer.last().checks[0]);
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Celebrate);
  TEST_ASSERT_EQUAL_STRING("todos-done", rig.renderer.last().moment.c_str());
  TEST_ASSERT_EQUAL_INT(1, (int)m.daily().ticks().size());
  rig.clock.now += 5;
  m.handle(Input::Tick);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_TRUE(rig.renderer.last().checks[0]);
}

void test_power_ticks_a_habit() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.daily().replace(BUNDLE);
  m.begin();
  openPlace(m, 2);
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(rig.renderer.last().checks[0]);
  TEST_ASSERT_EQUAL_STRING("habit 2 2026-09-19 1", m.daily().ticks()[0].c_str());
}

void test_quotes_cycle_with_power() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.daily().replace(BUNDLE);
  m.begin();
  openNamed(rig, m, "QUOTES");
  const std::string first = rig.renderer.last().quote;
  m.handle(Input::PowerShort);
  TEST_ASSERT_FALSE(first == rig.renderer.last().quote);
  m.handle(Input::SunLong);
  TEST_ASSERT_TRUE(rig.renderer.last().place == Place::Menu);
}

void test_sun_turns_the_pages_of_a_long_quote() {
  TwoFolderRig rig;
  auto m = rig.machine();
  // 40 words: more than one page in the default look, however it sets them.
  std::string body;
  for (int i = 0; i < 40; ++i) body += "word ";
  const int pages = quotePageCount(look(0), body, false);
  TEST_ASSERT_TRUE(pages > 1);
  m.daily().replace("{\"date\":\"2026-09-19\",\"level\":1,\"lastSessionAt\":null,\"todos\":[],\"habits\":[],"
                    "\"quotes\":[{\"body\":\"" + body + "\",\"source\":null}]}");
  m.begin();
  openNamed(rig, m, "QUOTES");
  TEST_ASSERT_EQUAL_INT(0, rig.renderer.last().quotePage);
  for (int p = 1; p < pages; ++p) {
    m.handle(Input::SunShort);
    TEST_ASSERT_EQUAL_INT(p, rig.renderer.last().quotePage);
  }
  m.handle(Input::SunShort);
  TEST_ASSERT_EQUAL_INT(0, rig.renderer.last().quotePage);
  m.handle(Input::SunShort);
  m.handle(Input::PowerShort);  // the next quote starts on its first page
  TEST_ASSERT_EQUAL_INT(0, rig.renderer.last().quotePage);
}

void test_settings_change_text_size_and_keep_it() {
  TwoFolderRig rig;
  {
    auto m = rig.machine();
    m.begin();
    openNamed(rig, m, "SETTINGS");
    TEST_ASSERT_EQUAL_STRING("SETTINGS", rig.renderer.last().title.c_str());
    TEST_ASSERT_EQUAL_STRING("TEXT", rig.renderer.last().items[0].c_str());
    TEST_ASSERT_EQUAL_STRING("SMALL", rig.renderer.last().values[0].c_str());
    m.handle(Input::PowerShort);
    TEST_ASSERT_EQUAL_STRING("LARGE", rig.renderer.last().values[0].c_str());
    TEST_ASSERT_TRUE(rig.renderer.last().largeText);
  }
  auto again = rig.machine();
  again.begin();
  TEST_ASSERT_TRUE(rig.renderer.last().largeText);
}

void test_large_text_turns_more_pages() {
  TwoFolderRig rig;
  auto m = rig.machine();
  // A quote that fits one page small and takes two large.
  std::string body;
  for (int i = 0; i < 40 && quotePageCount(look(0), body + "word ", false) == 1; ++i) body += "word ";
  TEST_ASSERT_TRUE(quotePageCount(look(0), body, true) > 1);
  m.daily().replace("{\"date\":\"2026-09-19\",\"level\":1,\"lastSessionAt\":null,\"todos\":[],\"habits\":[],"
                    "\"quotes\":[{\"body\":\"" + body + "\",\"source\":null}]}");
  m.begin();
  openNamed(rig, m, "QUOTES");
  m.handle(Input::SunShort);
  TEST_ASSERT_EQUAL_INT(0, rig.renderer.last().quotePage);
  openNamed(rig, m, "SETTINGS");
  m.handle(Input::PowerShort);  // large text
  openNamed(rig, m, "QUOTES");
  m.handle(Input::SunShort);
  TEST_ASSERT_EQUAL_INT(1, rig.renderer.last().quotePage);
}

void test_sync_now_asks_the_main_loop_and_shows_the_answer() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.begin();
  TEST_ASSERT_FALSE(m.takeSyncRequest());
  openNamed(rig, m, "SETTINGS");
  for (int i = 0; i < 3; ++i) m.handle(Input::SunShort);
  m.handle(Input::PowerShort);
  TEST_ASSERT_EQUAL_STRING("SYNCING", rig.renderer.last().values[3].c_str());
  TEST_ASSERT_TRUE(m.takeSyncRequest());
  TEST_ASSERT_FALSE(m.takeSyncRequest());
  m.setSyncNote("NO WIFI");
  TEST_ASSERT_EQUAL_STRING("NO WIFI", rig.renderer.last().values[3].c_str());
}

void test_the_look_changes_in_settings_and_is_kept() {
  TwoFolderRig rig;
  {
    auto m = rig.machine();
    m.begin();
    TEST_ASSERT_EQUAL_INT(0, rig.renderer.last().look);
    openNamed(rig, m, "SETTINGS");
    m.handle(Input::SunShort);
    m.handle(Input::PowerShort);
    m.handle(Input::PowerShort);
    TEST_ASSERT_EQUAL_INT(2, rig.renderer.last().look);
    TEST_ASSERT_EQUAL_STRING(look(2).name(), rig.renderer.last().values[1].c_str());
  }
  auto again = rig.machine();
  again.begin();
  TEST_ASSERT_EQUAL_INT(2, rig.renderer.last().look);
}

void test_the_menu_marks_settings_as_its_gear() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::SunLong);
  const ViewModel& vm = rig.renderer.last();
  TEST_ASSERT_TRUE(vm.place == Place::Menu);
  TEST_ASSERT_EQUAL_STRING("SETTINGS", vm.items[vm.gear].c_str());
}

void test_left_alone_he_takes_the_screen_and_a_press_only_wakes_it() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.begin();
  rig.clock.now += 179;
  m.handle(Input::Tick);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  rig.clock.now += 1;
  m.handle(Input::Tick);
  TEST_ASSERT_TRUE(m.screen() == Screen::Screensaver);
  TEST_ASSERT_EQUAL_STRING("lore", rig.renderer.last().moment.c_str());
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
}

void test_boot_reopens_the_last_started_activity() {
  TwoFolderRig rig;
  {
    auto m = rig.machine();
    m.begin();
    m.handle(Input::SunShort);
    m.handle(Input::PowerShort);
    m.handle(Input::SunShort);  // side
    m.handle(Input::PowerShort);
    rig.clock.now += 60;
    m.handle(Input::PowerShort);
  }
  rig.carousel.up();
  rig.load();
  auto m = rig.machine();
  m.begin();
  TEST_ASSERT_EQUAL_INT(21, rig.carousel.currentActivityId());
  TEST_ASSERT_EQUAL_STRING("WORKSHOP", rig.renderer.last().title.c_str());
}

void test_power_long_draws_dormant_from_idle() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerLong);
  TEST_ASSERT_TRUE(m.screen() == Screen::Dormant);
  TEST_ASSERT_TRUE(rig.renderer.last().screen == Screen::Dormant);
}

void test_sun_skips_the_sealed_screen() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 60;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Stopped);
  m.handle(Input::SunShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
}

void test_while_dormant_the_menu_offers_the_ritual_and_it_lights_candles() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.daily().replace("{\"date\":\"2026-09-19\",\"form\":\"dormant\",\"resurrectionId\":99,\"lastSessionAt\":null}");
  m.begin();
  m.handle(Input::SunLong);
  TEST_ASSERT_EQUAL_STRING("RESURRECT", rig.renderer.last().items[0].c_str());
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  TEST_ASSERT_EQUAL_STRING("ritual-0", rig.renderer.last().moment.c_str());
  const size_t frames = rig.renderer.frames.size();
  rig.clock.now += 15 * 60;
  m.handle(Input::Tick);
  TEST_ASSERT_EQUAL_INT((int)frames + 1, (int)rig.renderer.frames.size());
  TEST_ASSERT_EQUAL_STRING("ritual-1", rig.renderer.last().moment.c_str());
  rig.clock.now += 45 * 60;
  m.handle(Input::PowerShort);
  TEST_ASSERT_EQUAL_STRING("resurrected", rig.renderer.last().moment.c_str());
  TEST_ASSERT_EQUAL_INT(99, rig.queue.pending()[0].activityId);
  TEST_ASSERT_EQUAL_STRING("stable", m.daily().form(rig.clock.now).c_str());
}

void test_an_ordinary_session_does_not_offer_the_ritual_when_awake() {
  TwoFolderRig rig;
  auto m = rig.machine();
  m.daily().replace("{\"date\":\"2026-09-19\",\"form\":\"stable\",\"resurrectionId\":99,\"lastSessionAt\":null}");
  m.begin();
  m.handle(Input::SunLong);
  TEST_ASSERT_EQUAL_STRING("ACTIVITIES", rig.renderer.last().items[0].c_str());
}

void test_a_look_from_the_web_is_worn_and_kept() {
  TwoFolderRig rig;
  {
    auto m = rig.machine();
    m.begin();
    m.setLook("CARMILLA");
    TEST_ASSERT_EQUAL_STRING("CARMILLA", m.lookName());
    TEST_ASSERT_EQUAL_STRING("CARMILLA", look(rig.renderer.last().look).name());
    m.setLook("NOT A LOOK");
    TEST_ASSERT_EQUAL_STRING("CARMILLA", m.lookName());
  }
  auto again = rig.machine();
  again.begin();
  TEST_ASSERT_EQUAL_STRING("CARMILLA", again.lookName());
}

void test_reading_sun_turns_power_keeps_and_holding_power_leaves_the_book() {
  FakeStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} });
  std::string text;
  for (int i = 0; i < 60; ++i) text += "Ne raillons pas les fous, leur folie dure plus longtemps que la notre. ";
  storage.write("/shelf.txt", "7 1 0 0 The King in Yellow\n");
  storage.write(Book::headPath(7), "1 0 0\nThe King in Yellow\nChambers\nThe Mask\n");
  storage.write(Book::partPath(7, 0), text);
  storage.write(Book::donePath(7), "");
  EventQueue queue(storage);
  SessionMachine m(carousel, queue, clock, storage, renderer, random);
  m.begin();
  // Up to the menu, along to READ, into the shelf, the book and its page.
  m.handle(Input::SunLong);
  for (int i = 0; i < 3; ++i) m.handle(Input::SunShort);
  m.handle(Input::PowerShort);
  m.handle(Input::PowerShort);
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.reading());
  TEST_ASSERT_EQUAL_INT(0, renderer.last().page);

  m.handle(Input::SunShort);
  TEST_ASSERT_EQUAL_INT(1, renderer.last().page);
  m.handle(Input::SunLong);
  TEST_ASSERT_EQUAL_INT(0, renderer.last().page);
  TEST_ASSERT_TRUE(m.reading());
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(renderer.last().kept);

  // Holding POWER is not goodnight here: it is the menu.
  m.handle(Input::PowerLong);
  TEST_ASSERT_FALSE(m.reading());
  TEST_ASSERT_TRUE(m.screen() == Screen::Idle);
  TEST_ASSERT_TRUE(renderer.last().place == Place::Menu);
  // Outside the book it switches off as before.
  m.handle(Input::PowerLong);
  TEST_ASSERT_TRUE(m.screen() == Screen::Dormant);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_while_dormant_the_menu_offers_the_ritual_and_it_lights_candles);
  RUN_TEST(test_an_ordinary_session_does_not_offer_the_ritual_when_awake);
  RUN_TEST(test_begin_shows_waking_then_the_list);
  RUN_TEST(test_power_on_a_folder_opens_it_instead_of_starting);
  RUN_TEST(test_holding_sun_goes_up_a_level_and_then_to_the_menu);
  RUN_TEST(test_the_menu_shows_todays_progress);
  RUN_TEST(test_power_ticks_a_todo_and_the_last_one_celebrates);
  RUN_TEST(test_power_ticks_a_habit);
  RUN_TEST(test_quotes_cycle_with_power);
  RUN_TEST(test_sun_turns_the_pages_of_a_long_quote);
  RUN_TEST(test_settings_change_text_size_and_keep_it);
  RUN_TEST(test_large_text_turns_more_pages);
  RUN_TEST(test_sync_now_asks_the_main_loop_and_shows_the_answer);
  RUN_TEST(test_the_look_changes_in_settings_and_is_kept);
  RUN_TEST(test_the_menu_marks_settings_as_its_gear);
  RUN_TEST(test_a_look_from_the_web_is_worn_and_kept);
  RUN_TEST(test_left_alone_he_takes_the_screen_and_a_press_only_wakes_it);
  RUN_TEST(test_boot_reopens_the_last_started_activity);
  RUN_TEST(test_power_long_draws_dormant_from_idle);
  RUN_TEST(test_sun_skips_the_sealed_screen);
  RUN_TEST(test_failed_queue_append_keeps_the_session_running);
  RUN_TEST(test_recovery_reuses_the_uuid_minted_at_start);
  RUN_TEST(test_normal_stop_uses_the_uuid_minted_at_start);
  RUN_TEST(test_uuid_is_rfc9562_version_4);
  RUN_TEST(test_consecutive_uuids_differ_even_within_the_same_second);
  RUN_TEST(test_reading_sun_turns_power_keeps_and_holding_power_leaves_the_book);
  RUN_TEST(test_power_short_starts_a_session);
  RUN_TEST(test_running_screen_never_shows_elapsed_time);
  RUN_TEST(test_second_power_short_queues_the_session_and_clears_the_marker);
  RUN_TEST(test_stopped_screen_shows_the_duration_once);
  RUN_TEST(test_sun_presses_are_ignored_while_running);
  RUN_TEST(test_power_cut_mid_session_recovers_at_the_last_heartbeat);
  RUN_TEST(test_torn_final_heartbeat_line_does_not_lose_the_valid_marker);
  RUN_TEST(test_garbage_heartbeat_field_does_not_override_the_last_good_line);
  RUN_TEST(test_corrupted_marker_lines_are_rejected_not_parsed);
  RUN_TEST(test_heartbeats_accumulate_as_separate_marker_lines);
  RUN_TEST(test_tick_does_not_redraw_while_running);
  RUN_TEST(test_power_long_while_running_saves_a_final_heartbeat);
  RUN_TEST(test_failed_marker_write_keeps_the_session_from_starting);
  RUN_TEST(test_start_never_overwrites_an_unrecovered_marker);
  RUN_TEST(test_stopped_screen_holds_for_five_seconds_then_returns_to_idle);
  RUN_TEST(test_power_cut_between_queue_append_and_marker_clear_requeues_with_the_same_uuid);
  RUN_TEST(test_redraw_in_idle_shows_the_reloaded_carousel);
  RUN_TEST(test_redraw_outside_idle_draws_nothing);
  RUN_TEST(test_power_short_on_a_reset_rtc_stays_idle_and_writes_nothing);
  RUN_TEST(test_power_short_on_a_zero_clock_stays_idle_and_writes_nothing);
  RUN_TEST(test_power_short_at_exactly_the_clock_floor_starts_the_session);
  return UNITY_END();
}
