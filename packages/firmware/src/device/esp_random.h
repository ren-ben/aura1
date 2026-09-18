#pragma once
#include <esp_random.h>
#include "ports.h"

// Hardware RNG. Never seeded from the clock.
class EspRandom : public Random {
public:
  uint32_t next() override { return esp_random(); }
};
