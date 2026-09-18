#pragma once
#include <cstdint>
#include <string>
#include <vector>

class Clock {
public:
  virtual ~Clock() = default;
  virtual uint64_t nowEpochSeconds() = 0;
  virtual void setEpochSeconds(uint64_t seconds) = 0;
};

class Storage {
public:
  virtual ~Storage() = default;
  virtual bool append(const std::string& path, const std::string& line) = 0;
  virtual std::vector<std::string> readLines(const std::string& path) = 0;
  virtual bool write(const std::string& path, const std::string& content) = 0;
  virtual bool remove(const std::string& path) = 0;
  virtual bool exists(const std::string& path) = 0;
};
