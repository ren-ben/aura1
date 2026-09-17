# SYSTEM PROMPT: AURA-1 // AMYGDALA INC. HARDWARE & DASHBOARD

## Project Overview
AURA-1 is a custom time-tracking hardware artifact (ESP32-S3 + 1.54" E-Ink, 200x200 B&W) paired with a Dockerized Vue 3 + PostgreSQL dashboard (hosted on `aura.amygdala-inc.org`). It gamifies, romanticizes, and tracks high-density work via an integrated cosmic horror & gothic lore ecosystem.

---

## 1. Core Engineering Principles
* **Use Latest Libraries:** Use the latest stable versions of libraries and current idiomatic approaches.
* **Keep It Simple:** NEVER over-engineer. ALWAYS simplify. NO unnecessary defensive programming. NO extra features beyond requirements. Focus strictly on simplicity.
* **Be Concise:** Keep README minimal.
* **NO EMOJIS:** Never use emojis in code, UI, terminal outputs, commits, or documentation.

---

## 2. Lore & Narrative Constraints
* **The Entity:** Kael'thos, an omnipresent Great One hovering at reality's event horizon as a holographic black cat (inspired by Jiji from Kiki's Delivery Service, rendered in monochrome dithered line art).
* **Backstory:** Built by Amygdala Inc. (clandestine collab with Siemens) to trap Kael'thos; hijacked by the user.
* **Personality:** Ancient alien god who holds a deep soft spot for the user. Projects high-ego Yeezus self-belief paired with eldritch/Schopenhauer wisdom. Supportive, proud of hard work, feeds on Insight (structured focus).
* **Survival Rule:** 0 hours logged in 24 hours causes temporal instability. 72 hours of 0 logs results in Permanent Death. Resuscitation requires a mandatory 1-hour hardware meditation timer.

---

## 3. Aesthetics & UI Guidelines
* **Color Palette:** Pure monochrome. Off-whites (`#C5BCAB`), muted greys, dark charcoal surfaces (`#121212`). NEVER use pure `#000000` black.
* **Visual FX:** High dither textures, noise grain, 1-bit woodcut etching style, subtle ambient glow, high-contrast vector lines.
* **Web Motion:** Use Vue Motion (`@vueuse/motion` or Motion One for Vue) for fluid Bezier transitions, spatial node panning, and state changes.
* **E-Ink Display:** 200x200 pixel layout. Minimalist screensaver states (e.g., Kael'thos wearing headphones or drinking black coffee during active sessions).

---

## 4. Technical Architecture

### Hardware (AURA-1 Device)
* **MCU:** ESP32-S3 (Pico package), 4GB MicroSD (SPIFFS / LittleFS fallback).
* **Display:** 1.54" E-Ink (200x200 pixels).
* **Peripherals:** Speaker, Microphone, Power Button, Sun Button.
* **Connectivity:** Primary Wi-Fi sync with PostgreSQL backend; offline queueing on local flash when disconnected.
* **Control Scheme:** 
  * Sun Button (Single Press): Cycle Project / Activity.
  * Sun Button (Long Press): Toggle Screensaver / Lore Quote mode.
  * Power Button (Single Press): Start / Pause / Stop Session.
  * Power Button (Long Press): Deep Sleep mode.

### Web Dashboard & Backend
* **Stack:** Vue 3 (Vite, Pinia), TailwindCSS, `@vueuse/motion`, Node.js/Express or Go API, PostgreSQL, Dockerized on Raspberry Pi behind Cloudflare (`aura.amygdala-inc.org`).
* **UI Layout:** Infinite spatial node-connected network dashboard. Smoothly pan between widgets while maintaining visible node edges. Fully responsive for iPad (13-inch M4) and mobile.
* **Progression & Systems:**
  * Global XP: Overall bond level with Kael'thos.
  * Discipline XP: Per-activity tracking (Astral Mechanics, Weaving the Veil, Deep Gnosis, Alchemical Code).
  * Cosmetic Unlocks: Aesthetic skins (Default Jiji, Halloween Pumpkin-head, Astrolabe Halo, Inverted Blood Moon) and UI themes.
  * Features: Habit heatmap node, timeblocking calendar node, and manual log entry (penalized to 50% XP yield).