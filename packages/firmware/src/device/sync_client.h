#pragma once
#include <string>
#include <vector>
#include "carousel.h"
#include "daily.h"
#include "ports.h"
#include "queue.h"
#include "sync_codec.h"

enum class SyncOutcome { Ok, NoWifi, Failed };

class SyncClient {
public:
  SyncClient(EventQueue& queue, Clock& clock, Storage& storage, Daily& daily)
    : queue_(queue), clock_(clock), storage_(storage), daily_(daily) {}

  // Brings the radio up and returns at once: joining the hotspot takes
  // seconds, and the buttons keep working meanwhile.
  // forceScan skips the remembered hotspot: what a hand-made sync does, so a
  // hotspot that came back on another channel is found at once.
  void start(unsigned long connectTimeoutMs = 20000, bool forceScan = false);
  bool busy() const { return busy_; }
  // Called every loop while busy. Once joined it sends exactly one request
  // (blocking for the few seconds TLS takes) and brings the radio down; then
  // it returns true with the result. On any failure it touches nothing.
  // setClock is false mid-session: moving the clock under a running session
  // could end it before it started.
  bool poll(int& configVersion, Carousel& carousel, bool setClock, SyncOutcome& result);
  void abort();
  // How the device is, sent with the next sync.
  void setStatus(const DeviceStatus& status) { status_ = status; }
  // Where the reading is, sent with the next sync.
  void setReading(const ReadingState& reading) { reading_ = reading; }
  // The book the last sync brought, once.
  std::string takeBook() { std::string b = book_; book_.clear(); return b; }
  // True once a sync has carried the marks away, so the card can forget them.
  bool tookMarks() { const bool t = tookMarks_; tookMarks_ = false; return t; }
  // A look the last sync brought from the web, once.
  std::string takeLook() { std::string l = look_; look_.clear(); return l; }

private:
  SyncOutcome post(int& configVersion, Carousel& carousel, bool setClock);
  void radioOff();
  void joinByScan();

  // The hotspot last joined, kept on the card: the next join goes straight to
  // its channel instead of scanning them all.
  static constexpr const char* WIFI_FILE = "/wifi.txt";  // "<channel> <bssid hex>"
  static constexpr unsigned long DIRECT_MS = 4000;       // then scan after all
  static constexpr unsigned long NOT_THERE_MS = 8000;    // a scan found no hotspot

  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
  Daily& daily_;
  bool busy_ = false;
  unsigned long startedAt_ = 0;
  unsigned long timeout_ = 0;
  unsigned long scanAt_ = 0;    // when the scanning join began
  unsigned long missingAt_ = 0; // when the hotspot first went missing in this scan
  bool direct_ = false;         // joining by the remembered channel
  DeviceStatus status_;
  ReadingState reading_;
  std::string look_;
  std::string book_;
  bool tookMarks_ = false;
};
