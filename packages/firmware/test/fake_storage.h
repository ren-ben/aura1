#pragma once
#include <map>
#include <sstream>
#include "ports.h"

class FakeStorage : public Storage {
public:
  std::map<std::string, std::string> files;

  bool append(const std::string& path, const std::string& line) override {
    files[path] += line + "\n";
    return true;
  }
  std::vector<std::string> readLines(const std::string& path) override {
    std::vector<std::string> out;
    auto it = files.find(path);
    if (it == files.end()) return out;
    std::istringstream stream(it->second);
    std::string line;
    while (std::getline(stream, line)) out.push_back(line);
    return out;
  }
  bool write(const std::string& path, const std::string& content) override {
    files[path] = content;
    return true;
  }
  bool remove(const std::string& path) override { return files.erase(path) > 0; }
  bool exists(const std::string& path) override { return files.count(path) > 0; }
};
