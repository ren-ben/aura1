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

QuoteFit quoteFit(bool large) {
  return large ? QuoteFit{ 14, 4 } : QuoteFit{ 27, 7 };
}

int quotePages(const std::string& text, bool large) {
  const QuoteFit fit = quoteFit(large);
  const size_t lines = wrapWords(text, fit.chars).size();
  return lines == 0 ? 1 : static_cast<int>((lines + fit.lines - 1) / fit.lines);
}
