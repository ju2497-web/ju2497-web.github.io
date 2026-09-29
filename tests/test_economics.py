import os
import unittest

from revenue_agent.compensation import parse_compensation
from revenue_agent.config import load_settings
from revenue_agent.economics import channel_rows, monthly_mix
from tests.helpers import make_root

FX = {"KRW_per_USD": 1380}


class EconomicsTests(unittest.TestCase):
    def setUp(self):
        self.root = make_root()
        (self.root / "data" / "private").mkdir(parents=True)
        (self.root / "data" / "private" / "profile.local.toml").write_text('''
[goals]
monthly_revenue_krw = 2000000
[[channels]]
id = "elearn"
name = "E-learning session"
rate = 800000
currency = "KRW"
unit = "session"
delivery_hours = 0.5
prep_hours = [4.5, 9.5]
basis = "fact"
[[channels]]
id = "call"
name = "Expert call"
rate = 200
currency = "USD"
unit = "hour"
delivery_hours = 1
prep_hours = [0, 0.5]
[mix]
elearn = 2
call = 1
''', encoding="utf-8")
        os.environ.pop("RA_PROFILE_LOCAL", None)
        self.s = load_settings(self.root)

    def test_private_overlay_merges(self):
        self.assertEqual(self.s.goal_krw, 2_000_000)
        self.assertEqual(len(self.s.profile["channels"]), 2)
        self.assertIn("expertise", self.s.profile)  # public keys kept

    def test_effective_hourly_includes_prep(self):
        rows = {r["id"]: r for r in channel_rows(self.s.profile, self.s.fx)}
        e = rows["elearn"]
        self.assertEqual(e["hourly_krw"], [80000, 160000])   # 790k / 10h … 790k / 5h
        self.assertEqual(e["face_hourly_krw"], 1_600_000)     # misleading "per recorded hour"
        self.assertEqual(rows["call"]["unit_krw"], 200 * self.s.fx["KRW_per_USD"])

    def test_monthly_mix(self):
        m = monthly_mix(self.s.profile, self.s.fx, self.s.goal_krw)
        self.assertEqual(m["total_krw"], 2 * 800000 + 200 * self.s.fx["KRW_per_USD"])
        self.assertEqual(m["hours"], [11.0, 21.5])
        self.assertEqual(m["gap_krw"], max(0, 2_000_000 - m["total_krw"]))

    def test_per_session_korean_rate(self):
        c = parse_compensation("차시당 80만원", FX)
        self.assertEqual((c["currency"], c["min"], c["unit"]), ("KRW", 800000, "project"))


if __name__ == "__main__":
    unittest.main()
