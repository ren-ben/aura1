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

// Two levels: the folder list, and the activities inside one folder.
enum class Level { Folders, Activities };

class Carousel {
public:
  Carousel() = default;
  Carousel(const Carousel&) = delete;
  Carousel& operator=(const Carousel&) = delete;
  Carousel(Carousel&&) = default;
  Carousel& operator=(Carousel&&) = default;

  // Keeps the current position (matched by id) when it still exists, so a
  // sync that renames things does not throw the user back to the top.
  void load(std::vector<FolderEntry> folders, std::vector<ActivityEntry> activities);
  void next();
  void enter();  // folder list -> that folder's activities
  void up();     // activities -> folder list, cursor stays on the folder
  // Opens the activity's folder with the cursor on it. No-op for an unknown id.
  void openActivity(int activityId);
  Level level() const { return level_; }
  int currentActivityId() const;  // 0 on the folder list
  void fill(ViewModel& vm) const;

private:
  void selectFolder(size_t index);

  std::vector<FolderEntry> folders_;  // only folders that hold activities
  std::vector<ActivityEntry> activities_;
  std::vector<const ActivityEntry*> visible_;  // current folder, most recently used first
  Level level_ = Level::Folders;
  size_t folderIndex_ = 0;
  size_t cursor_ = 0;
};
