#pragma once
#include "ports.h"

class FakeRandom : public Random {
public:
  uint32_t state = 0x12345678u;
  uint32_t next() override {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
  }
};
