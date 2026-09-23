#include "buttons.h"

// The interrupt lives in its own unit, not in the header. An IRAM handler
// that is inline lands its literal pool after its own code, which the Xtensa
// linker refuses ("dangerous relocation: l32r"); one ordinary definition puts
// the pool where it belongs.
namespace sun {

volatile unsigned long lastPress = 0;
volatile bool twice = false;

void IRAM_ATTR pressed() {
  const unsigned long now = millis();
  if (now - lastPress < DEBOUNCE_MS) return;
  if (now - lastPress < DOUBLE_MS) twice = true;
  lastPress = now;
}

}  // namespace sun
