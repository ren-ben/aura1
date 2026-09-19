#include "quote_text.h"

std::vector<std::string> wrapWords(const std::string& text, size_t width) {
  std::vector<std::string> lines;
  std::string line, word;
  const auto flush = [&]() {
    if (word.empty()) return;
    if (!line.empty() && line.size() + 1 + word.size() > width) { lines.push_back(line); line.clear(); }
    while (word.size() > width) { lines.push_back(word.substr(0, width)); word = word.substr(width); }
    line += (line.empty() ? "" : " ") + word;
    word.clear();
  };
  for (char c : text) {
    if (c == ' ' || c == '\n') flush();
    else word += c;
  }
  flush();
  if (!line.empty()) lines.push_back(line);
  return lines;
}

int quotePages(const std::string& text) {
  const size_t lines = wrapWords(text, QUOTE_CHARS).size();
  return lines == 0 ? 1 : static_cast<int>((lines + QUOTE_LINES - 1) / QUOTE_LINES);
}
