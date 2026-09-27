#pragma once
#include <string>
#include <vector>

enum class Screen { Waking, Idle, Running, Stopped, Dormant, Celebrate, Screensaver };

// Where the user is while browsing: the menu, or one of its places.
enum class Place { Menu, Activities, Todos, Habits, Quotes, Settings, Resurrect, Shelf, Book, Reading, Transcribe, Vigil, Plan, Hunt };

// A block of today's rewiring: minutes after local midnight, its name, and
// its grey (0 lightest on the web, drawn densest here).
struct Tap { int start = 0; int end = 0; std::string title; int shade = 1; int activityId = 0; };

// The Hunt at the gym: which step of an exercise is on the glass.
enum class HuntStage { List, Set, Adjust, Rest, Feel };
struct HuntView {
  HuntStage stage = HuntStage::List;
  std::string exercise;   // its name
  std::string pose;       // the art pack's "hunt-<pose>"
  int set = 0, of = 0;    // this set, one-based, of the prescription's
  std::string target;     // "100 x 8", or "16 REPS"
  std::string last;       // the last visit, "100x9 90x12"
  std::string field;      // adjusting: "REPS" or "KG"
  std::string value;      // adjusting: the value under the cursor
  int rest = -1;          // seconds of rest left, in fifteens
  std::string line;       // the verdict's line, on the list before a hunt
};

struct ViewModel {
  Screen screen = Screen::Idle;
  std::string title;               // "FOLDERS" or the open folder's name
  std::vector<std::string> items;  // the current list
  int cursor = 0;
  bool top = true;                 // on the folder list
  std::string folder;
  std::string activity;
  int minutes = 0;
  Place place = Place::Activities;
  std::vector<bool> checks;        // ticked items, for the todo and habit lists
  std::vector<std::string> values; // the settings' current values, beside items
  // Each habit's last days, oldest first, '1' where it was done: its graph.
  std::vector<std::string> history;
  int gear = -1;                   // the menu item drawn as the settings gear
  int look = 0;                    // the look setting: how every page is drawn
  std::string quote;
  std::string source;
  int quotePage = 0;               // which page of a long quote
  bool largeText = false;          // the text size setting, for quotes
  std::string moment;              // the art pack scene for Waking, Celebrate, Screensaver
  std::string skin;                // what he wears: the art pack prefers that skin's scenes
  int started = -1;                // a running session's start, minutes after local midnight
  // The book, while one is being read.
  std::string book;                // its title
  std::string chapter;             // the chapter's title
  std::string passage;             // the page's text, wrapped by the look
  int page = 0;                    // which page of the chapter
  int pages = 1;
  bool kept = false;               // this page is one he was told to keep
  // A book coming onto the card: how many of its chapters are there so far,
  // and a word when the copying has stopped.
  int copied = 0;
  int toCopy = 0;
  std::string note;
  // A sit of the Vigil, while it runs and when it is kept.
  bool sit = false;
  int left = -1;       // minutes left, in fives; -1 for an open sit
  int breath = -1;     // the pacer's swell, 0 to 100; -1 without one
  std::string cue;     // the pacer's word: "in", "out"
  // The rewiring: today's taps, and the minute of the day it is now.
  std::vector<Tap> taps;
  int now = 0;
  HuntView hunt;
};
