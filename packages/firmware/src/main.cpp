#include <Arduino.h>
#include <algorithm>
#include <SD_MMC.h>
#include <Wire.h>
#include <bootloader_random.h>
#include <driver/gpio.h>
#include <driver/rtc_io.h>
#include <esp_sleep.h>
#include "secrets.h"
#include "carousel.h"
#include "config_store.h"
#include "queue.h"
#include "session_machine.h"
#include "battery.h"
#include "device/battery_reader.h"
#include "book.h"
#include "device/buttons.h"
#include "device/eink_renderer.h"
#include "device/rtc_clock.h"
#include "device/sd_storage.h"
#include "device/sync_client.h"
#include "device/esp_random.h"
#include "device/speaker.h"

static SdStorage storage;
static RtcClock rtc;
static EinkRenderer renderer;
static Buttons buttons;
static Carousel carousel;
static EventQueue queue(storage);
static EspRandom random_;
static SessionMachine machine(carousel, queue, rtc, storage, renderer, random_);
static SyncClient syncClient(queue, rtc, storage, machine.daily());
static BatteryGauge gauge;
static Speaker speaker;

static int configVersion = 0;
static unsigned long lastTick = 0;
static unsigned long lastBattery = 0;
static unsigned long nextSync = 0;
static unsigned long retryMs = 0;
static int levelAtSync = 0;
static bool knownAtSync = false;
static Link linkState = Link::Syncing;

constexpr unsigned long TICK_MS = 1000;
constexpr unsigned long BATTERY_MS = 15000;
// Synced: again in an hour, for the day's todos and quotes. Offline: again
// soon, then less often, so a hotspot switched on later is found within
// minutes without the radio draining the battery.
constexpr unsigned long SYNCED_MS = 60UL * 60 * 1000;
constexpr unsigned long FIRST_RETRY_MS = 60UL * 1000;
constexpr unsigned long MAX_RETRY_MS = 8UL * 60 * 1000;
constexpr unsigned long POWER_OFF_CONNECT_MS = 10000;
constexpr const char* BATTERY_FILE = "/battery.txt";  // the learned full reading

static void showStatus() {
  renderer.setStatus({ gauge.bars(), gauge.charging(), linkState, gauge.percent(), gauge.millivolts() });
}

static void checkBattery() {
  const int raw = readBatteryMillivolts();
  const int learned = gauge.fullRaw();
  const int before = gauge.percent();
  const bool wasCharging = gauge.charging();
  gauge.sample(raw, usbHost());
  if (gauge.fullRaw() >= learned + 10) storage.write(BATTERY_FILE, std::to_string(gauge.fullRaw()) + "\n");
  Serial.printf("battery raw=%dmV full=%dmV -> %dmV %d%% bars=%d%s\n", raw, gauge.fullRaw(), gauge.millivolts(),
                gauge.percent(), gauge.bars(), gauge.charging() ? " charging" : "");
  showStatus();
  if (gauge.percent() != before || gauge.charging() != wasCharging) machine.batteryChanged();
}

// Starts a sync unless one is already under way. The cat in the corner
// opens his eyes until it ends.
static void startSync(unsigned long connectMs = 20000, bool forceScan = false) {
  if (syncClient.busy()) return;
  knownAtSync = !machine.daily().date().empty();
  levelAtSync = machine.daily().level();
  syncClient.setStatus({ gauge.percent(), gauge.millivolts(), gauge.charging(), machine.lookName() });
  // Where the reading got to in every book read since the last sync, and
  // whatever was kept in them.
  syncClient.setReadings(machine.book().readings());
  syncClient.start(connectMs, forceScan);
  linkState = Link::Syncing;
  showStatus();
}

// A sync that pulled a new config reloaded the carousel under the machine;
// redraw so Idle never shows a selection POWER would not start.
static void finishSync(SyncOutcome outcome) {
  const bool ok = outcome == SyncOutcome::Ok;
  linkState = ok ? Link::Online : Link::Offline;
  Book& book = machine.book();
  retryMs = ok ? 0 : retryMs ? std::min(retryMs * 2, MAX_RETRY_MS) : FIRST_RETRY_MS;
  nextSync = millis() + (ok ? SYNCED_MS : retryMs);
  machine.setSyncNote(ok ? "SYNCED" : outcome == SyncOutcome::NoWifi ? "NO WIFI" : "SERVER ERROR");
  showStatus();
  if (!ok) return;
  const std::string look = syncClient.takeLook();
  if (!look.empty()) machine.setLook(look);
  // The server has the places and the passages now; the shelf comes back
  // with where every book was left, and whatever is not on the card yet is
  // fetched while the radio is still up, the book being waited on first.
  if (syncClient.tookReadings()) book.synced();
  const std::string shelf = syncClient.takeShelf();
  if (!shelf.empty() && book.shelve(shelf)) machine.bookChanged();
  syncClient.fetch(book.toFetch(), book.wanted());
  // A level up is his to celebrate, but never over a running session. The
  // first bundle ever is not a level up.
  const Screen screen = machine.screen();
  if (knownAtSync && machine.daily().level() > levelAtSync && (screen == Screen::Idle || screen == Screen::Stopped)) {
    machine.celebrate("levelup");
  } else {
    machine.redraw();
  }
}

static void pollSync() {
  SyncOutcome outcome;
  if (syncClient.poll(configVersion, carousel, machine.screen() != Screen::Running, outcome)) finishSync(outcome);
}

// Going off: one last sync, so the dashboard has everything. It waits for
// the hotspot a little less long than usual; SUN skips it.
static void syncBeforePowerOff() {
  // Books still arriving can wait for the next time it is on.
  if (syncClient.fetching()) syncClient.abort();
  startSync(POWER_OFF_CONNECT_MS);
  while (syncClient.busy()) {
    if (digitalRead(PIN_SUN_BTN) == LOW) { syncClient.abort(); break; }
    pollSync();
    delay(20);
  }
}

void setup() {
  // esp_random() is only a true RNG while RF or the bootloader entropy source is on.
  // Session uuids are minted at button presses with the radio OFF, so keep the entropy
  // source on except during sync; SyncClient disables it before WiFi.begin() and
  // re-enables it after WiFi is off. Verify against Espressif's esp_random docs.
  bootloader_random_enable();
  // 80 MHz is plenty for buttons and e-ink, and draws about half of 240 MHz.
  // Wi-Fi still works at this speed; TLS is just slower.
  setCpuFrequencyMhz(80);
  buttons.begin();
  // Either button wakes the chip from light sleep (see loop()).
  gpio_wakeup_enable((gpio_num_t)PIN_SUN_BTN, GPIO_INTR_LOW_LEVEL);
  gpio_wakeup_enable((gpio_num_t)PIN_POWER_BTN, GPIO_INTR_LOW_LEVEL);
  esp_sleep_enable_gpio_wakeup();
  // Without this rail the RTC is unpowered and every I2C read times out (error 263).
  // Waveshare's own RTC example switches it on first, despite the "audio" name.
  pinMode(PIN_AUX_POWER, OUTPUT);
  digitalWrite(PIN_AUX_POWER, LOW);
  delay(10);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  rtc.begin();
  SD_MMC.setPins(PIN_SD_CLK, PIN_SD_CMD, PIN_SD_D0);
  SD_MMC.begin(SD_MOUNT, true);  // true = 1-bit mode, as the board is wired
  renderer.begin();
  Serial.begin(115200);
  Serial.printf("flash=%luMB psram=%luKB\n",
                (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)),
                (unsigned long)(ESP.getPsramSize() / 1024));
  const auto full = storage.readLines(BATTERY_FILE);
  if (!full.empty()) gauge.setFullRaw(std::atoi(full[0].c_str()));
  checkBattery();
  loadConfigFromSd(storage, carousel, configVersion);
  machine.setSound(&speaker);
  machine.begin();
  startSync();
}

void loop() {
  Input input;
  if (buttons.poll(input)) {
    // Holding POWER over a page of a book goes back to the menu instead.
    if (input == Input::PowerLong && !machine.reading()) {
      // Goodnight first, and only then the sync. The other way round the
      // glass kept whatever was on it for the seconds the sync took, so
      // there was nothing to tell you the press had taken and you could let
      // go of the button. The machine also writes its final heartbeat here,
      // which the sync that follows now carries with it.
      machine.handle(input);
      syncBeforePowerOff();
      // On battery the board dies here, or at the button's release: a held
      // POWER keeps it powered in hardware.
      Buttons::powerOff();
      while (digitalRead(PIN_POWER_BTN) == LOW) delay(10);
      delay(200);
      // Still running means USB is powering the board. Sleep until POWER
      // wakes it; waking reboots, the same as switching on from battery.
      esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);  // no light-sleep timer
      rtc_gpio_pullup_en((gpio_num_t)PIN_POWER_BTN);
      rtc_gpio_pulldown_dis((gpio_num_t)PIN_POWER_BTN);
      esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_POWER_BTN, 0);
      esp_deep_sleep_start();
    }
    machine.handle(input);
    // A session just sealed, SYNC NOW in the settings, or a book to copy.
    // Mid-fetch, a book just opened goes to the front of what is fetched.
    // Whatever asked for a sync while books were arriving gets one as soon
    // as they have: a sealed session is not left for the hourly one.
    if (machine.takeSyncRequest()) {
      if (syncClient.fetching()) { syncClient.fetch(machine.book().toFetch(), machine.book().wanted()); nextSync = millis(); }
      else { retryMs = 0; startSync(25000, true); }
    }
    else if (machine.screen() == Screen::Stopped) { if (syncClient.busy()) nextSync = millis(); else startSync(); }
  }

  // Books arrive on a task of their own; here is only what it has to tell.
  FetchProgress progress;
  while (syncClient.news(progress)) {
    if (progress.failed) machine.setSyncNote(progress.offline ? "NO WIFI" : "SERVER ERROR");
    else if (progress.whole) machine.bookArrived(progress.id);
    else machine.copying(progress.id, progress.done, progress.total);
  }
  if (syncClient.busy() && !syncClient.fetching()) pollSync();

  const unsigned long now = millis();
  if (now - lastTick >= TICK_MS) { lastTick = now; machine.handle(Input::Tick); }
  // The radio sags the cell: read it only with the radio off.
  if (now - lastBattery >= BATTERY_MS && !syncClient.busy()) { lastBattery = now; checkBattery(); }
  // Not mid-session: that session's end syncs anyway.
  if (static_cast<long>(now - nextSync) >= 0 && machine.screen() != Screen::Running) startSync();

  // Sleep until the next press or tick: a few mA instead of tens. RAM, the
  // clock and millis() all survive light sleep, so a running session carries
  // on. Never while syncing, and never with a computer on the USB port: light
  // sleep also stops the port, which leaves the board unflashable.
  // Busy, the loop still gives the radio's core room to breathe.
  if (syncClient.busy()) delay(5);
  if (buttons.settled() && !syncClient.busy() && !usbHost()) {
    esp_sleep_enable_timer_wakeup(TICK_MS * 1000);
    esp_light_sleep_start();
  }
}
