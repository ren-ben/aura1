#pragma once
#include <string>
#include <vector>

// A quote in Kael'thos' speech bubble: wrapped to whole words, shown a page
// of lines at a time. SUN turns the page of a long one.
constexpr size_t QUOTE_CHARS = 27;
constexpr size_t QUOTE_LINES = 7;

std::vector<std::string> wrapWords(const std::string& text, size_t width);
int quotePages(const std::string& text);
