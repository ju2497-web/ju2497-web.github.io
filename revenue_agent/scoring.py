"""0–100 revenue score, S/A/B/C priority, estimates and next action."""
from __future__ import annotations

from .compensation import APPLICANT_PROPOSED, DISCLOSED
from .textutil import days_until

WEIGHTS = {
    "fit": 25, "compensation": 20, "korea": 10, "remote": 10, "conversion": 10,
    "speed": 10, "effort": 5, "interview": 5, "recurring": 5,
}
LABELS_KO = {
    "fit": "전문성 적합도", "compensation": "보수 잠재력", "korea": "한국 지원 가능", "remote": "원격·비동기",
    "conversion": "유료 전환 확률", "speed": "첫 입금 속도", "effort": "지원 부담 낮음", "interview": "면접 부담 낮음",
    "recurring": "반복·리테이너",
}
THRESHOLDS = {"S": 75, "A": 62, "B": 48}

CATEGORY_BASE_FIT = {"expert_network": 15, "ai_expert": 13, "freelance": 12, "corporate_training": 12}


def comp_estimate(opp: dict, rates: dict) -> dict | None:
    """Typical-market estimate for platforms whose pay is not published. Always basis=estimate."""
    cat = opp.get("category")
    table = {"expert_network": "expert_call_hourly_usd", "ai_expert": "ai_expert_hourly_usd"}
    if cat in table and rates.get(table[cat]):
        lo, hi = rates[table[cat]]
        return {"min": lo, "max": hi, "unit": "hour", "currency": "USD", "basis": "estimate",
                "note": "공고 수치 아님 – 업계 통상 범위 추정 (config/profile.toml [rates])"}
    if opp.get("procurement_type") in ("individual", "roster") and opp.get("compensation", {}).get("status") != DISCLOSED:
        lo, hi = rates.get("intl_consultant_daily_usd", [400, 600])
        return {"min": lo, "max": hi, "unit": "day", "currency": "USD", "basis": "estimate",
                "note": "제안 요율 가이드 – 국제기구 개인 컨설턴트 통상 일당 추정"}
    return None


def _score_fit(opp: dict) -> float:
    t = opp["fit_terms"]
    s = min(len(t["core"]), 5) * 3 + (5 if t["title_core"] else 0) + min(len(t["adjacent"]), 5) + (3 if t["roles"] else 0)
    if "C" in opp["pipelines"] and "E" in opp["pipelines"]:
        s += 2
    s = max(s, CATEGORY_BASE_FIT.get(opp.get("category"), 0))
    if opp.get("skill_mismatch") and not t["title_core"]:
        s -= 4 * len(opp["skill_mismatch"][:2])  # 개발·멀티미디어 전문 역량 요구 → 본업 경쟁 불리
    if "unrelated" in opp["flags"]:
        s = 0
    return max(0, min(s, WEIGHTS["fit"]))


def _score_comp(opp: dict, fx: dict) -> tuple[float, str]:
    comp = opp["compensation"]
    if comp.get("unpaid"):
        return 0, "무보수"
    hourly = comp.get("hourly_usd")
    project = comp.get("project_usd")
    if comp["status"] == DISCLOSED and hourly:
        for bar, pts in ((150, 20), (100, 18), (75, 15), (50, 11), (30, 6)):
            if hourly >= bar:
                return pts, f"시급 환산 USD {hourly:,.0f} (공고 사실)"
        return 2, f"시급 환산 USD {hourly:,.0f} – 낮음"
    if comp["status"] == DISCLOSED and project:
        if opp["procurement_type"] in ("firm_only", "consortium"):
            # 계약 총액 = 팀 전체 예산. SME 몫은 일부이므로 규모 신호로만 사용
            return (14 if project >= 50_000 else 10 if project >= 10_000 else 6), f"계약 규모 USD {project:,.0f} (팀 전체 예산)"
        krw_min = 1_000_000 / float(fx.get("KRW_per_USD", 1380))
        for bar, pts in ((5000, 18), (2000, 16), (krw_min, 14), (krw_min / 2, 10)):
            if project >= bar:
                return pts, f"건당 USD {project:,.0f} (공고 사실)"
        return 4, f"건당 USD {project:,.0f} – 낮음"
    est = opp.get("comp_estimate")
    if est and est["unit"] == "hour":
        mid = (est["min"] + est["max"]) / 2
        pts = 18 if mid >= 150 else 14 if mid >= 75 else 10
        return pts * 0.8, f"추정 시급 USD {est['min']}–{est['max']} (ESTIMATE)"
    if comp["status"] == APPLICANT_PROPOSED:
        return 12, "요율을 직접 제안 (APPLICANT-PROPOSED)"
    base = {"individual": 10, "roster": 8, "firm_only": 8, "consortium": 8, "platform": 8, "job": 7}.get(opp["procurement_type"], 6)
    return base, "보수 비공개 – 유형 기준 추정"


def score(opp: dict, settings) -> dict:
    fx, rates = settings.fx, settings.rates
    opp["comp_estimate"] = comp_estimate(opp, rates)
    ptype, cat = opp["procurement_type"], opp.get("category")
    b: dict[str, float] = {}
    b["fit"] = _score_fit(opp)
    b["compensation"], comp_reason = _score_comp(opp, fx)
    b["korea"] = {"yes": 10, "unknown": 5, "no": 0}[opp["korea_eligible"]]
    b["remote"] = {"remote": 10, "hybrid": 4, "unknown": 5, "onsite": 0}[opp["remote"]]
    if opp["remote"] == "onsite" and opp["korea_eligible"] == "yes" and opp.get("source_type") == "g2b":
        b["remote"] = 5
    fit_ratio = b["fit"] / WEIGHTS["fit"]
    conv = {"platform": 6 if cat == "expert_network" else 8, "roster": 5, "individual": 6, "job": 5, "firm_only": 3, "consortium": 4, "watch": 2}.get(ptype, 4)
    b["conversion"] = min(10, conv + 3 * fit_ratio)
    speed = {"ai_expert": 9, "expert_network": 8, "freelance": 7, "corporate_training": 5}.get(cat)
    b["speed"] = speed if speed is not None else {"individual": 6, "job": 5, "roster": 4, "firm_only": 2, "consortium": 2, "watch": 1}.get(ptype, 3)
    effort = {"platform": 5, "roster": 4, "job": 3, "firm_only": 3, "consortium": 3, "individual": 2, "watch": 5}.get(ptype, 2)
    b["effort"] = max(0, effort - (2 if opp.get("cost_to_apply") else 0))
    b["interview"] = {"none": 5, "ai_or_async": 4, "unknown": 3, "possible": 3, "screening_call": 3, "live": 1}.get(opp["interview"], 3)
    if opp["assessment"] == "yes" and opp["interview"] != "live":
        b["interview"] = min(b["interview"], 4)
    b["recurring"] = 5 if opp["recurring"] else (4 if opp.get("duration") and "month" in str(opp["duration"]).lower() else 2)

    total = round(sum(b.values()))
    if opp["flags"] or b["compensation"] == 0:
        priority = "X"
    elif opp.get("status") == "closed":
        priority = "closed"
    elif ptype == "watch":
        priority = "W"
    else:
        priority = next((p for p, t in THRESHOLDS.items() if total >= t), "C")
    opp["score"] = total
    opp["score_breakdown"] = {k: round(v, 1) for k, v in b.items()}
    opp["comp_reason"] = comp_reason
    opp["priority"] = priority
    opp["recommendation"] = "NOT RECOMMENDED" if priority == "X" else "RECOMMENDED"
    if priority == "X" and not opp.get("not_recommended_reason"):
        opp["not_recommended_reason"] = "무보수 또는 보수가 너무 낮습니다."
    opp["estimates"] = _estimates(opp, b)
    opp["why_fit"] = _why_fit(opp)
    opp["next_action"] = _next_action(opp, rates)
    return opp


def _estimates(opp: dict, b: dict) -> dict:
    ptype, cat = opp["procurement_type"], opp.get("category")
    minutes = {"platform": 30, "roster": 60, "individual": 240, "firm_only": 45, "consortium": 45, "job": 60, "watch": 5}.get(ptype, 90)
    prep = {"platform": 0.5, "roster": 1, "individual": 4, "firm_only": 1, "consortium": 1, "job": 1, "watch": 0}.get(ptype, 1.5)
    pay_days = {"ai_expert": 14, "expert_network": 21, "freelance": 14, "corporate_training": 45}.get(cat) or \
        {"individual": 45, "roster": 90, "firm_only": 180, "consortium": 180, "job": 30, "watch": 180}.get(ptype, 60)
    chance = round(min(85, 15 + (b["fit"] / 25) * 45 + b["conversion"] * 2.5))
    return {"application_minutes": minutes, "prep_hours": prep, "payment_speed_days": pay_days,
            "fit_chance_pct": chance, "recurring": opp["recurring"], "basis": "estimate"}


def _why_fit(opp: dict) -> list[str]:
    out = []
    t = opp["fit_terms"]
    if t["core"]:
        out.append("핵심 전공 일치: " + ", ".join(t["core"][:5]))
    elif t["adjacent"]:
        out.append("관련 분야: " + ", ".join(t["adjacent"][:5]))
    out.append("참여 역할: " + ", ".join(opp["roles_for_me"][:3]))
    if opp["remote"] == "remote":
        out.append("원격 가능" + (" (추정)" if opp["remote_basis"] == "estimate" else ""))
    if opp["recurring"]:
        out.append("반복 수입 가능 (로스터·리테이너·플랫폼)")
    if opp.get("comp_reason"):
        out.append(opp["comp_reason"])
    return out


def _next_action(opp: dict, rates: dict) -> str:
    p, ptype, cat = opp["priority"], opp["procurement_type"], opp.get("category")
    d = days_until(opp.get("deadline"))
    if p == "X":
        return "지원하지 않음 – " + opp.get("not_recommended_reason", "")
    if p == "closed":
        return "마감됨 – 다음 회차 공고 모니터링"
    if ptype == "watch":
        return "조치 불필요 – 관련 컨설턴트 공고 모니터링"
    if cat == "expert_network":
        lo = rates.get("expert_call_hourly_usd", [150])[0]
        return f"오늘 전문가 프로필 등록 (약 30분). 요청 시 시급 USD {lo}+ 제시"
    if cat == "ai_expert":
        return "가입 → 의생명 도메인 평가 응시 (약 30~60분). 영문 CV 업로드"
    if cat == "freelance":
        return "상품·프로필 등록 또는 갱신 (고단가 패키지 우선)"
    if cat == "corporate_training":
        return "전문강사 프로필 등록 (약 20분)"
    if ptype == "roster":
        return "로스터 등록 신청 (SME CV + 동기서 – 자동 초안 사용)"
    if ptype in ("firm_only", "consortium"):
        primes = ", ".join((opp.get("subcontract") or {}).get("likely_primes", [])[:3])
        return f"SME 하도급 제안: 원청 후보({primes})에 협력 메일 – 초안 자동 생성, 발송은 승인 후"
    if ptype == "individual":
        when = f"D-{d}: " if d is not None else ""
        return f"{when}TOR 확인 → 기술·재무 제안서 작성 → 마감 전 제출 (제출은 교수님 승인 후)"
    return "공고 원문 확인 후 지원서 제출 (승인 후)"
