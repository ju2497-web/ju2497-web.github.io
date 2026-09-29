"""Private application tracker + revenue metrics (stored outside git by default)."""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from .compensation import to_usd, usd_to_krw
from .textutil import today

STAGES = ["FOUND", "VERIFIED", "HIGH PRIORITY", "PREPARING", "APPLIED", "ASSESSMENT", "INTERVIEW",
          "OFFER", "PAID", "REPEAT CLIENT"]
CLOSED_STAGES = ["REJECTED", "NOT SUITABLE", "DECLINED", "WITHDRAWN"]
ALL_STAGES = STAGES + CLOSED_STAGES
APPLIED_OR_LATER = set(STAGES[STAGES.index("APPLIED"):])
ACTIVE = set(STAGES[:STAGES.index("OFFER") + 1])
# Probability that a pipeline item turns into cash (ESTIMATE, used for "expected revenue")
STAGE_PROBABILITY = {"FOUND": 0.02, "VERIFIED": 0.03, "HIGH PRIORITY": 0.05, "PREPARING": 0.1, "APPLIED": 0.15,
                     "ASSESSMENT": 0.3, "INTERVIEW": 0.45, "OFFER": 0.8}
HOURS_FOR_POTENTIAL = {"hour": 20, "day": 10, "week": 2, "month": 1, "year": 1 / 12, "project": 1}


class Tracker:
    def __init__(self, path: Path, goal_krw: int = 10_000_000):
        self.path = Path(path)
        self.data = {"version": 1, "updated": None, "goal_monthly_krw": goal_krw, "entries": {}}
        if self.path.exists():
            self.data.update(json.loads(self.path.read_text(encoding="utf-8")))

    @property
    def entries(self) -> dict:
        return self.data["entries"]

    def set_status(self, opp: dict, status: str, note: str = "", follow_up: str | None = None,
                   on: str | None = None) -> dict:
        status = status.upper()
        if status not in ALL_STAGES:
            raise ValueError(f"status must be one of {ALL_STAGES}")
        day = on or today().isoformat()
        e = self.entries.setdefault(opp["id"], {
            "title": opp.get("title"), "organization": opp.get("organization"),
            "pipeline": opp.get("primary_pipeline"), "date_discovered": opp.get("first_seen", day),
            "history": [], "payments": [],
        })
        e["status"] = status
        e["history"].append({"date": day, "status": status, "note": note})
        if status == "APPLIED" and not e.get("date_applied"):
            e["date_applied"] = day
        if follow_up:
            e["follow_up"] = follow_up
        elif status == "APPLIED" and not e.get("follow_up"):
            e["follow_up"] = (date.fromisoformat(day) + timedelta(days=10)).isoformat()
        return e

    def set_expected(self, opp_id: str, amount: float, currency: str, fx: dict) -> None:
        e = self.entries[opp_id]
        e["expected"] = {"amount": amount, "currency": currency.upper(), "krw": _krw(amount, currency, fx)}

    def add_payment(self, opp: dict, amount: float, currency: str, fx: dict, hours: float | None = None,
                    note: str = "", on: str | None = None) -> dict:
        day = on or today().isoformat()
        e = self.entries.get(opp["id"]) or self.set_status(opp, "PAID", on=day)
        prior_paid = bool(e.get("payments"))
        e.setdefault("payments", []).append({"date": day, "amount": amount, "currency": currency.upper(),
                                             "krw": _krw(amount, currency, fx), "hours": hours, "note": note})
        new_status = "REPEAT CLIENT" if prior_paid else "PAID"
        if e.get("status") != new_status:
            e["status"] = new_status
            e["history"].append({"date": day, "status": new_status, "note": "payment recorded"})
        return e

    def merge(self, other: dict) -> int:
        """Merge an exported tracker (e.g. from the dashboard). Newer history wins per entry."""
        n = 0
        for oid, e in (other.get("entries") or {}).items():
            mine = self.entries.get(oid)
            last_theirs = (e.get("history") or [{}])[-1].get("date", "")
            last_mine = (mine.get("history") or [{}])[-1].get("date", "") if mine else ""
            if not mine or last_theirs >= last_mine:
                self.entries[oid] = e
                n += 1
        return n

    def save(self) -> None:
        self.data["updated"] = today().isoformat()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _krw(amount: float, currency: str, fx: dict) -> float:
    usd = to_usd(float(amount), currency, fx)
    return round(usd_to_krw(usd, fx)) if usd is not None else float(amount)


def potential_krw(opp: dict, fx: dict) -> float:
    """Rough monthly value of one opportunity (ESTIMATE) from disclosed or estimated pay."""
    comp = opp.get("compensation") or {}
    src = comp if comp.get("min") else (opp.get("comp_estimate") or {})
    if not src.get("min"):
        return 0.0
    mid = (src["min"] + (src.get("max") or src["min"])) / 2
    mult = HOURS_FOR_POTENTIAL.get(src.get("unit"), 1)
    if opp.get("procurement_type") in ("firm_only", "consortium"):
        mult *= 0.1  # SME share of a firm contract
    return _krw(mid * mult, src.get("currency") or "USD", fx)


def compute_metrics(tracker: Tracker, opps: dict, fx: dict, ref: date | None = None) -> dict:
    ref = ref or today()
    month = ref.strftime("%Y-%m")
    week_ago = (ref - timedelta(days=7)).isoformat()
    goal = int(tracker.data.get("goal_monthly_krw") or 10_000_000)
    m = {"goal_krw": goal, "actual_month_krw": 0.0, "actual_total_krw": 0.0, "confirmed_krw": 0.0,
         "pipeline_krw": 0.0, "expected_krw": 0.0, "applications_week": 0, "active": 0,
         "by_pipeline": {}, "hours": 0.0, "avg_hourly_krw": None, "conversion_rate": None,
         "days_to_payment": None, "follow_ups_due": []}
    applied_n = paid_n = 0
    lead_times = []
    for oid, e in tracker.entries.items():
        status = e.get("status")
        opp = opps.get(oid, {})
        value = (e.get("expected") or {}).get("krw") or potential_krw(opp, fx)
        if status in ACTIVE:
            m["active"] += 1
            if status not in ("FOUND", "VERIFIED"):
                m["pipeline_krw"] += value
                m["expected_krw"] += value * STAGE_PROBABILITY.get(status, 0)
        if status == "OFFER":
            m["confirmed_krw"] += value
        if any(h["status"] == "APPLIED" and h["date"] >= week_ago for h in e.get("history", [])):
            m["applications_week"] += 1
        if status in APPLIED_OR_LATER or any(h["status"] in APPLIED_OR_LATER for h in e.get("history", [])):
            applied_n += 1
        pays = e.get("payments") or []
        if pays:
            paid_n += 1
            first = min(p["date"] for p in pays)
            if e.get("date_discovered"):
                lead_times.append((date.fromisoformat(first) - date.fromisoformat(e["date_discovered"])).days)
        for p in pays:
            m["actual_total_krw"] += p["krw"]
            if p["date"].startswith(month):
                m["actual_month_krw"] += p["krw"]
            pipe = e.get("pipeline") or "?"
            m["by_pipeline"][pipe] = m["by_pipeline"].get(pipe, 0) + p["krw"]
            m["hours"] += p.get("hours") or 0
        if e.get("follow_up") and e["follow_up"] <= ref.isoformat() and status in ACTIVE:
            m["follow_ups_due"].append({"id": oid, "title": e.get("title"), "follow_up": e["follow_up"]})
    if m["hours"]:
        paid_with_hours = sum(p["krw"] for e in tracker.entries.values() for p in e.get("payments", []) if p.get("hours"))
        m["avg_hourly_krw"] = round(paid_with_hours / m["hours"])
    if applied_n:
        m["conversion_rate"] = round(paid_n / applied_n, 3)
    if lead_times:
        m["days_to_payment"] = round(sum(lead_times) / len(lead_times), 1)
    m["gap_krw"] = max(0.0, goal - m["actual_month_krw"])
    m["gap_after_confirmed_krw"] = max(0.0, goal - m["actual_month_krw"] - m["confirmed_krw"])
    return {k: (round(v) if isinstance(v, float) and k not in ("conversion_rate", "days_to_payment") else v) for k, v in m.items()}
