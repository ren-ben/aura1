#include "book.h"
#include <algorithm>
#include <ArduinoJson.h>
#include <sstream>

namespace {

const std::string NOTHING;

// "<chapterIdx> <through>"; false when the card has nothing readable.
bool readPlace(Storage& storage, const std::string& path, int& chapter, int& through) {
  const auto lines = storage.readLines(path);
  if (lines.empty()) return false;
  std::istringstream in(lines[0]);
  return static_cast<bool>(in >> chapter >> through);
}

bool parseMark(const std::string& line, BookMark& m) {
  std::istringstream in(line);
  if (!(in >> m.chapterIdx >> m.start >> m.end)) return false;
  std::getline(in, m.body);
  if (!m.body.empty() && m.body[0] == ' ') m.body.erase(0, 1);
  return true;
}

}  // namespace

void Book::begin() {
  for (const auto& line : storage_.readLines(SHELF)) {
    std::istringstream in(line);
    ShelfBook book;
    if (!(in >> book.id >> book.chapters >> book.chapterIdx >> book.through)) continue;
    std::getline(in, book.title);
    if (!book.title.empty() && book.title[0] == ' ') book.title.erase(0, 1);
    shelf_.push_back(book);
  }
  for (const auto& line : storage_.readLines(DIRTY)) {
    const int id = std::atoi(line.c_str());
    if (id > 0 && std::find(dirty_.begin(), dirty_.end(), id) == dirty_.end()) dirty_.push_back(id);
  }
  const auto open = storage_.readLines(OPEN);
  if (!open.empty()) load(std::atoi(open[0].c_str()));
}

bool Book::load(int bookId) {
  const auto head = storage_.readLines(headPath(bookId));
  if (bookId <= 0 || head.size() < 3) return false;
  int count = 0, chapter = 0, through = 0;
  std::istringstream first(head[0]);
  if (!(first >> count >> chapter >> through)) return false;

  id_ = bookId;
  title_ = head[1];
  author_ = head[2];
  titles_.assign(head.begin() + 3, head.end());
  titles_.resize(static_cast<size_t>(std::max(0, count)), "-");
  // The place kept here outranks the one the book arrived with.
  readPlace(storage_, placePath(bookId), chapter, through);
  chapter_ = std::max(0, std::min(chapter, static_cast<int>(titles_.size()) - 1));
  through_ = std::max(0, std::min(through, 1000));
  marks_.clear();
  for (const auto& line : storage_.readLines(marksPath(bookId))) {
    BookMark m;
    if (parseMark(line, m)) marks_.push_back(m);
  }
  cached_ = -1;
  text_.clear();
  refresh();
  return true;
}

void Book::refresh() {
  held_.assign(titles_.size(), false);
  for (size_t idx = 0; idx < titles_.size(); ++idx) held_[idx] = storage_.exists(partPath(id_, static_cast<int>(idx)));
  cached_ = -1;
}

bool Book::shelve(const std::string& json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonArrayConst>()) return false;
  shelf_.clear();
  std::string out;
  bool moved = false;
  for (JsonObjectConst b : doc.as<JsonArrayConst>()) {
    ShelfBook book{
      b["id"] | 0, b["title"] | "", b["author"] | "",
      b["chapters"] | 0, b["chapterIdx"] | 0, b["through"] | 0,
    };
    if (book.id <= 0) continue;
    // One line a book: the title is last, since it is the only one that can
    // hold spaces worth keeping.
    out += std::to_string(book.id) + " " + std::to_string(book.chapters) + " "
         + std::to_string(book.chapterIdx) + " " + std::to_string(book.through) + " " + book.title + "\n";
    // Read on the web since, and not here: the web's place is the newer one.
    const bool readHere = std::find(dirty_.begin(), dirty_.end(), book.id) != dirty_.end();
    if (!readHere && storage_.exists(headPath(book.id))) {
      int chapter = -1, through = -1;
      readPlace(storage_, placePath(book.id), chapter, through);
      if (book.id == id_) { chapter = chapter_; through = through_; }
      if (chapter != book.chapterIdx || through != book.through) {
        storage_.write(placePath(book.id), std::to_string(book.chapterIdx) + " " + std::to_string(book.through) + "\n");
        if (book.id == id_) {
          goTo(book.chapterIdx, book.through);
          moved = true;
        }
      }
    }
    shelf_.push_back(std::move(book));
  }
  storage_.write(SHELF, out);
  return moved;
}

bool Book::whole(int bookId) { return bookId > 0 && storage_.exists(donePath(bookId)); }

bool Book::open(int bookId) {
  if (bookId == id_ && has()) { wanted_ = 0; return true; }
  if (!whole(bookId) || !load(bookId)) { wanted_ = bookId; return false; }
  wanted_ = 0;
  storage_.write(OPEN, std::to_string(bookId) + "\n");
  return true;
}

std::vector<Fetch> Book::toFetch() {
  std::vector<Fetch> out;
  const auto add = [&](int bookId) {
    if (bookId <= 0 || whole(bookId)) return;
    for (const auto& f : out) {
      if (f.id == bookId) return;
    }
    int chapters = bookId == id_ ? static_cast<int>(titles_.size()) : 0;
    for (const auto& b : shelf_) {
      if (b.id == bookId) chapters = b.chapters;
    }
    out.push_back({ bookId, chapters });
  };
  add(wanted_);
  add(id_);
  for (const auto& b : shelf_) add(b.id);
  return out;
}

bool Book::arrived(int bookId) {
  if (bookId == wanted_) return open(bookId);
  if (bookId == id_) refresh();
  return false;
}

const std::string& Book::body(int idx) const {
  if (!holds(idx)) return NOTHING;
  if (idx != cached_) {
    text_ = storage_.read(partPath(id_, idx));
    // The card may have been written on a PC.
    text_.erase(std::remove(text_.begin(), text_.end(), '\r'), text_.end());
    cached_ = idx;
  }
  return text_;
}

bool Book::holds(int idx) const {
  return idx >= 0 && idx < static_cast<int>(held_.size()) && held_[static_cast<size_t>(idx)];
}

void Book::goTo(int chapterIdx, int through) {
  if (titles_.empty()) return;
  chapter_ = std::max(0, std::min(chapterIdx, static_cast<int>(titles_.size()) - 1));
  through_ = std::max(0, std::min(through, 1000));
}

void Book::save() {
  if (!has()) return;
  storage_.write(placePath(id_), std::to_string(chapter_) + " " + std::to_string(through_) + "\n");
  touch(id_);
}

void Book::touch(int bookId) {
  if (std::find(dirty_.begin(), dirty_.end(), bookId) != dirty_.end()) return;
  dirty_.push_back(bookId);
  storage_.append(DIRTY, std::to_string(bookId));
}

void Book::mark(int chapterIdx, int start, int end, const std::string& body) {
  if (!has() || marked(chapterIdx, start)) return;
  // One line on the card: the text cannot carry a newline into it.
  std::string flat = body.substr(0, 400);
  for (char& c : flat) {
    if (c == '\n' || c == '\r') c = ' ';
  }
  marks_.push_back({ chapterIdx, start, end, flat });
  storage_.append(marksPath(id_), std::to_string(chapterIdx) + " " + std::to_string(start) + " "
                                    + std::to_string(end) + " " + flat);
  touch(id_);
}

bool Book::marked(int chapterIdx, int start) const {
  for (const auto& m : marks_) {
    if (m.chapterIdx == chapterIdx && m.start == start) return true;
  }
  return false;
}

std::vector<ReadingState> Book::readings() {
  std::vector<ReadingState> out;
  for (const int bookId : dirty_) {
    ReadingState r{ bookId, 0, 0, {} };
    if (bookId == id_) { r.chapterIdx = chapter_; r.through = through_; }
    else if (!readPlace(storage_, placePath(bookId), r.chapterIdx, r.through)) continue;
    r.marks = storage_.readLines(marksPath(bookId));
    out.push_back(std::move(r));
  }
  return out;
}

void Book::synced() {
  for (const int bookId : dirty_) storage_.remove(marksPath(bookId));
  dirty_.clear();
  storage_.remove(DIRTY);
  marks_.clear();
}
