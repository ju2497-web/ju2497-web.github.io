import unittest

from revenue_agent.compensation import APPLICANT_PROPOSED, DISCLOSED, NOT_DISCLOSED, format_comp, parse_compensation

FX = {"KRW_per_USD": 1380, "USD_per_EUR": 1.08}


class CompensationTests(unittest.TestCase):
    def test_hourly_range(self):
        c = parse_compensation("Pay: $75-$120/hr", FX)
        self.assertEqual((c["status"], c["min"], c["max"], c["unit"], c["basis"]), (DISCLOSED, 75, 120, "hour", "fact"))
        self.assertAlmostEqual(c["hourly_usd"], 97.5)

    def test_monthly_and_daily(self):
        self.assertEqual(parse_compensation("USD 7,000 – 9,980 per month", FX)["unit"], "month")
        d = parse_compensation("remuneration of USD 400 per day", FX)
        self.assertEqual((d["unit"], d["hourly_usd"]), ("day", 50))

    def test_euro_converted(self):
        c = parse_compensation("EUR 500/day", FX)
        self.assertEqual(c["currency"], "EUR")
        self.assertAlmostEqual(c["hourly_usd"], 67.5)

    def test_korean(self):
        self.assertEqual(parse_compensation("시간당 5만원", FX)["unit"], "hour")
        p = parse_compensation("추정가격 50,000,000원", FX)
        self.assertEqual((p["currency"], p["unit"], p["min"]), ("KRW", "project", 50_000_000))

    def test_applicant_proposed(self):
        c = parse_compensation("Submit a financial proposal indicating your daily consultancy fee.", FX)
        self.assertEqual(c["status"], APPLICANT_PROPOSED)
        self.assertIsNone(c["min"])

    def test_never_invents(self):
        for text in ("no info here", "Deadline 2026, 25 staff", "Apply by 3 October"):
            c = parse_compensation(text, FX)
            self.assertEqual(c["status"], NOT_DISCLOSED, text)
            self.assertIsNone(c["min"])

    def test_unpaid_flag(self):
        self.assertTrue(parse_compensation("This is an unpaid volunteer role", FX)["unpaid"])

    def test_structured_wins(self):
        c = parse_compensation("$10/hr in text", FX, {"min": 100, "max": 150, "currency": "USD", "unit": "hour"})
        self.assertEqual(c["min"], 100)

    def test_format_keeps_original_currency(self):
        s = format_comp(parse_compensation("USD 400 per day", FX), FX)
        self.assertIn("USD 400/일", s)
        self.assertIn("만원", s)
        self.assertIn("COMPENSATION NOT DISCLOSED", format_comp(parse_compensation("", FX), FX))


if __name__ == "__main__":
    unittest.main()
