#pragma once
#include <atomic>
#include <string>
#include <vector>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "book.h"
#include "carousel.h"
#include "daily.h"
#include "ports.h"
#include "queue.h"
#include "sync_codec.h"

enum class SyncOutcome { Ok, NoWifi, Failed };

// How the fetch of a book is going, for the screen that waits on it.
struct FetchProgress {
  int id = 0;
  int done = 0;       // chapters on the card
  int total = 0;
  bool whole = false; // the last of it just arrived
  bool failed = false;
  bool offline = false; // failed because the hotspot went, not the server
};

class SyncClient {
public:
  SyncClient(EventQueue& queue, Clock& clock, Storage& storage, Daily& daily)
    : queue_(queue), clock_(clock), storage_(storage), daily_(daily) {}

  // Brings the radio up and returns at once: joining the hotspot takes
  // seconds, and the buttons keep working meanwhile.
  // forceScan skips the remembered hotspot: what a hand-made sync does, so a
  // hotspot that came back on another channel is found at once.
  void start(unsigned long connectTimeoutMs = 20000, bool forceScan = false);
  // Busy from the radio coming up until it goes down again, fetch included.
  bool busy() const { return busy_ || fetching_; }
  // Called every loop while busy and not fetching. Once joined it sends
  // exactly one request (blocking for the few seconds TLS takes); then it
  // returns true with the result. On failure the radio is off again and it
  // touched nothing; on success the radio stays up for fetch().
  // setClock is false mid-session: moving the clock under a running session
  // could end it before it started.
  bool poll(int& configVersion, Carousel& carousel, bool setClock, SyncOutcome& result);
  // After a good sync: the books still to come onto the card, in order. They
  // arrive on a task of their own, on the other core, so the buttons never
  // wait on a download; with nothing to fetch the radio goes down. Called
  // again mid-fetch, it replaces the order: a book just asked for goes first.
  // `urgent` is the one someone is waiting on: it is fetched to the end, the
  // rest only for a while each sync.
  void fetch(const std::vector<Fetch>& plan, int urgent);
  bool fetching() const { return fetching_; }
  // What the fetch has to tell, one piece at a time; false when nothing new.
  bool news(FetchProgress& progress);
  // Stops everything; a fetch finishes the piece it is on first.
  void abort();
  // How the device is, sent with the next sync.
  void setStatus(const DeviceStatus& status) { status_ = status; }
  // Where the reading is in every book read since the last sync.
  void setReadings(const std::vector<ReadingState>& readings) { readings_ = readings; }
  std::string takeShelf() { std::string s = shelf_; shelf_.clear(); return s; }
  // True once a sync has carried the readings away, so the card can forget them.
  bool tookReadings() { const bool t = tookReadings_; tookReadings_ = false; return t; }
  // A look the last sync brought from the web, once.
  std::string takeLook() { std::string l = look_; look_.clear(); return l; }
  int mail() const { return mail_; }

private:
  SyncOutcome post(int& configVersion, Carousel& carousel, bool setClock);
  void radioOff();
  void joinByScan();
  // GETs a path under the API into a file on the card; false on any failure,
  // with nothing half written left behind.
  bool download(const std::string& path, const std::string& file);
  static void run(void* self);
  // One piece of a book: its head, or one chapter. False when the fetch is
  // over; `tell` when there is progress to report.
  bool step(FetchProgress& progress, bool& tell);

  // The hotspot last joined, kept on the card: the next join goes straight to
  // its channel instead of scanning them all.
  static constexpr const char* WIFI_FILE = "/wifi.txt";  // "<channel> <bssid hex>"
  static constexpr unsigned long DIRECT_MS = 4000;       // then scan after all
  static constexpr unsigned long NOT_THERE_MS = 8000;    // a scan found no hotspot
  // Books nobody is waiting on are fetched this long each sync, then left
  // for the next one: the rest of the shelf is not worth the battery at once.
  static constexpr unsigned long BACKGROUND_FETCH_MS = 3UL * 60 * 1000;

  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
  Daily& daily_;
  std::atomic<bool> busy_{ false };
  std::atomic<bool> connected_{ false };  // synced, radio still up for the fetch
  std::atomic<bool> fetching_{ false };
  std::atomic<bool> stop_{ false };
  unsigned long startedAt_ = 0;
  unsigned long timeout_ = 0;
  unsigned long scanAt_ = 0;    // when the scanning join began
  unsigned long missingAt_ = 0; // when the hotspot first went missing in this scan
  bool direct_ = false;         // joining by the remembered channel
  DeviceStatus status_;
  std::vector<ReadingState> readings_;
  std::string look_;
  int mail_ = 0;
  std::string shelf_;
  bool tookReadings_ = false;

  // The order, shared with the fetch task under the lock.
  SemaphoreHandle_t lock_ = nullptr;
  QueueHandle_t news_ = nullptr;
  std::vector<Fetch> plan_;
  int urgent_ = 0;
  int next_ = 0;                // the next chapter of plan_[0] to look for
  unsigned long fetchFrom_ = 0;
  // One TLS connection for the whole fetch: a handshake a chapter would take
  // longer than the chapters.
  WiFiClientSecure tls_;
  HTTPClient http_;
};
