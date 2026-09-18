#pragma once
#include <string>
#include <vector>
#include "carousel.h"
#include "ports.h"
#include "queue.h"

class SyncClient {
public:
  SyncClient(EventQueue& queue, Clock& clock, Storage& storage)
    : queue_(queue), clock_(clock), storage_(storage) {}

  // Brings wifi up, performs exactly one request, brings wifi down.
  // Returns true on a 200. On any failure it touches nothing.
  bool run(int& configVersion, Carousel& carousel);

private:
  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
};
