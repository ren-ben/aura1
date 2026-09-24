#pragma once
#include <SD_MMC.h>
#include <stdio.h>
#include "ports.h"

// Mount point passed to SD_MMC.begin(). stdio paths are relative to it.
constexpr const char* SD_MOUNT = "/sdcard";

// The card is wired for SDMMC 1-bit (CLK 39, CMD 41, D0 40). SD.h is the SPI driver and
// would never mount it.
// Contract: readLines returns lines WITHOUT terminators. arduino-esp32's println writes
// "\r\n"; never use it here. A stray '\r' makes every acked uuid fail to match, so the
// queue never drains and, past 200 events, never syncs again.
class SdStorage : public Storage {
public:
  bool append(const std::string& path, const std::string& line) override {
    return put(path, line + '\n', "a");
  }
  std::vector<std::string> readLines(const std::string& path) override {
    std::vector<std::string> out;
    File f = SD_MMC.open(path.c_str(), FILE_READ);
    if (!f) return out;
    while (f.available()) {
      String line = f.readStringUntil('\n');
      if (line.endsWith("\r")) line.remove(line.length() - 1);  // card may be edited on a PC
      if (line.length() > 0) out.push_back(std::string(line.c_str()));
    }
    f.close();
    return out;
  }
  bool write(const std::string& path, const std::string& content) override {
    return put(path, content, "w");
  }
  bool remove(const std::string& path) override { return SD_MMC.remove(path.c_str()); }
  bool exists(const std::string& path) override { return SD_MMC.exists(path.c_str()); }

private:
  // A full card opens fine and then writes nothing. Returning true there would let
  // stopSession delete the marker and lose the session, so every byte must be confirmed.
  // SD_MMC's File cannot confirm it: it buffers 4 KB (vfs_api.cpp setvbuf), so print()
  // counts bytes into RAM, and the real write happens in close(), which returns void.
  // stdio on the same mount reports that flush through fclose().
  static bool put(const std::string& path, const std::string& data, const char* mode) {
    FILE* f = fopen((std::string(SD_MOUNT) + path).c_str(), mode);
    // A book keeps its files in a folder of its own, made the first time.
    if (!f) {
      for (size_t at = path.find('/', 1); at != std::string::npos; at = path.find('/', at + 1)) {
        SD_MMC.mkdir(path.substr(0, at).c_str());
      }
      f = fopen((std::string(SD_MOUNT) + path).c_str(), mode);
    }
    if (!f) return false;
    const bool buffered = fwrite(data.data(), 1, data.size(), f) == data.size();
    const bool flushed = fclose(f) == 0;
    return buffered && flushed;
  }
};
