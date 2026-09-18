#include "carousel.h"
#include <algorithm>

void Carousel::load(std::vector<FolderEntry> folders,
                    std::vector<ActivityEntry> activities) {
  folders_ = std::move(folders);
  activities_ = std::move(activities);
  if (folders_.empty()) return;
  selectFolder(0);
  // A folder with no activities would strand the cursor, so advance past it.
  if (visible_.empty()) nextFolder();
}

void Carousel::selectFolder(size_t index) {
  if (folders_.empty()) return;
  folderIndex_ = index % folders_.size();
  cursor_ = 0;
  visible_.clear();
  const int folderId = folders_[folderIndex_].id;
  for (const auto& activity : activities_) {
    if (activity.folderId == folderId) visible_.push_back(&activity);
  }
  std::sort(visible_.begin(), visible_.end(),
            [](const ActivityEntry* a, const ActivityEntry* b) {
              if (a->lastUsedAt != b->lastUsedAt) return a->lastUsedAt > b->lastUsedAt;
              return a->id < b->id;
            });
}

void Carousel::nextActivity() {
  if (visible_.empty()) return;
  cursor_ = (cursor_ + 1) % visible_.size();
}

void Carousel::nextFolder() {
  if (folders_.empty()) return;
  const size_t start = folderIndex_;
  for (size_t step = 1; step <= folders_.size(); ++step) {
    selectFolder(start + step);
    if (!visible_.empty()) return;
  }
}

int Carousel::currentActivityId() const {
  if (visible_.empty()) return 0;
  return visible_[cursor_]->id;
}

void Carousel::fill(ViewModel& vm) const {
  vm.folderCount = static_cast<int>(folders_.size());
  vm.folderIndex = static_cast<int>(folderIndex_);
  vm.folder = folders_.empty() ? "" : folders_[folderIndex_].name;
  vm.count = static_cast<int>(visible_.size());
  vm.cursor = static_cast<int>(cursor_);
  vm.activity = visible_.empty() ? "" : visible_[cursor_]->name;
}
