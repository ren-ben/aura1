#include "session_machine.h"
#include "art_index.h"
#include "looks.h"
#include "validate.h"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <vector>

// Entropy comes from the Random port: esp_random() on the device, a deterministic
// fake in tests. Never seed from the clock: two sessions ending in the same second
// would get the same id, and the server silently keeps only the first.
std::string uuidV4(Random& random) {
  static const char* HEX_DIGITS = "0123456789abcdef";
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
    out += HEX_DIGITS[bytes[i] >> 4];
    out += HEX_DIGITS[bytes[i] & 0x0F];
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

// The skins he can wear. Only Jiji so far; the others unlock with the bond.
static const char* const SKINS[] = { "jiji" };

void SessionMachine::begin() {
  daily_.load();
  loadSettings();
  lastInput_ = clock_.nowEpochSeconds();
  screen_ = Screen::Waking;
  moment_ = wakeMoment(daily_.form(lastInput_));
  draw();
  recoverMarker();
  const auto nav = storage_.readLines(NAV);
  if (!nav.empty()) carousel_.openActivity(std::atoi(nav[0].c_str()));
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

void SessionMachine::startSession(int activityId) {
  // Recovery may not have finished (e.g. the queue append keeps failing);
  // never start a new session on top of a marker that is still unrecovered.
  recoverMarker();
  if (storage_.exists(MARKER)) return;

  // Refuse before anything is written: stay Idle on an unset/reset clock
  // rather than mint a session that will land under the wrong date.
  if (clock_.nowEpochSeconds() < MIN_VALID_CLOCK_EPOCH_SECONDS) return;

  activityId_ = activityId ? activityId : carousel_.currentActivityId();
  if (activityId_ == 0) return;
  // The ritual shows its candles instead of the folder's scene.
  ritual_ = activityId_ == daily_.resurrectionId();
  moment_ = ritual_ ? "ritual-0" : "";
  sessionUuid_ = uuidV4(random_);
  startedAt_ = clock_.nowEpochSeconds();
  if (!writeMarker(startedAt_)) return;  // first write failed: stay Idle
  // Where the next boot reopens. Losing it only costs the resume position.
  if (!ritual_) storage_.write(NAV, std::to_string(activityId_) + "\n");
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
  const int minutes = static_cast<int>((endedAt - startedAt_) / 60);
  daily_.sessionEnded(endedAt, activityId_, minutes);
  moment_ = ritual_ && minutes >= 60 ? "resurrected" : "";
  screen_ = Screen::Stopped;
  stoppedAt_ = endedAt;
  draw(static_cast<int>((endedAt - startedAt_) / 60));
}

void SessionMachine::handle(Input input) {
  if (input == Input::PowerLong) {
    // The device is about to power off: append a final heartbeat so at most a
    // partial interval is lost on recovery, not the whole session. The marker
    // stays, so the next boot recovers it.
    if (screen_ == Screen::Running) appendHeartbeat(clock_.nowEpochSeconds());
    screen_ = Screen::Dormant;
    draw();
    return;
  }

  const uint64_t now = clock_.nowEpochSeconds();
  if (input != Input::Tick) lastInput_ = now;
  // Past midnight the day's lists move on; an open list shows it at once.
  if (daily_.rollover(now) && input == Input::Tick && screen_ == Screen::Idle) draw();

  switch (screen_) {
    case Screen::Idle:
      if (input == Input::Tick) {
        // Left alone, he fills the glass with something of his own.
        if (now - lastInput_ >= SCREENSAVER_SECONDS) {
          screen_ = Screen::Screensaver;
          moment_ = screensaverMoment(daily_.form(now), daily_.date());
          draw();
        }
      } else {
        browse(input);
      }
      break;

    case Screen::Screensaver:
      // Any press only wakes the list; it does not also act.
      if (input != Input::Tick) { screen_ = Screen::Idle; draw(); }
      break;

    case Screen::Celebrate:
      if (input != Input::Tick || now - celebrateAt_ >= CELEBRATE_SECONDS) { screen_ = Screen::Idle; draw(); }
      break;

    case Screen::Running:
      // Sun is deliberately inert while running. Changing activity mid-session
      // would make the logged block a lie.
      if (input == Input::PowerShort) { stopSession(); }
      else if (input == Input::Tick) {
        const uint64_t now = clock_.nowEpochSeconds();
        if (now - lastHeartbeat_ >= HEARTBEAT_SECONDS) appendHeartbeat(now);
        // The ritual lights a candle every 15 minutes: the one redraw allowed.
        if (ritual_) {
          const std::string stage = "ritual-" + std::to_string(std::min<uint64_t>(4, (now - startedAt_) / RITUAL_STAGE_SECONDS));
          if (stage != moment_) { moment_ = stage; draw(); }
        }
        // No draw(): an identical frame every second would flash the
        // e-ink needlessly on every redraw.
      }
      break;

    case Screen::Stopped:
      if (input == Input::PowerShort || input == Input::SunShort || input == Input::SunDouble) {
        screen_ = Screen::Idle;
        draw();
      } else if (input == Input::Tick) {
        if (clock_.nowEpochSeconds() - stoppedAt_ >= STOPPED_HOLD_SECONDS) {
          screen_ = Screen::Idle;
          draw();
        }
      }
      break;

    case Screen::Waking:
    case Screen::Dormant:
      break;
  }
}

// SUN moves, POWER acts on the selection, holding SUN goes up a level: from
// a folder to the folder list, from any place to the menu.
void SessionMachine::browse(Input input) {
  switch (place_) {
    case Place::Menu: {
      const auto places = menu();
      menuCursor_ %= places.size();
      if (input == Input::SunShort) { menuCursor_ = (menuCursor_ + 1) % places.size(); draw(); }
      else if (input == Input::SunDouble) { menuCursor_ = (menuCursor_ + places.size() - 2) % places.size(); draw(); }
      else if (input == Input::PowerShort) {
        if (places[menuCursor_] == Place::Resurrect) startSession(daily_.resurrectionId());
        else enter(places[menuCursor_]);
      }
      break;
    }
    case Place::Resurrect:
      break;
    case Place::Activities:
      if (input == Input::SunShort) { carousel_.next(); draw(); }
      else if (input == Input::SunDouble) { carousel_.previous(); carousel_.previous(); draw(); }
      else if (input == Input::SunLong) {
        if (carousel_.level() == Level::Activities) carousel_.up();
        else place_ = Place::Menu;
        draw();
      } else if (input == Input::PowerShort) {
        if (carousel_.level() == Level::Folders) { carousel_.enter(); draw(); }
        else startSession();
      }
      break;
    case Place::Todos:
    case Place::Habits: {
      const bool todos = place_ == Place::Todos;
      const size_t count = todos ? daily_.todos().size() : daily_.habits().size();
      if (input == Input::SunShort && count) { listCursor_ = (listCursor_ + 1) % count; draw(); }
      else if (input == Input::SunDouble && count) { listCursor_ = (listCursor_ + 2 * count - 2) % count; draw(); }
      else if (input == Input::SunLong) { place_ = Place::Menu; draw(); }
      else if (input == Input::PowerShort && count) {
        const bool ticked = todos ? daily_.toggleTodo(listCursor_) : daily_.toggleHabit(listCursor_);
        if (ticked && todos && daily_.allTodosDone()) celebrate("todos-done");
        else draw();
      }
      break;
    }
    // SUN turns the page of a long quote, POWER moves to the next quote.
    case Place::Quotes: {
      const size_t count = daily_.quotes().size();
      if (input == Input::SunLong) { place_ = Place::Menu; draw(); }
      else if (input == Input::PowerShort && count) { quote_ = (quote_ + 1) % count; quotePage_ = 0; draw(); }
      else if (input == Input::SunShort && count) {
        const int pages = quotePageCount(look(look_), daily_.quotes()[quote_].body, largeText_);
        if (pages > 1) { quotePage_ = (quotePage_ + 1) % pages; draw(); }
      } else if (input == Input::SunDouble && count) {
        const int pages = quotePageCount(look(look_), daily_.quotes()[quote_].body, largeText_);
        if (pages > 1) { quotePage_ = (quotePage_ + 2 * pages - 2) % pages; draw(); }
      }
      break;
    }
    // SUN moves, POWER changes the line: text size, look, skin, or a sync now.
    case Place::Settings:
      if (input == Input::SunShort) { listCursor_ = (listCursor_ + 1) % 4; draw(); }
      else if (input == Input::SunDouble) { listCursor_ = (listCursor_ + 2) % 4; draw(); }
      else if (input == Input::SunLong) { place_ = Place::Menu; draw(); }
      else if (input == Input::PowerShort) {
        if (listCursor_ == 0) { largeText_ = !largeText_; saveSettings(); }
        else if (listCursor_ == 1) { look_ = (look_ + 1) % lookCount(); saveSettings(); }
        else if (listCursor_ == 2) {
          const size_t count = sizeof(SKINS) / sizeof(SKINS[0]);
          size_t i = 0;
          while (i < count && skin_ != SKINS[i]) ++i;
          skin_ = SKINS[(i + 1) % count];
          saveSettings();
        } else if (listCursor_ == 3) { syncRequested_ = true; syncNote_ = "SYNCING"; }
        draw();
      }
      break;
  }
}

void SessionMachine::loadSettings() {
  const auto lines = storage_.readLines(SETTINGS);
  if (lines.empty()) return;
  largeText_ = lines[0].rfind("1", 0) == 0;
  const size_t space = lines[0].find(' ');
  if (space != std::string::npos) skin_ = lines[0].substr(space + 1);
  if (lines.size() > 1) look_ = lookIndex(lines[1]);
}

void SessionMachine::saveSettings() {
  storage_.write(SETTINGS, std::string(largeText_ ? "1 " : "0 ") + skin_ + "\n" + look(look_).name() + "\n");
}

bool SessionMachine::takeSyncRequest() {
  const bool asked = syncRequested_;
  syncRequested_ = false;
  return asked;
}

void SessionMachine::setSyncNote(const std::string& note) {
  syncNote_ = note;
  redrawSettings();
}

void SessionMachine::setLook(const std::string& name) {
  for (int i = 0; i < lookCount(); ++i) {
    if (name != look(i).name() || i == look_) continue;
    look_ = i;
    saveSettings();
    if (screen_ == Screen::Idle) draw();
  }
}

const char* SessionMachine::lookName() const { return look(look_).name(); }

void SessionMachine::batteryChanged() {
  redrawSettings();
}

void SessionMachine::redrawSettings() {
  if (screen_ == Screen::Idle && place_ == Place::Settings) draw();
}

// While he is dormant the menu opens with the ritual that wakes him.
std::vector<Place> SessionMachine::menu() const {
  std::vector<Place> places;
  if (daily_.resurrectionId() && daily_.form(clock_.nowEpochSeconds()) == "dormant") places.push_back(Place::Resurrect);
  for (Place p : { Place::Activities, Place::Todos, Place::Habits, Place::Quotes, Place::Settings }) places.push_back(p);
  return places;
}

void SessionMachine::enter(Place place) {
  place_ = place;
  listCursor_ = 0;
  quotePage_ = 0;
  const size_t quotes = daily_.quotes().size();
  if (place == Place::Quotes && quotes) quote_ = random_.next() % quotes;
  draw();
}

void SessionMachine::celebrate(const std::string& moment) {
  moment_ = moment;
  celebrateAt_ = clock_.nowEpochSeconds();
  screen_ = Screen::Celebrate;
  draw();
}

void SessionMachine::redraw() {
  if (screen_ == Screen::Idle) draw();
}

void SessionMachine::draw(int minutes) {
  ViewModel vm;
  carousel_.fill(vm);
  vm.screen = screen_;
  vm.moment = moment_;
  vm.place = place_;
  const auto doneOf = [](const std::vector<DailyItem>& items) {
    int n = 0;
    for (const auto& i : items) n += i.done;
    return std::to_string(n) + "/" + std::to_string(items.size());
  };
  const auto list = [&](const char* title, const std::vector<DailyItem>& items) {
    vm.title = title;
    vm.items.clear();
    for (const auto& i : items) {
      vm.items.push_back(i.text);
      vm.checks.push_back(i.done);
      vm.history.push_back(i.history);
    }
    if (listCursor_ >= items.size()) listCursor_ = 0;
    vm.cursor = static_cast<int>(listCursor_);
  };
  switch (place_) {
    case Place::Menu:
      vm.title = "AURA-1";
      vm.items.clear();
      for (Place p : menu()) {
        if (p == Place::Settings) vm.gear = static_cast<int>(vm.items.size());
        switch (p) {
          case Place::Resurrect: vm.items.push_back("RESURRECT"); break;
          case Place::Activities: vm.items.push_back("ACTIVITIES"); break;
          case Place::Todos: vm.items.push_back("TODAY " + doneOf(daily_.todos())); break;
          case Place::Habits: vm.items.push_back("HABITS " + doneOf(daily_.habits())); break;
          case Place::Settings: vm.items.push_back("SETTINGS"); break;
          default: vm.items.push_back("QUOTES"); break;
        }
      }
      vm.cursor = static_cast<int>(menuCursor_ % vm.items.size());
      vm.top = true;
      break;
    case Place::Resurrect:
      break;
    case Place::Todos: list("TODAY", daily_.todos()); break;
    case Place::Habits: list("HABITS", daily_.habits()); break;
    case Place::Quotes:
      vm.title = "QUOTES";
      vm.items.assign(daily_.quotes().size(), "");
      vm.cursor = static_cast<int>(quote_);
      if (quote_ < daily_.quotes().size()) {
        vm.quote = daily_.quotes()[quote_].body;
        vm.source = daily_.quotes()[quote_].source;
        vm.quotePage = quotePage_;
      }
      break;
    case Place::Settings: {
      std::string skin = skin_;
      for (auto& c : skin) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
      vm.title = "SETTINGS";
      vm.items = { "TEXT", "LOOK", "SKIN", "SYNC" };
      vm.values = { largeText_ ? "LARGE" : "SMALL", look(look_).name(), skin, syncNote_ };
      vm.cursor = static_cast<int>(listCursor_);
      break;
    }
    case Place::Activities:
      break;
  }
  vm.largeText = largeText_;
  vm.look = look_;
  // Running never carries elapsed time. Design decision, not an omission.
  vm.minutes = (screen_ == Screen::Stopped) ? minutes : 0;
  renderer_.render(vm);
}
