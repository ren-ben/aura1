#pragma once
#include <string>
#include <vector>

enum class Screen { Waking, Idle, Running, Stopped, Dormant, Celebrate, Screensaver };

// Where the user is while browsing: the menu, or one of its places.
enum class Place { Menu, Activities, Todos, Habits, Quotes, Settings, Resurrect };

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
  std::string quote;
  std::string source;
  int quotePage = 0;               // which page of a long quote
  bool largeText = false;          // the text size setting, for quotes
  std::string moment;              // the art pack scene for Waking, Celebrate, Screensaver
};
