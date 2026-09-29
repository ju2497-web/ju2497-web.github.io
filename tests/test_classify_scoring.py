import unittest

from revenue_agent.pipeline import build_opportunity
from tests.helpers import make_root, settings_for


def opp(settings, **kw):
    raw = {"organization": "Org", "title": "Title", "url": "https://x.org/a/b", "description": "", "source_type": "manual"}
    raw.update(kw)
    return build_opportunity(raw, settings)


class ClassifyScoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = settings_for(make_root())

    def test_premium_sme_is_top_priority(self):
        o = opp(self.s, organization="World Health Organization", title="Subject Matter Expert – Molecular Diagnostics e-learning course (home-based)",
                description="International consultant, remote, open to all nationalities. USD 150 per hour. Cytogenetics and hematology content, assessment design. Framework agreement.")
        self.assertEqual(o["priority"], "S", o["score_breakdown"])
        self.assertIn("A", o["pipelines"])
        self.assertEqual(o["korea_eligible"], "yes")
        self.assertEqual(o["remote"], "remote")
        self.assertEqual(o["recommendation"], "RECOMMENDED")

    def test_us_only_not_recommended(self):
        o = opp(self.s, title="Hematology Expert", description="Must be authorized to work in the United States. $150/hr remote.")
        self.assertEqual(o["priority"], "X")
        self.assertEqual(o["recommendation"], "NOT RECOMMENDED")
        self.assertEqual(o["korea_eligible"], "no")
        self.assertTrue(o["not_recommended_reason"])

    def test_national_vs_international_consultant(self):
        n = opp(self.s, title="National Consultant – Laboratory Training", description="Kenyan nationals only.")
        self.assertIn("national_only", n["flags"])
        i = opp(self.s, title="International Consultant – Laboratory Training", description="Remote.")
        self.assertNotIn("national_only", i["flags"])

    def test_physician_license_and_unpaid(self):
        self.assertIn("physician_license", opp(self.s, title="Medical reviewer", description="Active medical license required.")["flags"])
        u = opp(self.s, title="Laboratory curriculum volunteer", description="This is an unpaid volunteer role.")
        self.assertEqual(u["priority"], "X")

    def test_firm_only_becomes_subcontract_lead(self):
        o = opp(self.s, organization="African Development Bank", title="Framework agreement for e-learning services on laboratory quality",
                description="Consulting firms are invited to submit expressions of interest. Health laboratory training.")
        self.assertIn(o["procurement_type"], ("firm_only", "consortium"))
        self.assertEqual(o["subcontract"]["label"], "POTENTIAL SME SUBCONTRACTING LEAD")
        self.assertTrue(o["subcontract"]["likely_primes"])
        self.assertNotEqual(o["priority"], "X")  # not discarded

    def test_instructional_design_not_rejected(self):
        o = opp(self.s, title="E-learning course development (SCORM, Articulate Storyline) – laboratory biosafety",
                description="Individual consultant. Remote.")
        self.assertNotEqual(o["priority"], "X")
        self.assertIn("Subject Matter Expert", o["roles_for_me"])

    def test_unrelated_programming(self):
        o = opp(self.s, title="Senior Software Engineer", description="Build backend systems. $200/hr")
        self.assertEqual(o["priority"], "X")

    def test_score_bounds_and_breakdown(self):
        o = opp(self.s, title="Anything")
        self.assertTrue(0 <= o["score"] <= 100)
        self.assertEqual(set(o["score_breakdown"]), {"fit", "compensation", "korea", "remote", "conversion", "speed", "effort", "interview", "recurring"})
        self.assertEqual(o["estimates"]["basis"], "estimate")


if __name__ == "__main__":
    unittest.main()
