#include "art_index.h"
#include <cctype>
#include <sstream>

std::vector<ArtScene> parseArtIndex(const std::vector<std::string>& lines) {
  std::vector<ArtScene> out;
  for (const auto& line : lines) {
    std::istringstream in(line);
    ArtScene s;
    // A malformed or truncated line is skipped, never half-used.
    if (in >> s.moment >> s.id >> s.frames >> s.size && s.frames > 0 && s.size > 0 && s.size <= 200) {
      out.push_back(s);
    }
  }
  return out;
}

const ArtScene* pickScene(const std::vector<ArtScene>& scenes, const std::string& moment, uint32_t roll) {
  std::vector<const ArtScene*> matches;
  for (const auto& s : scenes) {
    if (s.moment == moment) matches.push_back(&s);
  }
  return matches.empty() ? nullptr : matches[roll % matches.size()];
}

std::string sessionMoment(const std::string& folder) {
  std::string m = "session-";
  for (char c : folder) m += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return m;
}

std::string sealedMoment(int minutes) {
  if (minutes < 5) return "sealed-short";
  if (minutes >= 360) return "sealed-marathon";
  if (minutes >= 90) return "sealed-long";
  return "sealed";
}
