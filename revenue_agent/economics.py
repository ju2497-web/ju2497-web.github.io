"""Revenue structure: effective hourly rate per channel and a monthly target mix."""
from __future__ import annotations

from .compensation import to_usd, usd_to_krw


def _krw(rate: float, currency: str, fx: dict) -> float:
    if currency.upper() == "KRW":
        return float(rate)
    return usd_to_krw(to_usd(float(rate), currency, fx), fx)


def channel_rows(profile: dict, fx: dict) -> list[dict]:
    rows = []
    for c in profile.get("channels", []):
        unit_krw = _krw(c["rate"], c.get("currency", "KRW"), fx)
        lo_prep, hi_prep = c.get("prep_hours", [0, 0])
        deliver = float(c.get("delivery_hours", 1))
        best = unit_krw / (deliver + lo_prep)
        worst = unit_krw / (deliver + hi_prep)
        rows.append({
            "id": c["id"], "name": c["name"], "pipeline": c.get("pipeline"), "unit": c["unit"],
            "rate": c["rate"], "currency": c.get("currency", "KRW"), "unit_krw": round(unit_krw),
            "hours_per_unit": [round(deliver + lo_prep, 2), round(deliver + hi_prep, 2)],
            "hourly_krw": [round(worst), round(best)],
            "face_hourly_krw": round(unit_krw / deliver),
            "basis": c.get("basis", "estimate"), "source": c.get("source", ""), "cap": c.get("cap", ""),
        })
    return sorted(rows, key=lambda r: -(r["hourly_krw"][0] + r["hourly_krw"][1]))


def monthly_mix(profile: dict, fx: dict, goal_krw: int) -> dict:
    by_id = {r["id"]: r for r in channel_rows(profile, fx)}
    lines, total, hours_lo, hours_hi = [], 0.0, 0.0, 0.0
    for cid, qty in (profile.get("mix") or {}).items():
        r = by_id.get(cid)
        if not r or not qty:
            continue
        revenue = r["unit_krw"] * qty
        h_lo, h_hi = r["hours_per_unit"][0] * qty, r["hours_per_unit"][1] * qty
        lines.append({"id": cid, "name": r["name"], "qty": qty, "unit": r["unit"], "revenue_krw": round(revenue),
                      "hours": [round(h_lo, 1), round(h_hi, 1)], "basis": r["basis"]})
        total += revenue
        hours_lo += h_lo
        hours_hi += h_hi
    return {"lines": lines, "total_krw": round(total), "goal_krw": goal_krw,
            "gap_krw": round(max(0, goal_krw - total)), "hours": [round(hours_lo, 1), round(hours_hi, 1)],
            "blended_hourly_krw": [round(total / hours_hi) if hours_hi else 0, round(total / hours_lo) if hours_lo else 0]}
