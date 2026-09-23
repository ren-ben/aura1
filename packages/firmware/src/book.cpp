#include "book.h"
#include <ArduinoJson.h>
#include <sstream>
#include "ports.h"

namespace {

const std::string NOTHING;

std::string join(const std::vector<std::string>& lines) {
  std::string out;
  for (size_t i = 0; i < lines.size(); ++i) {
    if (i) out += '\n';
    out += lines[i];
  }
  return out;
}

std::string partPath(int idx) { return "/bk" + std::to_string(idx) + ".txt"; }

}  // namespace

void Book::begin() {
  // "<id> <chapter> <through>", the title, the author, then a chapter a line.
  const auto lines = storage_.readLines(FILE);
  if (lines.size() < 3) return;
  std::istringstream head(lines[0]);
  if (!(head >> id_ >> chapter_ >> through_)) { id_ = 0; return; }
  title_ = lines[1];
  author_ = lines[2];
  titles_.assign(lines.begin() + 3, lines.end());

  // Whichever chapters are still on the card.
  for (size_t idx = 0; idx < titles_.size(); ++idx) {
    const std::string path = partPath(static_cast<int>(idx));
    if (!storage_.exists(path)) continue;
    parts_.emplace_back(static_cast<int>(idx), join(storage_.readLines(path)));
  }

  for (const auto& line : storage_.readLines(MARKS)) {
    // "<chapter> <start> <end> <text>"
    std::istringstream in(line);
    BookMark m;
    if (!(in >> m.chapterIdx >> m.start >> m.end)) continue;
    std::getline(in, m.body);
    if (!m.body.empty() && m.body[0] == ' ') m.body.erase(0, 1);
    marks_.push_back(m);
  }
}

void Book::accept(const std::string& json) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc.is<JsonObjectConst>()) return;
  const int id = doc["id"] | 0;
  if (id <= 0) return;

  std::vector<std::string> titles;
  for (JsonVariantConst t : doc["chapters"].as<JsonArrayConst>()) titles.push_back(t.as<std::string>());
  if (titles.empty()) return;

  // A different book starts where the server says; the one being read keeps
  // its place, which is ahead of whatever the server last heard.
  const bool same = id == id_;
  id_ = id;
  title_ = doc["title"] | "";
  author_ = doc["author"] | "";
  titles_ = std::move(titles);
  if (!same) {
    chapter_ = doc["chapterIdx"] | 0;
    through_ = doc["through"] | 0;
    parts_.clear();
    marks_.clear();
    storage_.remove(MARKS);
  }

  for (JsonObjectConst part : doc["parts"].as<JsonArrayConst>()) {
    const int idx = part["idx"] | -1;
    const std::string body = part["body"] | "";
    if (idx < 0 || body.empty()) continue;
    storage_.write(partPath(idx), body);
    bool held = false;
    for (auto& have : parts_) {
      if (have.first != idx) continue;
      have.second = body;
      held = true;
    }
    if (!held) parts_.emplace_back(idx, body);
  }
  // Only the chapters near the reading are worth the card's space.
  for (auto it = parts_.begin(); it != parts_.end();) {
    if (it->first < chapter_ - 1 || it->first > chapter_ + 2) {
      storage_.remove(partPath(it->first));
      it = parts_.erase(it);
    } else {
      ++it;
    }
  }
  write();
}

const std::string& Book::body(int idx) const {
  for (const auto& part : parts_) {
    if (part.first == idx) return part.second;
  }
  return NOTHING;
}

void Book::goTo(int chapterIdx, int through) {
  if (titles_.empty()) return;
  chapter_ = std::max(0, std::min(chapterIdx, static_cast<int>(titles_.size()) - 1));
  through_ = std::max(0, std::min(through, 1000));
}

void Book::save() { write(); }

void Book::write() {
  if (id_ <= 0) return;
  std::string out = std::to_string(id_) + " " + std::to_string(chapter_) + " " + std::to_string(through_) + "\n";
  out += title_ + "\n" + author_ + "\n";
  for (const auto& t : titles_) out += t + "\n";
  storage_.write(FILE, out);
}

void Book::mark(int chapterIdx, int start, int end, const std::string& body) {
  if (marked(chapterIdx, start)) return;
  // One line on the card: the text cannot carry a newline into it.
  std::string flat = body.substr(0, 400);
  for (char& c : flat) {
    if (c == '\n' || c == '\r') c = ' ';
  }
  marks_.push_back({ chapterIdx, start, end, flat });
  storage_.append(MARKS, std::to_string(chapterIdx) + " " + std::to_string(start) + " "
                           + std::to_string(end) + " " + flat);
}

bool Book::marked(int chapterIdx, int start) const {
  for (const auto& m : marks_) {
    if (m.chapterIdx == chapterIdx && m.start == start) return true;
  }
  return false;
}

void Book::clearMarks() {
  marks_.clear();
  storage_.remove(MARKS);
}
