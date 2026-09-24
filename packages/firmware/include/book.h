#pragma once
#include <string>
#include <vector>
#include "ports.h"
#include "sync_codec.h"

// The books on the card. The web takes an epub or a pdf apart into chapters
// of plain text; the device fetches every book whole and keeps it, so turning
// a chapter or changing books never waits on a hotspot. Only where the
// reading is, and what was kept, travel with the sync.
//
// Where the reading is, is kept as a thousandth of the chapter. The console
// scrolls and the glass turns pages, and neither has to know the other's
// idea of a page.
//
// On the card, under /books/<id>/:
//   head.txt   "<chapters> <chapterIdx> <through>", the title, the author,
//              then a chapter's name a line, as the server sends it
//   <idx>.txt  a chapter's text
//   done       every chapter has arrived
//   place.txt  "<chapterIdx> <through>": where the reading is on the device
//   marks.txt  what was kept and not yet synced, "<chapter> <start> <end> <text>"
// /open.txt holds the open book's id, /dirty.txt the books read since the
// last sync, one id a line.

// One book as the shelf lists it: enough to show it and to fetch it.
struct ShelfBook {
  int id = 0;
  std::string title;
  std::string author;
  int chapters = 0;
  int chapterIdx = 0;
  int through = 0;
};

struct BookMark {
  int chapterIdx = 0;
  int start = 0;
  int end = 0;
  std::string body;
};

// A book still to be fetched onto the card, and how many chapters it has.
struct Fetch {
  int id = 0;
  int chapters = 0;
};

class Book {
public:
  explicit Book(Storage& storage) : storage_(storage) {}

  // The book that was open, where it was, and the shelf, from the card.
  void begin();
  // The shelf from a sync. A book not read here since the last sync takes
  // the place it was left at on the web; true when that moved the open one.
  bool shelve(const std::string& json);
  const std::vector<ShelfBook>& shelf() const { return shelf_; }
  // Every chapter of it is on the card.
  bool whole(int bookId);

  // Opening one from the shelf: true when it is on the card and open now,
  // false when it is still to come and is waited for.
  bool open(int bookId);
  bool waiting() const { return wanted_ > 0; }
  int wanted() const { return wanted_; }
  // What is still to be fetched: the book waited for first, then the open
  // one, then the rest of the shelf in its order.
  std::vector<Fetch> toFetch();
  // A book has arrived whole. The one waited for opens: true when it did.
  bool arrived(int bookId);
  // A chapter of the open book arrived: it can be turned to now.
  void refresh();

  bool has() const { return id_ > 0 && !titles_.empty(); }
  int id() const { return id_; }
  const std::string& title() const { return title_; }
  const std::string& author() const { return author_; }
  const std::vector<std::string>& chapters() const { return titles_; }
  int chapterIdx() const { return chapter_; }
  int through() const { return through_; }
  // Read from the card when it is asked for, one chapter held at a time.
  // Empty when that chapter has not reached the card.
  const std::string& body(int idx) const;
  bool holds(int idx) const;

  void goTo(int chapterIdx, int through);
  // Where the reading is, saved to the card, to go with the next sync.
  void save();

  void mark(int chapterIdx, int start, int end, const std::string& body);
  bool marked(int chapterIdx, int start) const;
  const std::vector<BookMark>& marks() const { return marks_; }

  // For the sync: every book read here since the last one, where it got to,
  // and what was kept in it.
  std::vector<ReadingState> readings();
  // The sync took them: the server has the places and the passages now.
  void synced();

  static std::string dir(int bookId) { return "/books/" + std::to_string(bookId); }
  static std::string headPath(int bookId) { return dir(bookId) + "/head.txt"; }
  static std::string partPath(int bookId, int idx) { return dir(bookId) + "/" + std::to_string(idx) + ".txt"; }
  static std::string donePath(int bookId) { return dir(bookId) + "/done"; }

private:
  static std::string placePath(int bookId) { return dir(bookId) + "/place.txt"; }
  static std::string marksPath(int bookId) { return dir(bookId) + "/marks.txt"; }
  // A book on the card, its place and its marks, taken up as the open one.
  bool load(int bookId);
  void touch(int bookId);  // read since the last sync

  static constexpr const char* OPEN = "/open.txt";
  static constexpr const char* DIRTY = "/dirty.txt";
  static constexpr const char* SHELF = "/shelf.txt";

  Storage& storage_;
  int id_ = 0;
  std::string title_, author_;
  std::vector<std::string> titles_;
  std::vector<bool> held_;       // which chapters are on the card
  int chapter_ = 0;
  int through_ = 0;
  std::vector<BookMark> marks_;
  std::vector<ShelfBook> shelf_;
  std::vector<int> dirty_;
  int wanted_ = 0;               // a book opened and not yet on the card
  mutable int cached_ = -1;      // the chapter whose text is in memory
  mutable std::string text_;
};
