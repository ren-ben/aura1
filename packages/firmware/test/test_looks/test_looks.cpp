#include <unity.h>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>
#include "looks.h"

// Every look draws every page without crashing and puts ink on it. With the
// art pack mounted at /art, each page is also written to .pio/looks as a PBM
// for eyes (scripts/looks-sheet.mjs turns them into one sheet).

class FileArt : public ArtSource {
public:
  bool draw(Canvas& c, const std::string& id, int x, int y, uint8_t colour) override {
    const std::string name = id == "cameo" ? "cameo-content" : id;
    const int size = id.rfind("watch", 0) == 0 ? 64 : id == "cameo" ? 72 : 200;
    std::ifstream f("/art/" + name + "-0.bin", std::ios::binary);
    if (!f) return false;
    const std::vector<uint8_t> bits((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    if (bits.size() < static_cast<size_t>((size + 7) / 8 * size)) return false;
    c.bitmap(x, y, bits.data(), size, size, colour);
    return true;
  }
};

static void save(const Canvas& c, const std::string& name) {
  FILE* f = std::fopen((".pio/looks/" + name + ".pbm").c_str(), "wb");
  if (!f) return;
  std::fprintf(f, "P4\n200 200\n");
  std::fwrite(c.bits(), 1, 200 * 200 / 8, f);
  std::fclose(f);
}

static ViewModel base(Place place) {
  ViewModel vm;
  vm.screen = Screen::Idle;
  vm.place = place;
  return vm;
}

static std::vector<std::pair<std::string, ViewModel>> pages() {
  std::vector<std::pair<std::string, ViewModel>> out;
  ViewModel menu = base(Place::Menu);
  menu.items = { "ACTIVITIES", "TODAY 2/4", "HABITS 1/3", "QUOTES", "SETTINGS" };
  menu.gear = 4;
  out.push_back({ "1menu", menu });
  menu.cursor = 4;
  out.push_back({ "2gear", menu });
  ViewModel acts = base(Place::Activities);
  acts.title = "STUDY";
  acts.top = false;
  acts.items = { "Astral Mechanics", "Weaving the Veil", "Deep Gnosis", "Alchemical Code" };
  acts.cursor = 2;
  out.push_back({ "3list", acts });
  ViewModel todos = base(Place::Todos);
  todos.items = { "Read Kant", "Gym", "Ship sync", "Call mom" };
  todos.checks = { true, false, true, false };
  todos.cursor = 1;
  out.push_back({ "4today", todos });
  ViewModel habits = base(Place::Habits);
  habits.items = { "Meditate", "Run", "Journal" };
  habits.checks = { true, false, false };
  std::string h;
  for (int i = 0; i < 84; ++i) h += (i * 7 % 5 < 3 || i > 70) ? '1' : '0';
  habits.history = { h, h, h };
  habits.history[1].back() = '0';
  habits.cursor = 1;
  out.push_back({ "5habits", habits });
  ViewModel settings = base(Place::Settings);
  settings.items = { "TEXT", "LOOK", "SKIN", "SYNC" };
  settings.values = { "SMALL", "CATHEDRAL", "JIJI", "SYNCED" };
  out.push_back({ "6settings", settings });
  ViewModel quote = base(Place::Quotes);
  quote.items.assign(12, "");
  quote.cursor = 2;
  quote.quote = "Talent hits a target no one else can hit. Genius hits a target no one else can see.";
  quote.source = "Schopenhauer";
  out.push_back({ "7quote", quote });
  quote.quote = "The struggle itself toward the heights is enough to fill a man's heart. One must imagine Sisyphus happy, "
                "for he knows the whole extent of his wretched condition, and it is what he thinks of during his descent.";
  quote.source = "Albert Camus";
  out.push_back({ "7quotelong", quote });
  return out;
}

void test_every_look_draws_every_page() {
  FileArt art;
  Status status{ 3, false, Link::Syncing, 70, 3912 };
  for (int l = 0; l < lookCount(); ++l) {
    const Look& look = ::look(l);
    int k = 0;
    for (auto& [name, vm] : pages()) {
      Canvas c;
      vm.look = l;
      Status s = status;
      s.charging = k % 2;
      s.link = k % 3 == 0 ? Link::Syncing : k % 3 == 1 ? Link::Offline : Link::Online;
      std::fprintf(stderr, "%s %s\n", look.name(), name.c_str()); std::fflush(stderr);
      look.page(c, vm, s, art);
      const Corner at = look.corner(vm, false);
      drawCorner(c, at.y, s, at.ink);
      int ink = 0;
      for (int y = 0; y < 200; ++y) for (int x = 0; x < 200; ++x) ink += c.get(x, y);
      TEST_ASSERT_TRUE_MESSAGE(ink > 200, (std::string(look.name()) + " " + name).c_str());
      save(c, std::to_string(l) + "-" + name);
      ++k;
    }
    for (int stopped = 0; stopped < 2; ++stopped) {
      Canvas c;
      ViewModel vm = base(Place::Activities);
      vm.screen = stopped ? Screen::Stopped : Screen::Running;
      vm.minutes = 84;
      if (look.negative()) c.clear(INK);
      art.draw(c, stopped ? "sealed-proud" : "axiom-study", 0, 0, look.negative() ? PAPER : INK);
      look.caption(c, vm, stopped ? "1h 24m" : "Deep Gnosis");
      const Corner at = look.corner(vm, true);
      drawCorner(c, at.y, status, at.ink);
      save(c, std::to_string(l) + (stopped ? "-9sealed" : "-8running"));
    }
  }
}

void test_look_names_round_trip() {
  for (int l = 0; l < lookCount(); ++l) TEST_ASSERT_EQUAL(l, lookIndex(look(l).name()));
  TEST_ASSERT_EQUAL(0, lookIndex("NOPE"));
  TEST_ASSERT_EQUAL_STRING(look(0).name(), look(lookCount()).name());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_every_look_draws_every_page);
  RUN_TEST(test_look_names_round_trip);
  return UNITY_END();
}
