"""Orchestration: fetch → normalize → classify → score → store."""
from __future__ import annotations

import json
import time
import traceback

from .adapters import REGISTRY, Context, SkipSource
from .classify import classify
from .compensation import parse_compensation
from .config import Settings
from .http import Fetcher
from .scoring import score
from .store import Store, dedupe_key
from .textutil import clean_text, parse_date, today

VERIFICATION_KO = {
    "official_api": "공식 API에서 수집 (VERIFIED SOURCE)",
    "official_page_verified": "공식 페이지 확인 (VERIFIED)",
    "search_result_verified": "검색으로 존재 확인 – 세부조건은 원문 확인 필요",
    "listed_on_official_page": "공식 공고 목록에 게시됨 (세부조건 미확인)",
    "platform_homepage": "공식 홈페이지 (상시 등록형)",
    "feed_item": "RSS 피드 항목 (원문 확인 필요)",
    "manual": "직접 입력",
    "seed_verified": "사람이 확인",
}


def build_opportunity(raw: dict, settings: Settings, existing: dict | None = None) -> dict:
    opp = {k: v for k, v in raw.items() if v not in (None, "", [])}
    opp["organization"] = clean_text(opp.get("organization") or "Unknown")
    opp["title"] = clean_text(opp.get("title") or "(untitled)")
    if existing and not opp.get("description"):
        opp["description"] = existing.get("description", "")
    opp.setdefault("description", "")
    opp["deadline"] = parse_date(opp.get("deadline")) or (existing or {}).get("deadline")
    opp["posted_date"] = parse_date(opp.get("posted_date"))
    opp.setdefault("status", "open")
    opp.setdefault("verification", "unverified")
    opp["verification_label"] = VERIFICATION_KO.get(opp["verification"], opp["verification"])

    text_for_pay = f"{opp.get('compensation_text', '')} {opp['title']} {opp['description']}"
    opp["compensation"] = parse_compensation(text_for_pay, settings.fx, opp.pop("comp_structured", None))
    opp["compensation_text"] = opp["compensation"]["text"] or opp["compensation"]["status"]

    opp.update(classify(opp, settings.profile))
    if raw.get("watch"):
        opp["procurement_type"] = "watch"
    return score(opp, settings)


def rescore_all(store: Store, settings: Settings) -> None:
    for oid, o in list(store.opps.items()):
        raw = {k: o.get(k) for k in ("organization", "title", "url", "description", "deadline", "posted_date",
                                      "location_text", "source", "source_type", "verification", "status",
                                      "category", "korea_eligible", "remote", "remote_basis", "notes",
                                      "how_to_apply", "deadline_note", "watch", "verified_on", "duration")}
        raw["procurement_type"] = o.get("procurement_type_seed")
        if o["compensation"].get("basis") == "fact" and o["compensation"].get("min"):
            c = o["compensation"]
            raw["comp_structured"] = {k: c.get(k) for k in ("min", "max", "currency", "unit", "text")}
        rebuilt = build_opportunity(raw, settings)
        keep = {k: o[k] for k in ("id", "key", "first_seen", "last_seen", "last_changed", "history", "cycle") if k in o}
        store.opps[oid] = {**rebuilt, **keep}


def run(settings: Settings, fetcher=None, only: list[str] | None = None, env: dict | None = None) -> dict:
    d = settings.source_defaults
    fetcher = fetcher or Fetcher(d.get("user_agent", "RevenueAgent/1.0"), d.get("timeout_seconds", 25),
                                 d.get("per_host_delay_seconds", 2.0))
    store = Store(settings.store_path)
    ctx = Context(fetcher=fetcher, settings=settings, known_urls={o.get("url") for o in store.opps.values()})
    if env is not None:
        ctx.env = env
    report = {"date": today().isoformat(), "sources": [], "counts": {"new": 0, "changed": 0, "unchanged": 0, "new_cycle": 0}}

    for src in settings.sources:
        if only and src["id"] not in only:
            continue
        entry = {"id": src["id"], "type": src["type"], "status": "ok", "items": 0, "message": ""}
        if not src.get("enabled", True):
            entry.update(status="disabled")
            report["sources"].append(entry)
            continue
        started = time.monotonic()
        try:
            raws = REGISTRY[src["type"]](src, ctx)
            for raw in raws:
                raw.setdefault("source", src["id"])
                raw.setdefault("source_type", src["type"])
                key = dedupe_key(clean_text(raw.get("organization") or ""), clean_text(raw.get("title") or ""))
                existing_id = store.find(key, raw.get("url", ""))
                existing = store.opps.get(existing_id) if existing_id else None
                opp = build_opportunity(raw, settings, existing)
                opp["procurement_type_seed"] = raw.get("procurement_type")
                result = store.upsert(opp)
                report["counts"][result] += 1
            entry["items"] = len(raws)
        except SkipSource as e:
            entry.update(status="skipped", message=str(e))
        except Exception as e:  # one broken source must never stop the run
            entry.update(status="error", message=f"{type(e).__name__}: {e}"[:300])
            entry["trace"] = traceback.format_exc(limit=2)[-600:]
        entry["seconds"] = round(time.monotonic() - started, 1)
        report["sources"].append(entry)

    report["expired"] = store.mark_expired()
    for o in store.opps.values():  # closed items drop out of the action lists
        if o.get("status") == "closed" and o.get("priority") not in ("X", "closed"):
            o["priority"] = "closed"
            o["next_action"] = "마감됨 – 다음 회차 공고 모니터링"
    store.save()
    settings.run_log.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return report
