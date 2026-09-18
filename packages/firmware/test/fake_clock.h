#pragma once
#include "ports.h"

class FakeClock : public Clock {
public:
  uint64_t now = 1758100000ULL;
  uint64_t nowEpochSeconds() override { return now; }
  void setEpochSeconds(uint64_t seconds) override { now = seconds; }
};
