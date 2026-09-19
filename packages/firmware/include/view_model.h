#pragma once
#include <string>
#include <vector>

enum class Screen { Waking, Idle, Running, Stopped, Dormant };

struct ViewModel {
  Screen screen = Screen::Idle;
  std::string title;               // "FOLDERS" or the open folder's name
  std::vector<std::string> items;  // the current list
  int cursor = 0;
  bool top = true;                 // on the folder list
  std::string folder;
  std::string activity;
  int minutes = 0;
};
