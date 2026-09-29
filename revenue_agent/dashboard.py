"""Static Korean dashboard (single self-contained HTML file)."""
from __future__ import annotations

import json
from pathlib import Path

from .classify import PIPELINES, PIPELINES_KO
from .compensation import format_comp
from .textutil import days_until, today
from .tracker import ALL_STAGES, STAGE_PROBABILITY, potential_krw

TEMPLATE = Path(__file__).with_name("dashboard_template.html")

INTERVIEW_KO = {"none": "면접 없음", "live": "실시간 면접 있음", "ai_or_async": "AI·비동기 면접", "screening_call": "짧은 스크리닝 콜 (추정)",
                "possible": "면접 가능성 있음 (추정)", "unknown": "미확인"}
REMOTE_KO = {"remote": "원격", "hybrid": "하이브리드", "onsite": "현장 근무", "unknown": "미확인"}
KOREA_KO = {"yes": "가능", "no": "불가", "unknown": "미확인"}
PTYPE_KO = {"individual": "개인 컨설턴트", "firm_only": "업체 전용 입찰", "consortium": "컨소시엄", "roster": "컨설턴트 로스터",
            "platform": "상시 등록 플랫폼", "job": "채용 공고", "watch": "관찰 대상", "unknown": "미확인"}
BASIS_KO = {"fact": "사실", "estimate": "추정", "unknown": "미확인"}


def slim(o: dict, fx: dict) -> dict:
    est = o.get("comp_estimate")
    return {
        "id": o["id"], "priority": o.get("priority"), "score": o.get("score"), "breakdown": o.get("score_breakdown"),
        "org": o["organization"], "title": o["title"], "url": o.get("url"),
        "comp": format_comp(o["compensation"], fx), "comp_basis": o["compensation"].get("basis", "unknown"),
        "comp_status": o["compensation"].get("status"),
        "comp_est": (f"USD {est['min']}–{est['max']}/{'시간' if est['unit'] == 'hour' else '일'} (추정)" if est else None),
        "deadline": o.get("deadline"), "deadline_note": o.get("deadline_note"), "days_left": days_until(o.get("deadline")),
        "korea": o.get("korea_eligible"), "korea_basis": o.get("korea_basis"), "korea_evidence": o.get("korea_evidence"),
        "remote": o.get("remote"), "remote_basis": o.get("remote_basis"),
        "interview": o.get("interview"), "interview_basis": o.get("interview_basis"), "assessment": o.get("assessment"),
        "est": o.get("estimates", {}), "why": o.get("why_fit", []), "next": o.get("next_action"),
        "pipes": o.get("pipelines", []), "pipe": o.get("primary_pipeline"), "ptype": o.get("procurement_type"),
        "sub": o.get("subcontract"), "first_seen": o.get("first_seen"), "last_changed": o.get("last_changed"),
        "history": (o.get("history") or [])[-3:], "status": o.get("status"), "nr": o.get("not_recommended_reason"),
        "verif": o.get("verification_label"), "notes": o.get("notes", []), "category": o.get("category"),
        "potential_krw": potential_krw(o, fx), "desc": (o.get("description") or "")[:420],
        "source": o.get("source"),
    }


def render(opps: list[dict], settings, run_log: dict | None, tracker: dict | None, package_ids: set[str],
           public: bool) -> str:
    fx = settings.fx
    payload = {
        "generated": today().isoformat(),
        "public": public,
        "goal": settings.goal_krw,
        "fx": {"KRW_per_USD": fx.get("KRW_per_USD"), "as_of": fx.get("as_of")},
        "pipelines": {k: {"en": PIPELINES[k], "ko": PIPELINES_KO[k]} for k in PIPELINES},
        "labels": {"interview": INTERVIEW_KO, "remote": REMOTE_KO, "korea": KOREA_KO, "ptype": PTYPE_KO, "basis": BASIS_KO},
        "stages": ALL_STAGES, "stage_prob": STAGE_PROBABILITY,
        "opps": [slim(o, fx) for o in opps],
        "sources": (run_log or {}).get("sources", []),
        "run_date": (run_log or {}).get("date"),
        "tracker": None if public else tracker,
        "packages": [] if public else sorted(package_ids),
    }
    data = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    return TEMPLATE.read_text(encoding="utf-8").replace("__DATA__", data)


def write_dashboard(path: Path, html: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    return path
