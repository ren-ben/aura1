#include "session_machine.h"
#include "validate.h"
#include <cstdlib>
#include <vector>

// Entropy comes from the Random port: esp_random() on the device, a deterministic
// fake in tests. Never seed from the clock: two sessions ending in the same second
// would get the same id, and the server silently keeps only the first.
std::string uuidV4(Random& random) {
  static const char* HEX = "0123456789abcdef";
  uint8_t bytes[16];
  for (int i = 0; i < 16; i += 4) {
    const uint32_t r = random.next();
    bytes[i] = r & 0xFF;
    bytes[i + 1] = (r >> 8) & 0xFF;
    bytes[i + 2] = (r >> 16) & 0xFF;
    bytes[i + 3] = (r >> 24) & 0xFF;
  }
  bytes[6] = (bytes[6] & 0x0F) | 0x40;  // version 4
  bytes[8] = (bytes[8] & 0x3F) | 0x80;  // RFC 9562 variant
  std::string out;
  out.reserve(36);
  for (int i = 0; i < 16; ++i) {
    if (i == 4 || i == 6 || i == 8 || i == 10) out += '-';
    out += HEX[bytes[i] >> 4];
    out += HEX[bytes[i] & 0x0F];
  }
  return out;
}

namespace {

using validate::isDigitsOnly;
using validate::isValidUuid;

// Splits a marker line on spaces and validates it: exactly 4 fields, an
// activityId, startedAt and heartbeat that are all-digit and non-empty, a
// positive activityId, a heartbeat that is not before startedAt, and a
// well-formed uuid. No sscanf/snprintf and no %llu: arduino-esp32's
// printf/scanf support for it is unconfirmed, so this mirrors the
// field-splitting queue.cpp already uses for its own line format.
//
// A line that fails any of these checks is skipped entirely rather than
// partially trusted: strtoull/atoi parse a corrupted field into a number
// that looks legitimate (e.g. "xyz" -> heartbeat 0), and a corrupted line
// that "wins" as the last valid one can delete a real session or feed the
// server a device_uuid it rejects forever.
bool parseMarkerLine(const std::string& line, int& activityId, uint64_t& startedAt,
                      uint64_t& heartbeat, std::string& uuid) {
  std::vector<std::string> fields;
  size_t start = 0;
  while (start <= line.size()) {
    const size_t end = line.find(' ', start);
    if (end == std::string::npos) {
      fields.push_back(line.substr(start));
      break;
    }
    fields.push_back(line.substr(start, end - start));
    start = end + 1;
  }
  if (fields.size() != 4) return false;
  if (!isDigitsOnly(fields[0]) || !isDigitsOnly(fields[1]) || !isDigitsOnly(fields[2])) {
    return false;
  }
  // Same overflow caps as queue.cpp: without them "99999999999" wraps
  // through atoi to a small positive int and is silently accepted.
  if (fields[0].size() > validate::MAX_ACTIVITY_ID_DIGITS ||
      fields[1].size() > validate::MAX_TIMESTAMP_DIGITS ||
      fields[2].size() > validate::MAX_TIMESTAMP_DIGITS) {
    return false;
  }
  if (!isValidUuid(fields[3])) return false;

  const int a = std::atoi(fields[0].c_str());
  if (a <= 0) return false;
  const uint64_t s = std::strtoull(fields[1].c_str(), nullptr, 10);
  const uint64_t h = std::strtoull(fields[2].c_str(), nullptr, 10);
  if (h < s) return false;

  activityId = a;
  startedAt = s;
  heartbeat = h;
  uuid = fields[3];
  return true;
}

}  // namespace

SessionMachine::SessionMachine(Carousel& carousel, EventQueue& queue, Clock& clock,
                               Storage& storage, Renderer& renderer, Random& random)
  : carousel_(carousel), queue_(queue), clock_(clock),
    storage_(storage), renderer_(renderer), random_(random) {}

void SessionMachine::begin() {
  recoverMarker();
  screen_ = Screen::Idle;
  draw();
}

void SessionMachine::recoverMarker() {
  if (!storage_.exists(MARKER)) return;
  const auto lines = storage_.readLines(MARKER);

  bool found = false;
  int activityId = 0;
  uint64_t startedAt = 0, heartbeat = 0;
  std::string uuid;

  // Heartbeats are appended, never overwritten, so a power cut mid-append can
  // leave a torn or blank line after the last good one. Scan every line and
  // keep the last one that parses cleanly, rather than trusting the first.
  for (const auto& line : lines) {
    int a = 0;
    uint64_t s = 0, h = 0;
    std::string u;
    if (parseMarkerLine(line, a, s, h, u)) {
      found = true;
      activityId = a;
      startedAt = s;
      heartbeat = h;
      uuid = u;
    }
  }

  if (!found) { storage_.remove(MARKER); return; }

  if (heartbeat > startedAt) {
    // Reuse the uuid minted at start: if this session already reached the queue
    // before the power cut, the server sees the same device_uuid and dedupes it.
    if (!queue_.append({ uuid, activityId, startedAt, heartbeat, true })) {
      return;  // keep the marker; try again on the next boot
    }
  }
  // heartbeat == startedAt means the session never reached its first
  // heartbeat: discard it deliberately, as a zero-length session.
  storage_.remove(MARKER);
}

std::string SessionMachine::serialiseMarker(uint64_t heartbeat) const {
  return std::to_string(activityId_) + " " + std::to_string(startedAt_) + " "
       + std::to_string(heartbeat) + " " + sessionUuid_;
}

bool SessionMachine::writeMarker(uint64_t heartbeat) {
  // The very first line: nothing exists yet, so a truncating write cannot
  // lose anything.
  if (!storage_.write(MARKER, serialiseMarker(heartbeat) + "\n")) return false;
  lastHeartbeat_ = heartbeat;
  return true;
}

void SessionMachine::appendHeartbeat(uint64_t heartbeat) {
  // Append, never overwrite: FILE_WRITE on the device truncates before
  // writing, and a power cut between the two would empty the marker. A
  // leading newline terminates any unterminated previous line, matching
  // EventQueue's append convention.
  if (storage_.append(MARKER, "\n" + serialiseMarker(heartbeat))) {
    lastHeartbeat_ = heartbeat;
  }
}

void SessionMachine::startSession() {
  // Recovery may not have finished (e.g. the queue append keeps failing);
  // never start a new session on top of a marker that is still unrecovered.
  recoverMarker();
  if (storage_.exists(MARKER)) return;

  // Refuse before anything is written: stay Idle on an unset/reset clock
  // rather than mint a session that will land under the wrong date.
  if (clock_.nowEpochSeconds() < MIN_VALID_CLOCK_EPOCH_SECONDS) return;

  activityId_ = carousel_.currentActivityId();
  if (activityId_ == 0) return;
  sessionUuid_ = uuidV4(random_);
  startedAt_ = clock_.nowEpochSeconds();
  if (!writeMarker(startedAt_)) return;  // first write failed: stay Idle
  screen_ = Screen::Running;
  draw();
}

void SessionMachine::stopSession() {
  const uint64_t endedAt = clock_.nowEpochSeconds();
  if (!queue_.append({ sessionUuid_, activityId_, startedAt_, endedAt, true })) {
    draw();  // stay Running with the marker intact; nothing is lost
    return;
  }
  storage_.remove(MARKER);
  screen_ = Screen::Stopped;
  stoppedAt_ = endedAt;
  draw(static_cast<int>((endedAt - startedAt_) / 60));
}

void SessionMachine::handle(Input input) {
  switch (screen_) {
    case Screen::Idle:
      if (input == Input::SunShort) { carousel_.nextActivity(); draw(); }
      else if (input == Input::SunLong) { carousel_.nextFolder(); draw(); }
      else if (input == Input::PowerShort) { startSession(); }
      break;

    case Screen::Running:
      // Sun is deliberately inert while running. Changing activity mid-session
      // would make the logged block a lie.
      if (input == Input::PowerShort) { stopSession(); }
      else if (input == Input::PowerLong) {
        // The device is about to power off: append a final heartbeat so at
        // most a partial interval is lost on recovery, not the whole
        // session. Stays Running; there is no more input coming.
        appendHeartbeat(clock_.nowEpochSeconds());
      } else if (input == Input::Tick) {
        const uint64_t now = clock_.nowEpochSeconds();
        if (now - lastHeartbeat_ >= HEARTBEAT_SECONDS) appendHeartbeat(now);
        // No draw(): an identical frame every second would flash the
        // e-ink needlessly on every redraw.
      }
      break;

    case Screen::Stopped:
      if (input == Input::PowerShort || input == Input::SunShort) {
        screen_ = Screen::Idle;
        draw();
      } else if (input == Input::Tick) {
        if (clock_.nowEpochSeconds() - stoppedAt_ >= STOPPED_HOLD_SECONDS) {
          screen_ = Screen::Idle;
          draw();
        }
      }
      break;

    case Screen::Syncing:
      break;
  }
}

void SessionMachine::redraw() {
  if (screen_ == Screen::Idle) draw();
}

void SessionMachine::draw(int minutes) {
  ViewModel vm;
  carousel_.fill(vm);
  vm.screen = screen_;
  // Running never carries elapsed time. Design decision, not an omission.
  vm.minutes = (screen_ == Screen::Stopped) ? minutes : 0;
  renderer_.render(vm);
}
