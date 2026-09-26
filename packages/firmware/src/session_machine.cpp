#include "session_machine.h"
#include "book.h"
#include "art_index.h"
#include "looks.h"
#include "validate.h"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <vector>

// The lengths a sit can be, in minutes; 0 is open, ended by hand.
static const int SIT_LENGTHS[] = { 5, 10, 15, 20, 25, 30, 45, 60, 0 };

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
  book_.begin();
  daily_.load();
  loadSettings();
  for (const auto& line : storage_.readLines(SITS)) {
    const size_t space = line.find(' ');
    if (space != std::string::npos) lengths_[std::atoi(line.c_str())] = std::atoi(line.c_str() + space + 1);
  }
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
  moment_ = ritual_ ? "ritual-0" : sit_ ? (sitPacer_ == Pacer::None ? "vigil" : "vigil-breath") : "";
  sessionUuid_ = uuidV4(random_);
  startedAt_ = clock_.nowEpochSeconds();
  if (!writeMarker(startedAt_)) return;  // first write failed: stay Idle
  // Where the next boot reopens. Losing it only costs the resume position.
  if (!ritual_ && !sit_) storage_.write(NAV, std::to_string(activityId_) + "\n");
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
  moment_ = ritual_ && minutes >= 60 ? "resurrected" : sit_ ? "vigil-kept" : "";
  screen_ = Screen::Stopped;
  stoppedAt_ = endedAt;
  draw(static_cast<int>((endedAt - startedAt_) / 60));
}

void SessionMachine::handle(Input input) {
  if (input == Input::PowerLong && reading()) {
    lastInput_ = clock_.nowEpochSeconds();
    place_ = Place::Menu;
    draw();
    return;
  }
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
  // The sun hours, if they are on: dawn, noon, dusk and midnight.
  if (input == Input::Tick && daily_.sunHour(now)) chime("hour");
  // Past midnight the day's lists move on; an open list shows it at once.
  if (daily_.rollover(now) && input == Input::Tick && screen_ == Screen::Idle) draw();

  switch (screen_) {
    case Screen::Idle:
      if (input == Input::Tick) {
        // The plan is left up to be glanced at, and moves on as the day does.
        if (place_ == Place::Plan) {
          if (now / PLAN_REDRAW_SECONDS != planDrawn_) draw();
        // Left alone, he fills the glass with something of his own.
        } else if (now - lastInput_ >= SCREENSAVER_SECONDS) {
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
      if (input == Input::PowerShort) { stopSession(); if (sit_ && screen_ == Screen::Stopped) chime("close"); }
      else if (input == Input::Tick) {
        const uint64_t now = clock_.nowEpochSeconds();
        if (now - lastHeartbeat_ >= HEARTBEAT_SECONDS) appendHeartbeat(now);
        if (sit_) { sitTick(now); break; }
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
        sit_ = false;
        draw();
      } else if (input == Input::Tick) {
        if (clock_.nowEpochSeconds() - stoppedAt_ >= STOPPED_HOLD_SECONDS) {
          screen_ = Screen::Idle;
          sit_ = false;
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
    case Place::Vigil:
      vigil(input);
      break;
    case Place::Plan:
      if (input == Input::SunLong) { place_ = Place::Menu; draw(); }
      else if (input == Input::PowerShort) {
        const int now = daily_.minuteOfDay(clock_.nowEpochSeconds());
        for (const Tap& t : daily_.plan()) {
          if (t.start <= now && now < t.end && t.activityId) { startSession(t.activityId); break; }
        }
      }
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
    // The shelf. SUN walks the books, POWER opens one; one that is not on
    // the card yet is copied onto it first, and he is seen doing it.
    case Place::Shelf: {
      const auto& shelf = book_.shelf();
      const size_t count = shelf.size();
      if (!count) {
        // Nothing on it yet. The page says where books come from; either
        // button leaves.
        if (book_.has()) { place_ = Place::Book; draw(); }
        else if (input == Input::SunLong || input == Input::PowerShort) { place_ = Place::Menu; draw(); }
        break;
      }
      if (input == Input::SunShort) { listCursor_ = (listCursor_ + 1) % count; draw(); }
      else if (input == Input::SunDouble) { listCursor_ = (listCursor_ + 2 * count - 2) % count; draw(); }
      else if (input == Input::SunLong) { place_ = Place::Menu; draw(); }
      else if (input == Input::PowerShort) {
        const ShelfBook& chosen = shelf[listCursor_ % count];
        if (book_.open(chosen.id)) {
          place_ = Place::Book;
          listCursor_ = static_cast<size_t>(book_.chapterIdx());
          repaginate();
        } else {
          place_ = Place::Transcribe;
          copied_ = 0;
          toCopy_ = chosen.chapters;
          syncNote_ = "";
          syncRequested_ = true;
        }
        draw();
      }
      break;
    }

    // The contents. SUN walks the chapters, POWER opens one.
    case Place::Book: {
      const size_t count = book_.chapters().size();
      if (!count) { place_ = Place::Menu; draw(); break; }
      if (input == Input::SunShort) { listCursor_ = (listCursor_ + 1) % count; draw(); }
      else if (input == Input::SunDouble) { listCursor_ = (listCursor_ + 2 * count - 2) % count; draw(); }
      else if (input == Input::SunLong) { place_ = Place::Shelf; listCursor_ = 0; draw(); }
      else if (input == Input::PowerShort) {
        const int idx = static_cast<int>(listCursor_);
        // A chapter that has not reached the card yet is asked for.
        if (!book_.holds(idx)) { syncRequested_ = true; draw(); break; }
        if (idx != book_.chapterIdx()) book_.goTo(idx, 0);
        book_.save();
        place_ = Place::Reading;
        repaginate();
        if (idx != book_.chapterIdx() || book_.through() == 0) page_ = 0;
        draw();
      }
      break;
    }
    case Place::Reading:
      read(input);
      break;

    // He is copying a book onto the card. SUN goes back to the shelf and
    // leaves him to it; POWER tries again after the hotspot was not there.
    case Place::Transcribe:
      if (input == Input::SunShort || input == Input::SunLong) { place_ = Place::Shelf; draw(); }
      else if (input == Input::PowerShort) { syncNote_ = ""; syncRequested_ = true; draw(); }
      break;

    // SUN moves, POWER changes the line: text size, look, skin, or a sync now.
    case Place::Settings:
      if (input == Input::SunShort) { listCursor_ = (listCursor_ + 1) % 4; draw(); }
      else if (input == Input::SunDouble) { listCursor_ = (listCursor_ + 2) % 4; draw(); }
      else if (input == Input::SunLong) { place_ = Place::Menu; draw(); }
      else if (input == Input::PowerShort) {
        // Either of these changes how a page of a book is set, so the
        // chapter is cut into pages again under the new one.
        if (listCursor_ == 0) { largeText_ = !largeText_; saveSettings(); if (book_.has()) repaginate(); }
        else if (listCursor_ == 1) { look_ = (look_ + 1) % lookCount(); saveSettings(); if (book_.has()) repaginate(); }
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
  if (screen_ == Screen::Idle && place_ == Place::Transcribe) draw();
}

void SessionMachine::copying(int bookId, int done, int total) {
  if (bookId == book_.id()) book_.refresh();
  if (bookId != book_.wanted()) return;
  copied_ = done;
  toCopy_ = total;
  if (screen_ == Screen::Idle && place_ == Place::Transcribe) draw();
}

void SessionMachine::bookArrived(int bookId) {
  const bool opened = book_.arrived(bookId);
  if (opened && place_ == Place::Transcribe) {
    place_ = Place::Book;
    listCursor_ = static_cast<size_t>(book_.chapterIdx());
  }
  if (opened || bookId == book_.id()) repaginate();
  if (screen_ == Screen::Idle && (place_ == Place::Book || place_ == Place::Shelf || place_ == Place::Reading)) draw();
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
  for (Place p : { Place::Activities, Place::Todos, Place::Plan, Place::Habits, Place::Vigil }) places.push_back(p);
  // Always offered, empty or not: a menu that hides the library until a sync
  // has been through is a menu with a missing item as far as anyone holding
  // the device is concerned.
  places.push_back(Place::Shelf);
  for (Place p : { Place::Quotes, Place::Settings }) places.push_back(p);
  return places;
}

// The chapter, cut into pages the way this look sets them. Called whenever
// the look, the text size, the chapter or the book itself changes.
void SessionMachine::repaginate() {
  const std::string& body = book_.body(book_.chapterIdx());
  pageStarts_ = body.empty() ? std::vector<int>{ 0 } : readerPages(look(look_), body, largeText_);
  // Back to where the reading was, as a thousandth of the chapter.
  const int at = static_cast<int>((static_cast<long>(book_.through()) * body.size()) / 1000);
  page_ = 0;
  for (size_t i = 0; i < pageStarts_.size(); ++i) {
    if (pageStarts_[i] <= at) page_ = i;
  }
}

void SessionMachine::bookChanged() {
  repaginate();
  if (screen_ == Screen::Idle && (place_ == Place::Reading || place_ == Place::Book)) draw();
}

std::string SessionMachine::pageText() const {
  const std::string& body = book_.body(book_.chapterIdx());
  if (body.empty() || pageStarts_.empty()) return "";
  const size_t from = static_cast<size_t>(pageStarts_[std::min(page_, pageStarts_.size() - 1)]);
  const size_t to = page_ + 1 < pageStarts_.size() ? static_cast<size_t>(pageStarts_[page_ + 1]) : body.size();
  return body.substr(from, to - from);
}

// Turning a page, and turning the last page of a chapter into the next one.
void SessionMachine::turn(int pages) {
  const int here = static_cast<int>(page_) + pages;
  if (here >= 0 && here < static_cast<int>(pageStarts_.size())) {
    page_ = static_cast<size_t>(here);
  } else if (here < 0) {
    if (book_.chapterIdx() == 0) return;
    book_.goTo(book_.chapterIdx() - 1, 1000);
    if (!book_.holds(book_.chapterIdx())) { book_.goTo(book_.chapterIdx() + 1, 0); return; }
    repaginate();
    page_ = pageStarts_.empty() ? 0 : pageStarts_.size() - 1;
  } else {
    const int next = book_.chapterIdx() + 1;
    if (next >= static_cast<int>(book_.chapters().size())) return;
    if (!book_.holds(next)) { syncRequested_ = true; return; }
    book_.goTo(next, 0);
    repaginate();
    page_ = 0;
  }
  // Where the reading is now, kept for the console and the next sync.
  const std::string& body = book_.body(book_.chapterIdx());
  const int start = pageStarts_.empty() ? 0 : pageStarts_[std::min(page_, pageStarts_.size() - 1)];
  book_.goTo(book_.chapterIdx(), body.empty() ? 0 : static_cast<int>((static_cast<long>(start) * 1000) / body.size()));
  book_.save();
  draw();
}

// SUN turns the page, holding SUN turns it back, POWER keeps it, holding
// POWER goes back to the menu (see handle()).
void SessionMachine::read(Input input) {
  if (input == Input::SunShort) { turn(1); return; }
  if (input == Input::SunLong || input == Input::SunDouble) { turn(-1); return; }
  if (input != Input::PowerShort) return;
  // Keeping the page: the passage is whatever is on the glass.
  const std::string text = pageText();
  if (text.empty()) return;
  const int start = pageStarts_.empty() ? 0 : pageStarts_[std::min(page_, pageStarts_.size() - 1)];
  book_.mark(book_.chapterIdx(), start, start + static_cast<int>(text.size()), text);
  draw();
}

void SessionMachine::enter(Place place) {
  place_ = place;
  listCursor_ = 0;
  quotePage_ = 0;
  if (place == Place::Book) {
    listCursor_ = static_cast<size_t>(book_.chapterIdx());
    repaginate();
  }
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
          case Place::Shelf: vm.items.push_back("READ"); break;
          case Place::Vigil: vm.items.push_back("VIGIL"); break;
          case Place::Plan: vm.items.push_back("WIRING"); break;
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
    case Place::Plan: {
      const uint64_t now = clock_.nowEpochSeconds();
      vm.title = "WIRING";
      vm.taps = daily_.plan();
      vm.now = daily_.minuteOfDay(now);
      planDrawn_ = now / PLAN_REDRAW_SECONDS;
      break;
    }
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
    case Place::Shelf: {
      vm.title = "THE LIBRARY";
      vm.items.clear();
      vm.values.clear();
      vm.checks.clear();
      if (book_.shelf().empty()) {
        vm.items.push_back("NOTHING ON IT YET");
        vm.values.push_back("");
        vm.checks.push_back(false);
      }
      for (const ShelfBook& b : book_.shelf()) {
        vm.items.push_back(b.title);
        // How far through it is, as a hundredth, beside its name.
        const int through = b.chapters > 0
          ? ((b.chapterIdx * 1000 + b.through) * 100) / (b.chapters * 1000)
          : 0;
        // One still to come onto the card says so; he copies it when opened.
        vm.values.push_back(book_.waiting() && b.id == book_.wanted() ? "COPYING"
                            : !book_.whole(b.id) ? "AWAY"
                            : through > 0 ? std::to_string(through) + "%" : "NEW");
        vm.checks.push_back(b.id == book_.id());
      }
      vm.cursor = static_cast<int>(vm.items.empty() ? 0 : listCursor_ % vm.items.size());
      break;
    }
    case Place::Book: {
      vm.title = book_.title();
      vm.book = book_.title();
      vm.items = book_.chapters();
      vm.cursor = static_cast<int>(listCursor_ % std::max<size_t>(1, vm.items.size()));
      // The chapter being read is ticked; one not yet on the card is not.
      vm.checks.assign(vm.items.size(), false);
      for (size_t i = 0; i < vm.items.size(); ++i) vm.checks[i] = book_.holds(static_cast<int>(i));
      break;
    }
    case Place::Reading: {
      vm.book = book_.title();
      vm.title = book_.title();
      const int idx = book_.chapterIdx();
      vm.chapter = idx < static_cast<int>(book_.chapters().size()) ? book_.chapters()[idx] : "";
      vm.passage = pageText();
      vm.page = static_cast<int>(page_);
      vm.pages = static_cast<int>(pageStarts_.size());
      const int start = pageStarts_.empty() ? 0 : pageStarts_[std::min(page_, pageStarts_.size() - 1)];
      vm.kept = book_.marked(idx, start);
      break;
    }
    case Place::Transcribe: {
      vm.title = "TRANSCRIBING";
      for (const ShelfBook& b : book_.shelf()) {
        if (b.id == book_.wanted()) vm.book = b.title;
      }
      vm.copied = copied_;
      vm.toCopy = toCopy_;
      // Only a sync that failed has anything to say here.
      if (syncNote_ == "NO WIFI" || syncNote_ == "SERVER ERROR") vm.note = syncNote_;
      break;
    }
    case Place::Settings: {
      std::string skin = skin_;
      for (auto& c : skin) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
      vm.title = "SETTINGS";
      vm.items = { "TEXT", "LOOK", "SKIN", "SYNC" };
      vm.values = { largeText_ ? "LARGE" : "SMALL", look(look_).name(), skin, syncNote_ };
      vm.cursor = static_cast<int>(listCursor_);
      break;
    }
    case Place::Vigil: {
      const auto& ps = daily_.vigil();
      vm.items.clear();
      vm.values.clear();
      const auto length = [](int m) { return m ? std::to_string(m) + " MIN" : std::string("OPEN"); };
      if (ps.empty()) {
        // Its practices come with the first sync.
        vm.title = "VIGIL";
        vm.items.push_back("SYNC FIRST");
        vm.values.push_back("");
        vm.cursor = 0;
      } else if (!choosingLength_) {
        vm.title = "VIGIL";
        for (const auto& p : ps) { vm.items.push_back(p.name); vm.values.push_back(length(sitLength(p))); }
        vm.cursor = static_cast<int>(vigilCursor_ % ps.size());
      } else {
        vm.title = ps[vigilCursor_ % ps.size()].name;
        for (int m : SIT_LENGTHS) vm.items.push_back(length(m));
        vm.cursor = static_cast<int>(lengthCursor_);
      }
      break;
    }
    case Place::Activities:
      break;
  }
  vm.sit = sit_;
  if (sit_ && screen_ == Screen::Running) {
    const uint64_t now = clock_.nowEpochSeconds();
    vm.left = sitMinutes_ ? leftInFives(now) : -1;
    if (sitPacer_ != Pacer::None) {
      // The breath, sampled once a second. Resonance: five seconds in, five
      // out. Cyclic sighing: two inhales, the second topping up the first,
      // then one long exhale.
      const uint64_t t = now - startedAt_;
      if (sitPacer_ == Pacer::Resonance) {
        const int p = static_cast<int>(t % 10);
        vm.breath = (p < 5 ? p : 10 - p) * 20;
        vm.cue = p < 5 ? "in" : "out";
      } else {
        static const int SIGH[] = { 0, 35, 70, 100, 80, 60, 40, 20 };
        const int p = static_cast<int>(t % 8);
        vm.breath = SIGH[p];
        vm.cue = p < 3 ? "in" : "out";
      }
    }
  }
  vm.largeText = largeText_;
  vm.look = look_;
  // Running never carries elapsed time. Design decision, not an omission.
  vm.minutes = (screen_ == Screen::Stopped) ? minutes : 0;
  renderer_.render(vm);
}

// The Vigil. SUN walks the practices, POWER picks one; then SUN walks the
// lengths and POWER sits. Holding SUN goes back a step.
void SessionMachine::vigil(Input input) {
  const auto& ps = daily_.vigil();
  if (ps.empty()) {
    if (input == Input::SunLong || input == Input::PowerShort) { place_ = Place::Menu; draw(); }
    return;
  }
  const size_t n = ps.size(), lengths = sizeof(SIT_LENGTHS) / sizeof(SIT_LENGTHS[0]);
  if (!choosingLength_) {
    if (input == Input::SunShort) { vigilCursor_ = (vigilCursor_ + 1) % n; draw(); }
    else if (input == Input::SunDouble) { vigilCursor_ = (vigilCursor_ + 2 * n - 2) % n; draw(); }
    else if (input == Input::SunLong) { place_ = Place::Menu; draw(); }
    else if (input == Input::PowerShort) {
      const int want = sitLength(ps[vigilCursor_ % n]);
      lengthCursor_ = 0;
      for (size_t i = 0; i < lengths; ++i) if (SIT_LENGTHS[i] == want) lengthCursor_ = i;
      choosingLength_ = true;
      draw();
    }
    return;
  }
  if (input == Input::SunShort) { lengthCursor_ = (lengthCursor_ + 1) % lengths; draw(); }
  else if (input == Input::SunDouble) { lengthCursor_ = (lengthCursor_ + 2 * lengths - 2) % lengths; draw(); }
  else if (input == Input::SunLong) { choosingLength_ = false; draw(); }
  else if (input == Input::PowerShort) startSit();
}

int SessionMachine::sitLength(const VigilPractice& p) const {
  const auto it = lengths_.find(p.id);
  return it == lengths_.end() ? p.minutes : it->second;
}

void SessionMachine::startSit() {
  const auto& ps = daily_.vigil();
  const VigilPractice p = ps[vigilCursor_ % ps.size()];
  const int minutes = SIT_LENGTHS[lengthCursor_];
  // The length chosen is remembered for next time, for this practice alone.
  lengths_[p.id] = minutes;
  std::string lines;
  for (const auto& [id, m] : lengths_) lines += std::to_string(id) + " " + std::to_string(m) + "\n";
  storage_.write(SITS, lines);
  sit_ = true;
  sitMinutes_ = minutes;
  sitBell_ = p.bell;
  sitPacer_ = p.pacer;
  lastBell_ = 0;
  startSession(p.id);
  if (screen_ != Screen::Running) { sit_ = false; return; }
  choosingLength_ = false;
  shownLeft_ = sitMinutes_ ? leftInFives(startedAt_) : -1;
  chime("open");
}

// The minutes left, rounded up to the next five: 20, then 15, then 10.
int SessionMachine::leftInFives(uint64_t now) const {
  const uint64_t total = static_cast<uint64_t>(sitMinutes_) * 60, gone = now - startedAt_;
  if (gone >= total) return 0;
  const uint64_t left = total - gone;
  return static_cast<int>((left + 299) / 300) * 5;
}

// Once a second while sitting. The glass changes only when the minutes left
// pass a five, or with the breath for the two breathing practices.
void SessionMachine::sitTick(uint64_t now) {
  if (sitMinutes_ && now - startedAt_ >= static_cast<uint64_t>(sitMinutes_) * 60) {
    stopSession();
    // Rung once it is kept: a sit that could not be saved yet keeps sitting.
    if (screen_ == Screen::Stopped) chime("close");
    return;
  }
  const int minute = static_cast<int>((now - startedAt_) / 60);
  if (sitBell_ && minute > 0 && minute % sitBell_ == 0 && minute != lastBell_) { lastBell_ = minute; chime("bell"); }
  const int left = sitMinutes_ ? leftInFives(now) : -1;
  if (sitPacer_ != Pacer::None || left != shownLeft_) { shownLeft_ = left; draw(); }
}
