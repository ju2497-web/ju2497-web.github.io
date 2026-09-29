"""Compensation extraction. Never invents numbers: unparsed pay stays NOT DISCLOSED."""
from __future__ import annotations

import re

NOT_DISCLOSED = "COMPENSATION NOT DISCLOSED"
APPLICANT_PROPOSED = "APPLICANT-PROPOSED RATE"
DISCLOSED = "DISCLOSED"

HOURS_PER_UNIT = {"hour": 1, "day": 8, "week": 40, "month": 160, "year": 2000}

_NUM = r"(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(k|K)?"
_CUR_PRE = r"(US\$|USD|\$|€|EUR|£|GBP|CHF|KRW|₩)"
_UNIT = (r"(?:\s*(?:/|per|an|a)\s*|\s+)"
         r"(hour|hr|h\b|day|daily|week|month|mo\b|year|yr|annum|annual|project|assignment|lump[- ]sum|contract)")

_PAT_RANGE = re.compile(_CUR_PRE + r"\s?" + _NUM + r"\s*(?:-|–|—|to)\s*" + r"(?:US\$|USD|\$|€|EUR|£|GBP|CHF|KRW|₩)?\s?" + _NUM + r"(?:" + _UNIT + r")?", re.I)
_PAT_SINGLE = re.compile(_CUR_PRE + r"\s?" + _NUM + r"(?:\+)?(?:" + _UNIT + r")?", re.I)
_PAT_POST = re.compile(_NUM + r"\s*(USD|EUR|GBP|CHF|KRW)(?:" + _UNIT + r")?", re.I)
_PAT_HOURLY_WORD = re.compile(r"(hourly|daily|monthly) (?:rate|fee|pay)[^.\d]{0,20}" + _CUR_PRE + r"\s?" + _NUM, re.I)
# Korean: 시간당 5만원 / 건당 100만원 / 1,000,000원 / 3억원
_PAT_KR = re.compile(r"(시간당|시급|일당|월|건당|회당|과제당|차시당|총)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(억|천만|백만|만)?\s*원")

_PROPOSED = re.compile(
    r"(propose|proposal|quote|indicate|state|submit)\w*\s+(?:your\s+|a\s+|the\s+)?(?:\w+\s+){0,3}(?:daily|hourly|monthly)?\s*(?:consultancy\s+)?(?:fee|rate|price|financial offer)"
    r"|financial (?:proposal|offer)|daily consultancy fee|expected (?:fee|rate)|all-inclusive (?:daily )?fee|견적|제안 ?금액|희망 ?보수",
    re.I,
)
_UNPAID = re.compile(r"\b(unpaid|volunteer(?:ing)? (?:role|position|opportunity)|no compensation|pro bono|commission[- ]only)\b", re.I)


def _num(raw: str, k: str | None) -> float:
    value = float(re.sub(r"[,\s]", "", raw))
    return value * 1000 if k else value


def _cur(token: str) -> str:
    t = (token or "").upper()
    if t in ("$", "US$", "USD"):
        return "USD"
    if t in ("€", "EUR"):
        return "EUR"
    if t in ("£", "GBP"):
        return "GBP"
    if t in ("₩", "KRW"):
        return "KRW"
    return t or "USD"


def _unit(token: str | None) -> str:
    t = (token or "").lower()
    if t in ("hour", "hr", "h"):
        return "hour"
    if t in ("day", "daily"):
        return "day"
    if t == "week":
        return "week"
    if t in ("month", "mo"):
        return "month"
    if t in ("year", "yr", "annum", "annual"):
        return "year"
    if t in ("project", "assignment", "lump-sum", "lump sum", "contract"):
        return "project"
    return "unknown"


def to_usd(amount: float, currency: str, fx: dict) -> float | None:
    currency = currency.upper()
    if currency == "USD":
        return amount
    if currency == "KRW":
        return amount / float(fx.get("KRW_per_USD", 1380))
    key = f"USD_per_{currency}"
    if key in fx:
        return amount * float(fx[key])
    return None


def usd_to_krw(amount_usd: float, fx: dict) -> float:
    return amount_usd * float(fx.get("KRW_per_USD", 1380))


def parse_compensation(text: str, fx: dict, structured: dict | None = None) -> dict:
    """Return a compensation dict. `structured` (from APIs) wins over free text."""
    result = {
        "status": NOT_DISCLOSED, "text": "", "min": None, "max": None, "currency": None,
        "unit": "unknown", "hourly_usd": None, "project_usd": None, "basis": "unknown",
        "unpaid": bool(_UNPAID.search(text or "")),
    }
    if structured and structured.get("min"):
        result.update({k: structured.get(k) for k in ("min", "max", "currency", "unit")})
        result["text"] = structured.get("text") or ""
        result["status"], result["basis"] = DISCLOSED, "fact"
        return _derive(result, fx)

    text = text or ""
    candidates = []
    for m in _PAT_RANGE.finditer(text):
        lo, hi = _num(m[2], m[3]), _num(m[4], m[5])
        candidates.append((m.group(0), _cur(m[1]), min(lo, hi), max(lo, hi), _unit(m[6])))
    if not candidates:
        for m in _PAT_HOURLY_WORD.finditer(text):
            unit = {"hourly": "hour", "daily": "day", "monthly": "month"}[m[1].lower()]
            v = _num(m[3], m[4])
            candidates.append((m.group(0), _cur(m[2]), v, v, unit))
        for m in _PAT_SINGLE.finditer(text):
            v = _num(m[2], m[3])
            candidates.append((m.group(0), _cur(m[1]), v, v, _unit(m[4])))
        for m in _PAT_POST.finditer(text):
            v = _num(m[1], m[2])
            candidates.append((m.group(0), _cur(m[3]), v, v, _unit(m[4])))
    for m in _PAT_KR.finditer(text):
        mult = {"억": 1e8, "천만": 1e7, "백만": 1e6, "만": 1e4, None: 1}[m[3]]
        v = float(m[2].replace(",", "")) * mult
        unit = {"시간당": "hour", "시급": "hour", "일당": "day", "월": "month", "건당": "project",
                "회당": "project", "과제당": "project", "차시당": "project", "총": "project"}.get(m[1] or "", "project")
        if v >= 10_000:
            candidates.append((m.group(0).strip(), "KRW", v, v, unit))

    # Discard implausible money matches (years, headcounts, tiny numbers without unit)
    good = []
    for raw, cur, lo, hi, unit in candidates:
        usd = to_usd(hi, cur, fx) or 0
        if unit == "unknown" and usd < 100:
            continue
        if 1900 <= lo <= 2100 and unit == "unknown":
            continue
        good.append((raw, cur, lo, hi, unit))
    if good:
        # Prefer a match that states a unit
        good.sort(key=lambda c: (c[4] == "unknown",))
        raw, cur, lo, hi, unit = good[0]
        result.update({"text": raw.strip(), "currency": cur, "min": lo, "max": hi, "unit": unit,
                       "status": DISCLOSED, "basis": "fact"})
        return _derive(result, fx)

    if _PROPOSED.search(text):
        result["status"] = APPLICANT_PROPOSED
        result["basis"] = "fact"
        result["text"] = "Applicant proposes the rate"
    return result


def _derive(result: dict, fx: dict) -> dict:
    unit, cur = result.get("unit"), result.get("currency") or "USD"
    hi = result.get("max") or result.get("min")
    lo = result.get("min") or hi
    if hi is None:
        return result
    mid_usd = to_usd((lo + hi) / 2, cur, fx)
    if mid_usd is None:
        return result
    if unit in HOURS_PER_UNIT:
        result["hourly_usd"] = round(mid_usd / HOURS_PER_UNIT[unit], 1)
    elif unit in ("project", "unknown"):
        result["project_usd"] = round(mid_usd, 0)
        if unit == "unknown":
            result["unit"] = "project"
    return result


def format_comp(comp: dict, fx: dict) -> str:
    """Korean display string, original currency first, KRW conversion as estimate."""
    status = comp.get("status")
    if status == NOT_DISCLOSED:
        return "보수 비공개 (COMPENSATION NOT DISCLOSED)"
    if status == APPLICANT_PROPOSED:
        return "지원자 제안 요율 (APPLICANT-PROPOSED RATE)"
    cur, lo, hi = comp.get("currency") or "", comp.get("min"), comp.get("max")
    unit_ko = {"hour": "/시간", "day": "/일", "week": "/주", "month": "/월", "year": "/년", "project": "/건"}.get(comp.get("unit"), "")
    amount = f"{lo:,.0f}" if lo == hi else f"{lo:,.0f}–{hi:,.0f}"
    text = f"{cur} {amount}{unit_ko}"
    if cur != "KRW":
        usd = to_usd(hi, cur, fx)
        if usd:
            text += f" (≈ {usd_to_krw(usd, fx) / 10000:,.0f}만원{unit_ko}, 환율 추정)"
    return text
