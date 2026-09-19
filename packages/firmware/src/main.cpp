#include <Arduino.h>
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
static SyncClient syncClient(queue, rtc, storage, machine.daily());

static int configVersion = 0;
static unsigned long lastTick = 0;
static unsigned long lastSync = 0;
static unsigned long lastBatteryLog = 0;

constexpr unsigned long TICK_MS = 1000;
constexpr unsigned long SYNC_INTERVAL_MS = 6UL * 60 * 60 * 1000;

static bool pluggedIn = false;

// Also redraws when USB is plugged in or out, so the battery icon's bolt
// follows within a minute.
static void checkBattery() {
  const int mv = readBatteryMillivolts();
  Serial.printf("battery=%dmV %d%%%s\n", mv, batteryPercent(mv), onExternalPower(mv) ? " usb" : "");
  if (onExternalPower(mv) != pluggedIn) {
    pluggedIn = !pluggedIn;
    machine.redraw();
  }
}

// A press abandons the sync, so the device never ignores the user while it
// waits for Wi-Fi. The queue is untouched and goes with the next sync.
static bool userPressed() { return buttons.anyDown(); }

// A sync that pulled a new config reloaded the carousel under the machine;
// redraw so Idle never shows a selection POWER would not start.
static void runSync() {
  const int before = configVersion;
  const bool known = !machine.daily().date().empty();
  const int level = machine.daily().level();
  syncClient.run(configVersion, carousel, userPressed);
  // A level up is his to celebrate. The first bundle ever is not a level up.
  if (known && machine.daily().level() > level) machine.celebrate("levelup");
  else if (configVersion != before) machine.redraw();
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
  pluggedIn = onExternalPower(readBatteryMillivolts());
  checkBattery();
  loadConfigFromSd(storage, carousel, configVersion);
  machine.begin();
  runSync();
}

void loop() {
  Input input;
  if (buttons.poll(input)) {
    if (input == Input::PowerLong) {
      // Let the machine write a final heartbeat and draw DORMANT first: a
      // running session then survives power-off to the second.
      machine.handle(input);
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
    if (machine.screen() == Screen::Stopped) {
      runSync();
      lastSync = millis();
    }
  }

  const unsigned long now = millis();
  if (now - lastTick >= TICK_MS) { lastTick = now; machine.handle(Input::Tick); }
  if (now - lastBatteryLog >= 60000) { lastBatteryLog = now; checkBattery(); }
  // Never sync mid-session: sync sets the RTC, and moving the clock under a running
  // session can make endedAt < startedAt. Stopping triggers a sync anyway.
  if (now - lastSync >= SYNC_INTERVAL_MS && machine.screen() != Screen::Running) {
    lastSync = now;
    runSync();
  }

  // Sleep until the next press or tick: a few mA instead of tens. RAM, the
  // clock and millis() all survive light sleep, so a running session carries
  // on. Only on battery: light sleep also stops the USB port, and the serial
  // check (!Serial) proved unreliable, leaving a plugged-in board unflashable.
  // USB power is measured directly on the battery pin (see onExternalPower).
  if (buttons.settled() && !onExternalPower(readBatteryMillivolts())) {
    esp_sleep_enable_timer_wakeup(TICK_MS * 1000);
    esp_light_sleep_start();
  }
}
