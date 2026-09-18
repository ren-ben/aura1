#pragma once
#include <vector>
#include "renderer.h"

class FakeRenderer : public Renderer {
public:
  std::vector<ViewModel> frames;
  void render(const ViewModel& vm) override { frames.push_back(vm); }
  const ViewModel& last() const { return frames.back(); }
};
