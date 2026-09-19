#pragma once

// LiPo charge from its resting voltage. The curve is flat in the middle, so
// this is an estimate: good for a 4-step icon, not for a percentage readout.
int batteryPercent(int millivolts);

// The board has no charge-status pin. On USB the sense pin reads the supply,
// above anything a LiPo reaches (4.2 V full), so that is the plugged-in signal.
bool onExternalPower(int millivolts);
