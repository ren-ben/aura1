#pragma once
#include <string>
#include <vector>
#include "carousel.h"
#include "daily.h"
#include "ports.h"
#include "queue.h"

class SyncClient {
public:
  SyncClient(EventQueue& queue, Clock& clock, Storage& storage, Daily& daily)
    : queue_(queue), clock_(clock), storage_(storage), daily_(daily) {}

  // Brings wifi up, performs exactly one request, brings wifi down.
  // Returns true on a 200. On any failure it touches nothing. cancel() is
  // polled while waiting for Wi-Fi; returning true abandons the attempt.
  bool run(int& configVersion, Carousel& carousel, bool (*cancel)());

private:
  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
  Daily& daily_;
};
