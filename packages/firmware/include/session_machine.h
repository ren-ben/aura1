#pragma once
#include <cstdint>
#include <string>
#include "carousel.h"
#include "queue.h"
#include "ports.h"
#include "renderer.h"
#include "view_model.h"

enum class Input { SunShort, SunLong, PowerShort, PowerLong, Tick };

std::string uuidV4(Random& random);

class SessionMachine {
public:
  SessionMachine(Carousel& carousel, EventQueue& queue, Clock& clock,
                 Storage& storage, Renderer& renderer, Random& random);

  void begin();
  void handle(Input input);
  Screen screen() const { return screen_; }

private:
  void draw(int minutes = 0);
  void startSession();
  void stopSession();
  void writeMarker(uint64_t heartbeat);
  void recoverMarker();

  static constexpr const char* MARKER = "/session.open";
  static constexpr uint64_t HEARTBEAT_SECONDS = 300;

  Carousel& carousel_;
  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
  Renderer& renderer_;
  Random& random_;

  Screen screen_ = Screen::Idle;
  int activityId_ = 0;
  std::string sessionUuid_;
  uint64_t startedAt_ = 0;
  uint64_t lastHeartbeat_ = 0;
};
