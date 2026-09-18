#include <Arduino.h>
#include <SD_MMC.h>
#include <Wire.h>
#include <bootloader_random.h>
#include "secrets.h"
#include "carousel.h"
#include "config_store.h"
#include "queue.h"
#include "session_machine.h"
#include "device/buttons.h"
#include "device/eink_renderer.h"
#include "device/rtc_clock.h"
#include "device/sd_storage.h"
#include "device/sync_client.h"
#include "device/esp_random.h"

static SdStorage storage;
static RtcClock rtc;
static EinkRenderer renderer;
static Buttons buttons;
static Carousel carousel;
static EventQueue queue(storage);
static EspRandom random_;
static SessionMachine machine(carousel, queue, rtc, storage, renderer, random_);
static SyncClient syncClient(queue, rtc, storage);

static int configVersion = 0;
static unsigned long lastTick = 0;
static unsigned long lastSync = 0;

constexpr unsigned long TICK_MS = 1000;
constexpr unsigned long SYNC_INTERVAL_MS = 6UL * 60 * 60 * 1000;

// A sync that pulled a new config reloaded the carousel under the machine;
// redraw so Idle never shows a selection POWER would not start.
static void runSync() {
  const int before = configVersion;
  syncClient.run(configVersion, carousel);
  if (configVersion != before) machine.redraw();
}

void setup() {
  // esp_random() is only a true RNG while RF or the bootloader entropy source is on.
  // Session uuids are minted at button presses with the radio OFF, so keep the entropy
  // source on except during sync; SyncClient disables it before WiFi.begin() and
  // re-enables it after WiFi is off. Verify against Espressif's esp_random docs.
  bootloader_random_enable();
  buttons.begin();
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  rtc.begin();
  SD_MMC.setPins(PIN_SD_CLK, PIN_SD_CMD, PIN_SD_D0);
  SD_MMC.begin(SD_MOUNT, true);  // true = 1-bit mode, as the board is wired
  renderer.begin();
  Serial.begin(115200);
  Serial.printf("flash=%luMB psram=%luKB\n",
                (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)),
                (unsigned long)(ESP.getPsramSize() / 1024));
  loadConfigFromSd(storage, carousel, configVersion);
  machine.begin();
  runSync();
}

void loop() {
  Input input;
  if (buttons.poll(input)) {
    if (input == Input::PowerLong) {
      // Let the machine write a final heartbeat first: a running session then
      // survives power-off to the second instead of losing up to 5 minutes.
      machine.handle(input);
      Buttons::powerOff();
      return;
    }
    machine.handle(input);
    if (machine.screen() == Screen::Stopped) {
      runSync();
      lastSync = millis();
    }
  }

  const unsigned long now = millis();
  if (now - lastTick >= TICK_MS) { lastTick = now; machine.handle(Input::Tick); }
  // Never sync mid-session: sync sets the RTC, and moving the clock under a running
  // session can make endedAt < startedAt. Stopping triggers a sync anyway.
  if (now - lastSync >= SYNC_INTERVAL_MS && machine.screen() != Screen::Running) {
    lastSync = now;
    runSync();
  }
}
