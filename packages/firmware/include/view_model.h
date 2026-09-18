#pragma once
#include <string>

enum class Screen { Idle, Running, Stopped, Syncing };

struct ViewModel {
  Screen screen = Screen::Idle;
  std::string folder;
  std::string activity;
  int cursor = 0;
  int count = 0;
  int folderIndex = 0;
  int folderCount = 0;
  int minutes = 0;
};
