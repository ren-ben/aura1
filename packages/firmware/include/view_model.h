#pragma once
#include <string>
#include <vector>

enum class Screen { Waking, Idle, Running, Stopped, Dormant, Celebrate, Screensaver };

// Where the user is while browsing: the menu, or one of its places.
enum class Place { Menu, Activities, Todos, Habits, Quotes, Settings, Resurrect, Shelf, Book, Reading, Transcribe, Vigil };

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
};
