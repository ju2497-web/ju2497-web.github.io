import json
import os
import unittest

from revenue_agent.__main__ import build_outputs
from revenue_agent.pipeline import run
from revenue_agent.store import Store
from revenue_agent.tracker import Tracker
from tests.helpers import ENV, make_root, settings_for, fetcher


class EndToEndTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["RA_TODAY"] = "2026-09-29"
        cls.root = make_root()
        cls.s = settings_for(cls.root)
        cls.fetch = fetcher()
        cls.report = run(cls.s, fetcher=cls.fetch, env=ENV)
        cls.store = Store(cls.s.store_path)
        cls.by_title = {o["title"]: o for o in cls.store.opps.values()}

    @classmethod
    def tearDownClass(cls):
        os.environ.pop("RA_TODAY", None)

    def find(self, part):
        hits = [o for t, o in self.by_title.items() if part in t]
        self.assertTrue(hits, f"missing {part}")
        return hits[0]

    def test_every_source_ran(self):
        status = {s["id"]: s["status"] for s in self.report["sources"]}
        self.assertEqual(status.pop("off"), "disabled")
        self.assertTrue(all(v == "ok" for v in status.values()), self.report["sources"])

    def test_reliefweb(self):
        o = self.find("Laboratory Medicine e-Learning Course Author")
        self.assertEqual(o["organization"], "World Health Organization")
        self.assertEqual(o["deadline"], "2026-10-20")
        self.assertEqual(o["compensation"]["unit"], "day")
        self.assertEqual(o["korea_eligible"], "yes")
        self.assertIn(o["priority"], ("S", "A"))
        n = self.find("National Consultant")
        self.assertEqual(n["priority"], "X")

    def test_worldbank_firm_and_individual(self):
        firm = self.find("E-learning Curriculum for Laboratory Personnel")
        self.assertIn(firm["procurement_type"], ("firm_only", "consortium"))
        self.assertIsNotNone(firm["subcontract"])
        ind = self.find("Individual Consultant – Laboratory Training Specialist")
        self.assertEqual(ind["procurement_type"], "individual")

    def test_ats_boards(self):
        gh = self.find("Medical Expert – AI Training")
        self.assertEqual(gh["compensation"]["min"], 90)
        self.assertIn("B", gh["pipelines"])
        self.assertEqual(gh["interview"], "none")  # "no live interview" is not a live interview
        self.assertNotIn("Senior Software Engineer, Infrastructure", self.by_title)  # filtered by include_title
        lv = self.find("Korean Life Sciences Expert Reviewer")
        self.assertEqual((lv["compensation"]["min"], lv["compensation"]["unit"]), (45, "hour"))
        us = self.find("Hematology Expert (Professor / PhD)")
        self.assertEqual(us["priority"], "X")  # US-only despite $120–160/h
        bio = self.find("Biology PhD Expert")
        self.assertEqual(bio["interview"], "ai_or_async")
        self.assertIn(bio["priority"], ("S", "A"))

    def test_g2b(self):
        o = self.find("임상병리 직무 이러닝")
        self.assertEqual(o["korea_eligible"], "yes")
        self.assertEqual(o["compensation"]["min"], 80_000_000)
        self.assertEqual(o["deadline"], "2026-10-14")
        self.assertIsNotNone(o["subcontract"])
        self.assertIn("%2B", self.fetch.calls[[i for i, c in enumerate(self.fetch.calls) if "data.go.kr" in c][0]])

    def test_rss_google_alert(self):
        o = self.find("Cytogenetics Online Course")
        self.assertEqual(o["url"], "https://example-lab-academy.org/calls/cytogenetics-sme")
        self.assertEqual(o["deadline"], "2026-10-15")
        self.assertEqual(o["compensation"]["project_usd"], 3000)

    def test_pagewatch(self):
        o = self.find("Molecular Diagnostics e-Learning Course")
        self.assertEqual(o["deadline"], "2026-10-30")
        self.assertEqual(o["compensation"]["status"], "APPLICANT-PROPOSED RATE")
        self.assertEqual(o["verification"], "listed_on_official_page")
        self.assertFalse(any("Finance Officer" in t or "Twitter" in t or "script" in t for t in self.by_title))

    def test_rerun_is_idempotent(self):
        before = len(self.store.opps)
        report = run(self.s, fetcher=fetcher(), env=ENV)
        self.assertEqual(report["counts"]["new"], 0)
        self.assertEqual(len(Store(self.s.store_path).opps), before)

    def test_outputs_and_privacy(self):
        t = Tracker(self.s.tracker_path)
        any_opp = next(iter(self.store.opps.values()))
        t.set_status(any_opp, "APPLIED")
        t.add_payment(any_opp, 123456, "KRW", self.s.fx)
        t.save()
        build_outputs(self.s)
        public = self.s.public_dashboard.read_text(encoding="utf-8")
        local = self.s.local_dashboard.read_text(encoding="utf-8")
        payload = json.loads(public.split('<script id="data" type="application/json">')[1].split("</script>")[0])
        self.assertIsNone(payload["tracker"])  # personal data never in the public file
        self.assertIsNone(payload["economics"])  # contract rates stay local
        self.assertNotIn("123456", public)
        self.assertIn("123456", local)
        for label in ("지금 지원", "오늘 신규", "마감 임박", "글로벌 고단가 러닝", "AI 전문가", "전문가 자문", "이러닝",
                      "의생명 SME", "하도급 리드", "관찰", "지원함", "제외"):
            self.assertIn(label, public)
        pkgs = list(self.s.packages_dir.glob("*.md"))
        self.assertTrue(pkgs)
        text = pkgs[0].read_text(encoding="utf-8")
        self.assertIn("교수님 승인 후", text)
        self.assertIn("[ ]", text)  # unverified evidence stays a placeholder


if __name__ == "__main__":
    unittest.main()
