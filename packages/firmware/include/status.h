#pragma once

// The corner of every screen: the battery, and how the link to the server is.
enum class Link { Syncing, Online, Offline };
struct Status {
  int bars = 0;
  bool charging = false;
  Link link = Link::Syncing;
  int percent = 0;  // for the settings' battery panel
  int millivolts = 0;
  int mail = 0;      // unread university mail: an envelope in the corner
  bool operator==(const Status& o) const {
    return bars == o.bars && charging == o.charging && link == o.link && percent == o.percent && millivolts == o.millivolts
        && mail == o.mail;
  }
};
