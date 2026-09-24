#include "speaker.h"
#include <Arduino.h>
#include <SD_MMC.h>
#include <Wire.h>
#include <driver/i2s.h>

// Waveshare ESP32-S3-ePaper-1.54: the codec's pins, as the board is wired.
// The "audio" rail (PIN_AUX_POWER) is already on for the clock.
constexpr int PIN_I2S_MCLK = 14, PIN_I2S_BCLK = 15, PIN_I2S_WS = 38, PIN_I2S_DOUT = 45;
constexpr int PIN_SPEAKER_PA = 46;  // HIGH: the amplifier on
constexpr uint8_t ES8311 = 0x18;
constexpr int RATE = 16000;
constexpr i2s_port_t PORT = I2S_NUM_0;

static void reg(uint8_t r, uint8_t v) {
  Wire.beginTransmission(ES8311);
  Wire.write(r);
  Wire.write(v);
  Wire.endTransmission();
}

// The codec as a DAC only: slave to the ESP's clocks, MCLK = 256 fs from the
// pin, 16-bit I2S in. After Espressif's es8311 driver, for 4.096 MHz / 16 kHz.
static void codec() {
  reg(0x00, 0x1F); delay(10); reg(0x00, 0x00); reg(0x00, 0x80);  // reset, then on as slave
  reg(0x01, 0x3F);                                                // clocks from MCLK, all on
  reg(0x02, 0x00); reg(0x05, 0x00);                               // no dividers
  reg(0x03, 0x10); reg(0x04, 0x10);                               // ADC and DAC oversampling
  reg(0x07, 0x00); reg(0x08, 0xFF); reg(0x06, 0x03);              // LRCK and BCLK dividers
  reg(0x09, 0x0C); reg(0x0A, 0x0C);                               // I2S, 16 bit, both ways
  reg(0x0B, 0x00); reg(0x0C, 0x00);
  reg(0x10, 0x1F); reg(0x11, 0x7F);
  reg(0x0D, 0x01); reg(0x0E, 0x02);                               // analogue up
  reg(0x12, 0x00); reg(0x13, 0x10);                               // DAC up, output driver on
  reg(0x1C, 0x6A); reg(0x37, 0x08);                               // no equaliser
  reg(0x32, 0xBF);                                                // DAC volume, 0 dB
  reg(0x31, 0x00);                                                // unmuted
}

void Speaker::play(const std::string& name) {
  File f = SD_MMC.open(("/sound/" + name + ".wav").c_str(), FILE_READ);
  if (!f || f.size() <= 44) return;
  f.seek(44);  // a plain PCM header; the art pipeline writes nothing else

  const i2s_config_t config = {
    .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 6,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = RATE * 256,
  };
  const i2s_pin_config_t pins = {
    .mck_io_num = PIN_I2S_MCLK, .bck_io_num = PIN_I2S_BCLK, .ws_io_num = PIN_I2S_WS,
    .data_out_num = PIN_I2S_DOUT, .data_in_num = I2S_PIN_NO_CHANGE,
  };
  if (i2s_driver_install(PORT, &config, 0, nullptr) != ESP_OK) { f.close(); return; }
  i2s_set_pin(PORT, &pins);
  codec();
  pinMode(PIN_SPEAKER_PA, OUTPUT);
  digitalWrite(PIN_SPEAKER_PA, HIGH);

  // Mono from the card, the same sample to both slots.
  int16_t in[256];
  int16_t out[512];
  size_t written;
  while (true) {
    const int n = f.read(reinterpret_cast<uint8_t*>(in), sizeof(in)) / 2;
    if (n <= 0) break;
    for (int i = 0; i < n; ++i) out[2 * i] = out[2 * i + 1] = in[i];
    i2s_write(PORT, out, n * 4, &written, portMAX_DELAY);
  }
  f.close();
  delay(60);  // let the last buffer out before the amplifier goes
  digitalWrite(PIN_SPEAKER_PA, LOW);
  reg(0x32, 0x00);
  i2s_driver_uninstall(PORT);
}
