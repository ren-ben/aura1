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
      in >> s.env >> s.skin;  // optional
      if (s.env == "-") s.env.clear();
      out.push_back(s);
    }
  }
  return out;
}

const ArtScene* pickScene(const std::vector<ArtScene>& scenes, const std::string& moment, uint32_t roll,
                          const std::string& env, const std::string& skin) {
  bool worn = false;
  for (const auto& s : scenes) worn = worn || (s.moment == moment && !skin.empty() && s.skin == skin);
  std::vector<const ArtScene*> matches, here;
  for (const auto& s : scenes) {
    if (s.moment != moment || s.skin != (worn ? skin : "")) continue;
    matches.push_back(&s);
    if (!env.empty() && s.env == env) here.push_back(&s);
  }
  if (!here.empty()) return here[roll % here.size()];
  return matches.empty() ? nullptr : matches[roll % matches.size()];
}

std::string sessionMoment(const std::string& folder) {
  std::string m = "session-";
  for (char c : folder) m += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  return m;
}

std::string wakeMoment(const std::string& form) {
  return form == "fragmenting" || form == "dormant" ? "neglected" : "wake";
}

std::string screensaverMoment(const std::string& form, const std::string& date) {
  if (form != "stable") return "decay-" + form;
  if (date.size() == 10 && date.compare(5, 2, "10") == 0 && date.compare(8, 2, "24") >= 0) return "halloween";
  return "lore";
}

std::string sealedMoment(int minutes) {
  if (minutes < MIN_SESSION_MINUTES) return "sealed-short";
  if (minutes >= 360) return "sealed-marathon";
  if (minutes >= 90) return "sealed-long";
  return "sealed";
}
