#pragma once
#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include "view_model.h"

struct FolderEntry { int id; std::string name; };

struct ActivityEntry {
  int id;
  int folderId;
  std::string name;
  uint64_t lastUsedAt;
};

class Carousel {
public:
  void load(std::vector<FolderEntry> folders, std::vector<ActivityEntry> activities);
  void nextActivity();
  void nextFolder();
  int currentActivityId() const;
  void fill(ViewModel& vm) const;

private:
  void selectFolder(size_t index);

  std::vector<FolderEntry> folders_;
  std::vector<ActivityEntry> activities_;
  std::vector<const ActivityEntry*> visible_;
  size_t folderIndex_ = 0;
  size_t cursor_ = 0;
};
