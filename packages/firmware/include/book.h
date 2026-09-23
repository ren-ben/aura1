#pragma once
#include <string>
#include <vector>
#include "ports.h"

// The book on the card. The web takes an epub or a pdf apart and sends plain
// text; the device is given the chapter it is on and the one after it, so the
// end of a chapter is never a wall between syncs.
//
// Where the reading is, is kept as a thousandth of the chapter. The console
// scrolls and the glass turns pages, and neither has to know the other's
// idea of a page.
struct BookMark {
  int chapterIdx = 0;
  int start = 0;
  int end = 0;
  std::string body;
};

class Book {
public:
  explicit Book(Storage& storage) : storage_(storage) {}

  // What is on the card, from a previous sync.
  void begin();
  // A book from a sync: its chapters kept, its place taken only when it is a
  // different book, so reading on the glass is not undone by a sync.
  void accept(const std::string& json);

  bool has() const { return id_ > 0 && !titles_.empty(); }
  int id() const { return id_; }
  const std::string& title() const { return title_; }
  const std::string& author() const { return author_; }
  const std::vector<std::string>& chapters() const { return titles_; }
  int chapterIdx() const { return chapter_; }
  int through() const { return through_; }
  // Empty when that chapter has not reached the card yet.
  const std::string& body(int idx) const;
  bool holds(int idx) const { return !body(idx).empty(); }

  void goTo(int chapterIdx, int through);
  // Where the reading is, as a fraction of the chapter, saved to the card.
  void save();

  void mark(int chapterIdx, int start, int end, const std::string& body);
  bool marked(int chapterIdx, int start) const;
  const std::vector<BookMark>& marks() const { return marks_; }
  void clearMarks();

private:
  void write();

  static constexpr const char* FILE = "/book.txt";     // the book and its place
  static constexpr const char* MARKS = "/marks.txt";   // what was kept, until synced

  Storage& storage_;
  int id_ = 0;
  std::string title_, author_;
  std::vector<std::string> titles_;
  // Only the chapters the device holds: their index and their text.
  std::vector<std::pair<int, std::string>> parts_;
  int chapter_ = 0;
  int through_ = 0;
  std::vector<BookMark> marks_;
};
