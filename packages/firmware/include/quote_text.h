#pragma once
#include <string>
#include <vector>

// A quote in Kael'thos' speech bubble: wrapped to whole words, shown a page
// of lines at a time. SUN turns the page of a long one. Large text (the
// setting) fits fewer words on a page.
struct QuoteFit {
  size_t chars;
  size_t lines;
};
QuoteFit quoteFit(bool large);

std::vector<std::string> wrapWords(const std::string& text, size_t width);
int quotePages(const std::string& text, bool large);
