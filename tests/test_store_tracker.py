import unittest
from datetime import date

from revenue_agent.pipeline import build_opportunity
from revenue_agent.store import Store
from revenue_agent.tracker import Tracker, compute_metrics
from tests.helpers import make_root, settings_for


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.root = make_root()
        self.s = settings_for(self.root)

    def _opp(self, **kw):
        raw = {"organization": "ASLM", "title": "RFP for SME Molecular Diagnostics Course", "url": "https://aslm.org/rfp/1",
               "description": "Remote individual consultant.", "deadline": "2026-10-30"}
        raw.update(kw)
        return build_opportunity(raw, self.s)

    def test_dedupe_and_change_history(self):
        st = Store(self.root / "data" / "o.json")
        self.assertEqual(st.upsert(self._opp(), date(2026, 9, 29)), "new")
        self.assertEqual(st.upsert(self._opp(), date(2026, 9, 30)), "unchanged")
        self.assertEqual(st.upsert(self._opp(deadline="2026-11-15"), date(2026, 10, 1)), "changed")
        self.assertEqual(len(st.opps), 1)
        o = next(iter(st.opps.values()))
        self.assertEqual(o["deadline"], "2026-11-15")
        self.assertEqual(o["first_seen"], "2026-09-29")
        self.assertTrue(any(h["field"] == "deadline" and h["old"] == "2026-10-30" for h in o["history"]))

    def test_same_url_or_near_title_is_same(self):
        st = Store(self.root / "data" / "o.json")
        st.upsert(self._opp())
        # near-identical title → same record; the title change is logged, not duplicated
        self.assertEqual(st.upsert(self._opp(title="RFP for SME Molecular Diagnostics Course (Re-advertised)")), "changed")
        self.assertEqual(st.upsert(self._opp(title="Completely different title here", url="https://aslm.org/rfp/1")), "changed")
        self.assertEqual(len(st.opps), 1)

    def test_expiry_and_new_cycle(self):
        st = Store(self.root / "data" / "o.json")
        st.upsert(self._opp(deadline="2026-01-10"))
        self.assertEqual(st.mark_expired(date(2026, 9, 29)), 1)
        self.assertEqual(st.upsert(self._opp(deadline="2026-12-01")), "new_cycle")
        self.assertEqual(len(st.opps), 2)

    def test_save_roundtrip(self):
        st = Store(self.root / "data" / "o.json")
        st.upsert(self._opp())
        st.save()
        self.assertEqual(len(Store(self.root / "data" / "o.json").opps), 1)


class TrackerTests(unittest.TestCase):
    def test_flow_and_metrics(self):
        root = make_root()
        s = settings_for(root)
        o1 = build_opportunity({"organization": "Mercor", "title": "Hematology expert", "url": "https://m/1",
                                "description": "Remote. $100/hr", "category": "ai_expert"}, s)
        o1["id"], o1["first_seen"] = "a1", "2026-09-01"
        o2 = build_opportunity({"organization": "WHO", "title": "SME course", "url": "https://w/2", "description": "Remote"}, s)
        o2["id"], o2["first_seen"] = "b2", "2026-09-10"
        t = Tracker(root / "data" / "private" / "tracker.json", 10_000_000)
        t.set_status(o1, "APPLIED", on="2026-09-25")
        t.add_payment(o1, 500, "USD", s.fx, hours=5, on="2026-09-28")
        t.add_payment(o1, 100, "USD", s.fx, hours=1, on="2026-09-29")
        t.set_status(o2, "APPLIED", on="2026-09-26")
        t.set_status(o2, "OFFER", on="2026-09-28")
        t.set_expected("b2", 3_000_000, "KRW", s.fx)
        t.save()
        self.assertEqual(t.entries["a1"]["status"], "REPEAT CLIENT")
        self.assertEqual(t.entries["b2"]["follow_up"], "2026-10-06")
        m = compute_metrics(Tracker(t.path), {"a1": o1, "b2": o2}, s.fx, date(2026, 9, 29))
        self.assertEqual(m["actual_month_krw"], 600 * 1380)
        self.assertEqual(m["confirmed_krw"], 3_000_000)
        self.assertEqual(m["applications_week"], 2)
        self.assertEqual(m["conversion_rate"], 0.5)
        self.assertEqual(m["avg_hourly_krw"], 138000)
        self.assertEqual(m["days_to_payment"], 27)
        self.assertEqual(m["gap_krw"], 10_000_000 - 600 * 1380)
        self.assertEqual(m["by_pipeline"][o1["primary_pipeline"]], 600 * 1380)

    def test_merge_prefers_newer(self):
        root = make_root()
        t = Tracker(root / "t.json")
        t.entries["x"] = {"status": "APPLIED", "history": [{"date": "2026-09-01", "status": "APPLIED"}]}
        n = t.merge({"entries": {"x": {"status": "OFFER", "history": [{"date": "2026-09-20", "status": "OFFER"}]},
                                 "y": {"status": "FOUND", "history": [{"date": "2026-09-20", "status": "FOUND"}]}}})
        self.assertEqual(n, 2)
        self.assertEqual(t.entries["x"]["status"], "OFFER")

    def test_rejects_unknown_status(self):
        t = Tracker(make_root() / "t.json")
        with self.assertRaises(ValueError):
            t.set_status({"id": "z"}, "MAYBE")


if __name__ == "__main__":
    unittest.main()
