#include <unity.h>
#include "book.h"
#include "looks.h"
#include "../fake_storage.h"

namespace {

std::string longText(const char* seed, int times) {
  std::string out;
  for (int i = 0; i < times; ++i) out += seed;
  return out;
}

const char* SHELF = R"([{"id": 7, "title": "The King in Yellow", "author": "Chambers", "chapters": 3, "chapterIdx": 1, "through": 0},
                        {"id": 9, "title": "The Dream-Quest", "author": "Lovecraft", "chapters": 1, "chapterIdx": 0, "through": 0}])";

// What the fetch leaves on the card: the head as the server sends it, every
// chapter, and the mark that it is all there.
void fetched(FakeStorage& card, int id, const std::string& head, const std::vector<std::string>& parts) {
  card.write(Book::headPath(id), head);
  for (size_t i = 0; i < parts.size(); ++i) card.write(Book::partPath(id, static_cast<int>(i)), parts[i]);
  card.write(Book::donePath(id), "");
}

void king(FakeStorage& card) {
  fetched(card, 7, "3 1 0\nThe King in Yellow\nChambers\nThe Repairer of Reputations\nThe Mask\nIn the Court of the Dragon\n",
          { "Ne raillons pas les fous.", "Camilla: You, sir, should unmask.\nStranger: Indeed?", "In the Church of St Barnabe." });
}

void test_a_whole_book_opens_at_once_and_is_kept() {
  FakeStorage card;
  king(card);
  Book book(card);
  book.shelve(SHELF);
  TEST_ASSERT_TRUE(book.whole(7));
  TEST_ASSERT_FALSE(book.whole(9));

  TEST_ASSERT_TRUE(book.open(7));
  TEST_ASSERT_FALSE(book.waiting());
  TEST_ASSERT_EQUAL_STRING("The King in Yellow", book.title().c_str());
  TEST_ASSERT_EQUAL_INT(3, static_cast<int>(book.chapters().size()));
  TEST_ASSERT_EQUAL_INT(1, book.chapterIdx());
  // Every chapter is there, not only the ones near the reading.
  for (int i = 0; i < 3; ++i) TEST_ASSERT_TRUE(book.holds(i));
  TEST_ASSERT_TRUE(book.body(1).find("should unmask") != std::string::npos);
  TEST_ASSERT_TRUE(book.body(2).find("Barnabe") != std::string::npos);

  book.goTo(2, 400);
  book.save();
  // And it is still open, where it was, after the power goes.
  Book again(card);
  again.begin();
  TEST_ASSERT_TRUE(again.has());
  TEST_ASSERT_EQUAL_INT(7, again.id());
  TEST_ASSERT_EQUAL_INT(2, again.chapterIdx());
  TEST_ASSERT_EQUAL_INT(400, again.through());
  TEST_ASSERT_EQUAL_STRING("Chambers", again.author().c_str());
  TEST_ASSERT_EQUAL_INT(2, static_cast<int>(again.shelf().size()));
}

void test_a_book_not_on_the_card_is_waited_for_and_opens_when_it_arrives() {
  FakeStorage card;
  king(card);
  Book book(card);
  book.shelve(SHELF);
  book.open(7);

  TEST_ASSERT_FALSE(book.open(9));
  TEST_ASSERT_TRUE(book.waiting());
  TEST_ASSERT_EQUAL_INT(9, book.wanted());
  // The one being read stays open meanwhile.
  TEST_ASSERT_EQUAL_INT(7, book.id());
  // It is fetched first, with the number of chapters it has.
  const auto plan = book.toFetch();
  TEST_ASSERT_EQUAL_INT(1, static_cast<int>(plan.size()));
  TEST_ASSERT_EQUAL_INT(9, plan[0].id);
  TEST_ASSERT_EQUAL_INT(1, plan[0].chapters);

  fetched(card, 9, "1 0 0\nThe Dream-Quest\nLovecraft\nKadath\n", { "Three times Randolph Carter dreamed." });
  TEST_ASSERT_FALSE(book.arrived(7));
  TEST_ASSERT_TRUE(book.arrived(9));
  TEST_ASSERT_FALSE(book.waiting());
  TEST_ASSERT_EQUAL_INT(9, book.id());
  TEST_ASSERT_TRUE(book.body(0).find("Randolph Carter") != std::string::npos);
  TEST_ASSERT_TRUE(book.toFetch().empty());
}

void test_every_book_read_between_syncs_goes_with_the_next_one() {
  FakeStorage card;
  king(card);
  fetched(card, 9, "1 0 0\nThe Dream-Quest\nLovecraft\nKadath\n", { "Three times Randolph Carter dreamed." });
  Book book(card);
  book.shelve(SHELF);
  TEST_ASSERT_TRUE(book.readings().empty());

  book.open(7);
  book.goTo(2, 300);
  book.save();
  book.mark(2, 0, 28, "In the Church of St Barnabe.");
  book.mark(2, 0, 28, "In the Church of St Barnabe.");
  TEST_ASSERT_EQUAL_INT(1, static_cast<int>(book.marks().size()));
  TEST_ASSERT_TRUE(book.marked(2, 0));
  // Offline, on to the other book.
  book.open(9);
  book.goTo(0, 800);
  book.save();

  // Both survive the power going, and both go.
  Book again(card);
  again.begin();
  auto read = again.readings();
  TEST_ASSERT_EQUAL_INT(2, static_cast<int>(read.size()));
  TEST_ASSERT_EQUAL_INT(7, read[0].bookId);
  TEST_ASSERT_EQUAL_INT(2, read[0].chapterIdx);
  TEST_ASSERT_EQUAL_INT(300, read[0].through);
  TEST_ASSERT_EQUAL_INT(1, static_cast<int>(read[0].marks.size()));
  TEST_ASSERT_EQUAL_INT(9, read[1].bookId);
  TEST_ASSERT_EQUAL_INT(800, read[1].through);

  // Taken: nothing left to send, and the places stay where they were.
  again.synced();
  TEST_ASSERT_TRUE(again.readings().empty());
  TEST_ASSERT_TRUE(again.open(7));
  TEST_ASSERT_EQUAL_INT(300, again.through());
  TEST_ASSERT_EQUAL_INT(0, static_cast<int>(again.marks().size()));
}

void test_a_book_read_on_the_web_meanwhile_takes_the_webs_place() {
  FakeStorage card;
  king(card);
  Book book(card);
  book.shelve(SHELF);
  book.open(7);
  book.goTo(1, 200);
  book.save();

  // Read here since the last sync: the device's place stands.
  TEST_ASSERT_FALSE(book.shelve(R"([{"id": 7, "title": "The King in Yellow", "chapters": 3, "chapterIdx": 0, "through": 900}])"));
  TEST_ASSERT_EQUAL_INT(200, book.through());

  // Synced, then read on the web: the web's place is the newer one.
  book.synced();
  TEST_ASSERT_TRUE(book.shelve(R"([{"id": 7, "title": "The King in Yellow", "chapters": 3, "chapterIdx": 2, "through": 650}])"));
  TEST_ASSERT_EQUAL_INT(2, book.chapterIdx());
  TEST_ASSERT_EQUAL_INT(650, book.through());
  Book again(card);
  again.begin();
  TEST_ASSERT_EQUAL_INT(650, again.through());
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
  RUN_TEST(test_a_whole_book_opens_at_once_and_is_kept);
  RUN_TEST(test_a_book_not_on_the_card_is_waited_for_and_opens_when_it_arrives);
  RUN_TEST(test_every_book_read_between_syncs_goes_with_the_next_one);
  RUN_TEST(test_a_book_read_on_the_web_meanwhile_takes_the_webs_place);
  RUN_TEST(test_a_chapter_is_cut_into_pages_that_meet);
  return UNITY_END();
}
