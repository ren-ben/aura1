#include "carousel.h"
#include <algorithm>

void Carousel::load(std::vector<FolderEntry> folders,
                    std::vector<ActivityEntry> activities) {
  const Level level = level_;
  const int folderId = folders_.empty() ? 0 : folders_[folderIndex_].id;
  const int activityId = currentActivityId();

  activities_ = std::move(activities);
  // An empty folder would strand the cursor, so it is never listed.
  folders_.clear();
  for (auto& folder : folders) {
    const bool used = std::any_of(activities_.begin(), activities_.end(),
                                  [&](const ActivityEntry& a) { return a.folderId == folder.id; });
    if (used) folders_.push_back(std::move(folder));
  }
  // visible_ points into the old activities_, which were just freed. Reset
  // the selection before any early return, or a reload to an empty config
  // leaves it dangling.
  visible_.clear();
  level_ = Level::Folders;
  folderIndex_ = 0;
  cursor_ = 0;
  if (folders_.empty()) return;
  selectFolder(0);

  for (size_t i = 0; i < folders_.size(); ++i) {
    if (folders_[i].id == folderId) selectFolder(i);
  }
  if (level == Level::Activities) {
    if (activityId != 0 && std::any_of(activities_.begin(), activities_.end(),
                                       [&](const ActivityEntry& a) { return a.id == activityId; })) {
      openActivity(activityId);
    } else if (folders_[folderIndex_].id == folderId) {
      level_ = Level::Activities;
    }
  }
}

void Carousel::selectFolder(size_t index) {
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

void Carousel::next() {
  if (folders_.empty()) return;
  if (level_ == Level::Folders) selectFolder(folderIndex_ + 1);
  else cursor_ = (cursor_ + 1) % visible_.size();
}

void Carousel::previous() {
  if (folders_.empty()) return;
  if (level_ == Level::Folders) selectFolder(folderIndex_ + folders_.size() - 1);
  else if (!visible_.empty()) cursor_ = (cursor_ + visible_.size() - 1) % visible_.size();
}

void Carousel::enter() {
  if (folders_.empty()) return;
  level_ = Level::Activities;
  cursor_ = 0;
}

void Carousel::up() {
  level_ = Level::Folders;
  cursor_ = 0;
}

void Carousel::openActivity(int activityId) {
  for (size_t f = 0; f < folders_.size(); ++f) {
    selectFolder(f);
    for (size_t i = 0; i < visible_.size(); ++i) {
      if (visible_[i]->id == activityId) {
        level_ = Level::Activities;
        cursor_ = i;
        return;
      }
    }
  }
  // Unknown id: fall back to the top of the folder list.
  if (!folders_.empty()) selectFolder(0);
  level_ = Level::Folders;
}

int Carousel::currentActivityId() const {
  if (level_ != Level::Activities || visible_.empty()) return 0;
  return visible_[cursor_]->id;
}

void Carousel::fill(ViewModel& vm) const {
  vm.items.clear();
  vm.folder = folders_.empty() ? "" : folders_[folderIndex_].name;
  vm.activity = currentActivityId() == 0 ? "" : visible_[cursor_]->name;
  vm.top = level_ == Level::Folders;
  if (vm.top) {
    vm.title = "FOLDERS";
    for (const auto& folder : folders_) vm.items.push_back(folder.name);
    vm.cursor = static_cast<int>(folderIndex_);
  } else {
    vm.title = vm.folder;
    for (const auto* activity : visible_) vm.items.push_back(activity->name);
    vm.cursor = static_cast<int>(cursor_);
  }
}
