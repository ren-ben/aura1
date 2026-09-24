#pragma once
#include <string>
#include "ports.h"

// The board's speaker: an ES8311 codec on the I2C bus the clock shares, fed
// over I2S, into a small amplifier switched on only while a sound plays. The
// sounds are 16 kHz, 16-bit mono WAVs on the card at /sound/<name>.wav, baked
// by packages/art (pnpm --filter @aura/art sound). One plays to its end
// before play() returns: they are a few seconds, and nothing else happens
// while a bell rings.
class Speaker : public Sound {
public:
  void play(const std::string& name) override;
};
