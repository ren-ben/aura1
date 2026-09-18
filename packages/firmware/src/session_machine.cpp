#include "session_machine.h"
#include <cstdio>
#include <cstdlib>

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
  if (lines.empty()) { storage_.remove(MARKER); return; }

  int activityId = 0;
  unsigned long long startedAt = 0, heartbeat = 0;
  char uuid[37] = {0};
  if (std::sscanf(lines[0].c_str(), "%d %llu %llu %36s",
                  &activityId, &startedAt, &heartbeat, uuid) == 4 && heartbeat > startedAt) {
    // Reuse the uuid minted at start: if this session already reached the queue before
    // the power cut, the server sees the same device_uuid and deduplicates it.
    if (!queue_.append({ std::string(uuid), activityId,
                         static_cast<uint64_t>(startedAt),
                         static_cast<uint64_t>(heartbeat), true })) {
      return;  // keep the marker; try again on the next boot
    }
  }
  storage_.remove(MARKER);
}

void SessionMachine::writeMarker(uint64_t heartbeat) {
  char line[128];
  std::snprintf(line, sizeof(line), "%d %llu %llu %s",
                activityId_,
                static_cast<unsigned long long>(startedAt_),
                static_cast<unsigned long long>(heartbeat),
                sessionUuid_.c_str());
  storage_.write(MARKER, std::string(line) + "\n");
  lastHeartbeat_ = heartbeat;
}

void SessionMachine::startSession() {
  activityId_ = carousel_.currentActivityId();
  if (activityId_ == 0) return;
  sessionUuid_ = uuidV4(random_);
  startedAt_ = clock_.nowEpochSeconds();
  writeMarker(startedAt_);
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
      else if (input == Input::Tick) {
        const uint64_t now = clock_.nowEpochSeconds();
        if (now - lastHeartbeat_ >= HEARTBEAT_SECONDS) writeMarker(now);
        draw();
      }
      break;

    case Screen::Stopped:
      if (input == Input::PowerShort || input == Input::SunShort || input == Input::Tick) {
        screen_ = Screen::Idle;
        draw();
      }
      break;

    case Screen::Syncing:
      break;
  }
}

void SessionMachine::draw(int minutes) {
  ViewModel vm;
  carousel_.fill(vm);
  vm.screen = screen_;
  // Running never carries elapsed time. Design decision, not an omission.
  vm.minutes = (screen_ == Screen::Stopped) ? minutes : 0;
  renderer_.render(vm);
}
