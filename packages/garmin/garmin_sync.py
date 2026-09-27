"""The Hunt's link to Garmin.

Pulls activities and each day's recovery from Garmin Connect with
python-garminconnect, and posts them to the API's ingest route on the compose
network. Every 30 minutes, and whenever the API asks (POST /pull on :8765).

    python garmin_sync.py login   # once, interactively: password and MFA code
    python garmin_sync.py         # the loop
"""
import json
import os
import sys
import threading
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

API = os.getenv("API_URL", "http://api:3000/api/v1")
TOKENS = os.getenv("GARMINTOKENS", "/tokens")
EVERY = int(os.getenv("GARMIN_EVERY_MINUTES", "30")) * 60
# The first pull reaches back this far, later ones only a week.
FIRST_DAYS = int(os.getenv("GARMIN_FIRST_DAYS", "400"))
MARK = os.path.join(TOKENS, "pulled_once")

KINDS = {
    "run": ("running", "trail_running", "treadmill_running", "track_running", "street_running", "indoor_running",
            "virtual_run", "ultra_run"),
    "stairs": ("stair_climbing", "floor_climbing", "stairs", "indoor_stair_climbing"),
    "boulder": ("bouldering", "indoor_climbing", "rock_climbing", "climbing"),
    "strength": ("strength_training", "indoor_cardio", "hiit", "fitness_equipment"),
}
KCAL = 4.184


def dig(d, *path):
    """d[path[0]][path[1]]..., or None anywhere along the way."""
    for p in path:
        if isinstance(d, dict):
            d = d.get(p)
        elif isinstance(d, list) and isinstance(p, int) and -len(d) <= p < len(d):
            d = d[p]
        else:
            return None
    return d


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def kind_of(type_key):
    for kind, keys in KINDS.items():
        if type_key in keys:
            return kind
    return "other"


def parse_activity(a):
    """A Garmin activity summary as the API's GarminActivity."""
    started = a.get("startTimeGMT")
    if not started or a.get("activityId") is None:
        return None
    at = datetime.strptime(started, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    kcal = num(a.get("calories")) or 0
    active = kcal - (num(a.get("bmrCalories")) or 0)
    hr_avg, hr_max = num(a.get("averageHR")), num(a.get("maxHR"))
    return {
        "id": str(a["activityId"]),
        "kind": kind_of(dig(a, "activityType", "typeKey")),
        "name": (a.get("activityName") or "")[:120],
        "startedAt": at.isoformat().replace("+00:00", ".000Z"),
        "seconds": int(num(a.get("duration")) or 0),
        "meters": float(num(a.get("distance")) or 0),
        "ascent": float(num(a.get("elevationGain")) or 0),
        "hrAvg": round(hr_avg) if hr_avg else None,
        "hrMax": round(hr_max) if hr_max else None,
        "kj": round(max(active, 0) * KCAL, 1),
        "load": num(a.get("activityTrainingLoad")),
        "zones": [float(num(a.get(f"hrTimeInZone_{z}")) or 0) for z in range(1, 6)],
    }


def parse_day(cdate, readiness, hrv, sleep, summary, status):
    """One day's recovery from the five calls that carry it."""
    ready = readiness if isinstance(readiness, dict) else dig(readiness, 0)
    hrv_status = (dig(hrv, "hrvSummary", "status") or "").lower()
    acute = chronic = None
    for dev in (dig(status, "mostRecentTrainingStatus", "latestTrainingStatusData") or {}).values():
        acute = num(dig(dev, "acuteTrainingLoadDTO", "dailyTrainingLoadAcute")) or acute
        chronic = num(dig(dev, "acuteTrainingLoadDTO", "dailyTrainingLoadChronic")) or chronic
    battery = num(dig(summary, "bodyBatteryAtWakeTime")) or num(dig(summary, "bodyBatteryHighestValue"))
    score = num(dig(ready, "score"))
    sleep_score = num(dig(sleep, "dailySleepDTO", "sleepScores", "overall", "value"))
    rhr = num(dig(summary, "restingHeartRate"))
    return {
        "date": cdate,
        "readiness": round(score) if score is not None else None,
        "hrvStatus": hrv_status if hrv_status in ("balanced", "unbalanced", "low", "poor") else None,
        "sleepScore": round(sleep_score) if sleep_score is not None else None,
        "bodyBattery": round(battery) if battery is not None else None,
        "restingHr": round(rhr) if rhr is not None else None,
        "acuteLoad": acute,
        "chronicLoad": chronic,
    }


def parse_weight(composition):
    grams = num(dig(composition, "totalAverage", "weight"))
    return round(grams / 1000, 1) if grams else None


def client(prompt=None):
    from garminconnect import Garmin

    g = Garmin(os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD"), prompt_mfa=prompt)
    g.login(TOKENS)
    return g


def quietly(f, *args):
    """One missing metric (no watch worn, no HRV yet) must not lose the rest."""
    try:
        return f(*args)
    except Exception as e:  # noqa: BLE001 - Garmin's errors are many and unnamed
        print(f"  {f.__name__}{args}: {e}", flush=True)
        return None


def pull():
    g = client()
    today = date.today()
    back = 7 if os.path.exists(MARK) else FIRST_DAYS
    start = (today - timedelta(days=back)).isoformat()
    acts = [x for x in (parse_activity(a) for a in g.get_activities_by_date(start, today.isoformat())) if x]
    days = []
    # The recovery chart shows fourteen nights: the first pull fills a month.
    for i in range(7 if back == 7 else 30):
        d = (today - timedelta(days=i)).isoformat()
        days.append(parse_day(d, quietly(g.get_morning_training_readiness, d) or quietly(g.get_training_readiness, d),
                              quietly(g.get_hrv_data, d), quietly(g.get_sleep_data, d), quietly(g.get_user_summary, d),
                              quietly(g.get_training_status, d)))
    weight = parse_weight(quietly(g.get_body_composition, (today - timedelta(days=30)).isoformat(), today.isoformat()))
    body = json.dumps({"activities": acts, "days": days, "bodyweight": weight}).encode()
    req = urllib.request.Request(f"{API}/hunt/garmin", data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()
    open(MARK, "w").close()
    print(f"{datetime.now():%H:%M} {len(acts)} activities, {len(days)} days, weight {weight}", flush=True)


lock = threading.Lock()


def pull_once():
    if not lock.acquire(blocking=False):
        return
    try:
        pull()
    except Exception as e:  # noqa: BLE001 - keep the loop alive; the next pull may work
        print(f"pull failed: {e}", flush=True)
    finally:
        lock.release()


class Ask(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/pull":
            self.send_response(404)
            self.end_headers()
            return
        threading.Thread(target=pull_once, daemon=True).start()
        self.send_response(202)
        self.end_headers()

    def log_message(self, *args):
        pass


def main():
    if sys.argv[1:] == ["login"]:
        client(prompt=lambda: input("MFA code: "))
        print(f"Logged in; tokens kept in {TOKENS}.")
        return
    threading.Thread(target=HTTPServer(("0.0.0.0", 8765), Ask).serve_forever, daemon=True).start()
    while True:
        pull_once()
        time.sleep(EVERY)


if __name__ == "__main__":
    main()
