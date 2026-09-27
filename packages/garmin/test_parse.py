import json
import pathlib
import unittest

from garmin_sync import kind_of, parse_activity, parse_day, parse_weight

FIX = pathlib.Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIX / f"{name}.json").read_text())


class Parse(unittest.TestCase):
    def test_a_long_run(self):
        a = parse_activity(load("activities")[0])
        self.assertEqual(a["id"], "20571234567")
        self.assertEqual(a["kind"], "run")
        self.assertEqual(a["startedAt"], "2026-09-20T07:02:11.000Z")
        self.assertEqual(a["seconds"], 11400)
        self.assertEqual(a["meters"], 31500.0)
        self.assertEqual(a["hrAvg"], 149)
        # Active calories only: the body's own upkeep is not the hunt's.
        self.assertEqual(a["kj"], round((2600 - 190) * 4.184, 1))
        self.assertEqual(a["zones"], [600.0, 5000.0, 4800.0, 900.0, 100.0])

    def test_stairs_and_iron(self):
        acts = [parse_activity(x) for x in load("activities")]
        self.assertEqual([a["kind"] for a in acts], ["run", "stairs", "strength", "boulder"])
        self.assertIsNone(acts[2]["load"])

    def test_unknown_types_are_other(self):
        self.assertEqual(kind_of("paddleboarding"), "other")
        self.assertEqual(kind_of(None), "other")

    def test_a_day(self):
        d = parse_day("2026-09-26", load("readiness"), load("hrv"), load("sleep"), load("summary"), load("status"))
        self.assertEqual(d, {"date": "2026-09-26", "readiness": 64, "hrvStatus": "balanced", "sleepScore": 81,
                             "bodyBattery": 72, "restingHr": 46, "acuteLoad": 912.0, "chronicLoad": 780.5})

    def test_an_empty_day(self):
        d = parse_day("2026-09-26", None, None, None, None, None)
        self.assertEqual(d["readiness"], None)
        self.assertEqual(d["hrvStatus"], None)

    def test_weight(self):
        self.assertEqual(parse_weight({"totalAverage": {"weight": 75430.0}}), 75.4)
        self.assertIsNone(parse_weight({"totalAverage": {"weight": None}}))


if __name__ == "__main__":
    unittest.main()
