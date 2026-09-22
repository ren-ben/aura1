#pragma once
#include <string>
#include <vector>
#include "carousel.h"
#include "daily.h"
#include "ports.h"
#include "queue.h"

enum class SyncOutcome { Ok, NoWifi, Failed };

class SyncClient {
public:
  SyncClient(EventQueue& queue, Clock& clock, Storage& storage, Daily& daily)
    : queue_(queue), clock_(clock), storage_(storage), daily_(daily) {}

  // Brings the radio up and returns at once: joining the hotspot takes
  // seconds, and the buttons keep working meanwhile.
  void start(unsigned long connectTimeoutMs = 20000);
  bool busy() const { return busy_; }
  // Called every loop while busy. Once joined it sends exactly one request
  // (blocking for the few seconds TLS takes) and brings the radio down; then
  // it returns true with the result. On any failure it touches nothing.
  // setClock is false mid-session: moving the clock under a running session
  // could end it before it started.
  bool poll(int& configVersion, Carousel& carousel, bool setClock, SyncOutcome& result);
  void abort();

private:
  SyncOutcome post(int& configVersion, Carousel& carousel, bool setClock);
  void radioOff();

  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
  Daily& daily_;
  bool busy_ = false;
  unsigned long startedAt_ = 0;
  unsigned long timeout_ = 0;
};
