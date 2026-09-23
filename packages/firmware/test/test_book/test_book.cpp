#include <unity.h>
#include <map>
#include <sstream>
#include "book.h"
#include "looks.h"

namespace {

// The card, in memory.
class FakeStorage : public Storage {
public:
  bool append(const std::string& path, const std::string& line) override {
    files[path] += line + "\n";
    return true;
  }
  std::vector<std::string> readLines(const std::string& path) override {
    std::vector<std::string> out;
    const auto it = files.find(path);
    if (it == files.end()) return out;
    std::istringstream in(it->second);
    std::string line;
    while (std::getline(in, line)) out.push_back(line);
    return out;
  }
  bool write(const std::string& path, const std::string& content) override {
    files[path] = content;
    return true;
  }
  bool remove(const std::string& path) override { return files.erase(path) > 0; }
  bool exists(const std::string& path) override { return files.count(path) > 0; }

  std::map<std::string, std::string> files;
};

std::string longText(const char* seed, int times) {
  std::string out;
  for (int i = 0; i < times; ++i) out += seed;
  return out;
}

const std::string FROM_SYNC = R"({
  "id": 7, "title": "The King in Yellow", "author": "Chambers",
  "chapterIdx": 1, "through": 0,
  "chapters": ["The Repairer of Reputations", "The Mask", "In the Court of the Dragon"],
  "parts": [{"idx": 1, "body": "Camilla: You, sir, should unmask.\nStranger: Indeed?"},
            {"idx": 2, "body": "In the Church of St Barnabe."}]
})";

void test_a_book_arrives_and_is_kept() {
  FakeStorage card;
  Book book(card);
  book.accept(FROM_SYNC);

  TEST_ASSERT_TRUE(book.has());
  TEST_ASSERT_EQUAL_INT(7, book.id());
  TEST_ASSERT_EQUAL_STRING("The King in Yellow", book.title().c_str());
  TEST_ASSERT_EQUAL_INT(3, static_cast<int>(book.chapters().size()));
  TEST_ASSERT_EQUAL_INT(1, book.chapterIdx());
  // The chapter it is on, and the next: the one before it never came.
  TEST_ASSERT_TRUE(book.holds(1));
  TEST_ASSERT_TRUE(book.holds(2));
  TEST_ASSERT_FALSE(book.holds(0));

  // And it is still there after the power goes.
  Book again(card);
  again.begin();
  TEST_ASSERT_TRUE(again.has());
  TEST_ASSERT_EQUAL_INT(1, again.chapterIdx());
  TEST_ASSERT_EQUAL_STRING("Chambers", again.author().c_str());
  TEST_ASSERT_TRUE(again.body(1).find("should unmask") != std::string::npos);
}

void test_reading_on_is_not_undone_by_a_sync() {
  FakeStorage card;
  Book book(card);
  book.accept(FROM_SYNC);
  book.goTo(2, 400);
  book.save();

  // The same book again, with the server's older idea of the place.
  book.accept(FROM_SYNC);
  TEST_ASSERT_EQUAL_INT(2, book.chapterIdx());
  TEST_ASSERT_EQUAL_INT(400, book.through());

  // A different book starts where the server says.
  book.accept(R"({"id": 9, "title": "Other", "chapterIdx": 0, "through": 0,
                  "chapters": ["One"], "parts": [{"idx": 0, "body": "Once."}]})");
  TEST_ASSERT_EQUAL_INT(9, book.id());
  TEST_ASSERT_EQUAL_INT(0, book.chapterIdx());
}

void test_a_kept_page_is_kept_once_and_survives() {
  FakeStorage card;
  Book book(card);
  book.accept(FROM_SYNC);
  book.mark(1, 0, 32, "Camilla: You, sir, should unmask.");
  book.mark(1, 0, 32, "Camilla: You, sir, should unmask.");
  TEST_ASSERT_EQUAL_INT(1, static_cast<int>(book.marks().size()));
  TEST_ASSERT_TRUE(book.marked(1, 0));
  TEST_ASSERT_FALSE(book.marked(1, 99));

  Book again(card);
  again.begin();
  TEST_ASSERT_EQUAL_INT(1, static_cast<int>(again.marks().size()));
  TEST_ASSERT_EQUAL_STRING("Camilla: You, sir, should unmask.", again.marks()[0].body.c_str());

  again.clearMarks();
  TEST_ASSERT_EQUAL_INT(0, static_cast<int>(again.marks().size()));
  Book third(card);
  third.begin();
  TEST_ASSERT_EQUAL_INT(0, static_cast<int>(third.marks().size()));
}

void test_a_chapter_is_cut_into_pages_that_meet() {
  const std::string text = longText("Ne raillons pas les fous, leur folie dure plus longtemps que la notre. ", 40);
  for (int i = 0; i < lookCount(); ++i) {
    const auto pages = readerPages(look(i), text, false);
    TEST_ASSERT_TRUE_MESSAGE(pages.size() > 1, look(i).name());
    TEST_ASSERT_EQUAL_INT(0, pages[0]);
    // Every page begins after the one before it, and inside the chapter.
    for (size_t k = 1; k < pages.size(); ++k) {
      TEST_ASSERT_TRUE(pages[k] > pages[k - 1]);
      TEST_ASSERT_TRUE(pages[k] < static_cast<int>(text.size()));
    }
  }
  // Larger text needs more pages of it.
  TEST_ASSERT_TRUE(readerPages(look(0), text, true).size() >= readerPages(look(0), text, false).size());
}

}  // namespace

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_a_book_arrives_and_is_kept);
  RUN_TEST(test_reading_on_is_not_undone_by_a_sync);
  RUN_TEST(test_a_kept_page_is_kept_once_and_survives);
  RUN_TEST(test_a_chapter_is_cut_into_pages_that_meet);
  return UNITY_END();
}
