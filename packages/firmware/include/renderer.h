#pragma once
#include "view_model.h"

class Renderer {
public:
  virtual ~Renderer() = default;
  virtual void render(const ViewModel& vm) = 0;
};
