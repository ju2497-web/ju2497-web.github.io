"""Official public APIs: ReliefWeb (UN/NGO jobs), World Bank procurement, 나라장터 (data.go.kr)."""
from __future__ import annotations

import urllib.parse
from datetime import timedelta

from ..textutil import clean_text, parse_date, today
from .base import SkipSource

RELIEFWEB_URL = "https://api.reliefweb.int/v2/jobs"
WORLDBANK_URL = "https://search.worldbank.org/api/v2/procnotices"


def reliefweb(source: dict, ctx) -> list[dict]:
    appname = ctx.env.get(source.get("appname_env", "RELIEFWEB_APPNAME"))
    if not appname:
        raise SkipSource("RELIEFWEB_APPNAME 미설정 (ReliefWeb 승인 appname 필요)")
    payload = {
        "query": {"value": source["query"], "fields": ["title", "body"], "operator": "AND"},
        "fields": {"include": ["title", "url", "url_alias", "date.created", "date.closing", "source.name",
                               "country.name", "city.name", "body", "how_to_apply", "type.name",
                               "experience.name", "career_categories.name"]},
        "sort": ["date.created:desc"],
        "limit": int(source.get("limit", 60)),
    }
    data = ctx.fetcher.post_json(f"{RELIEFWEB_URL}?appname={urllib.parse.quote(appname)}", payload)
    out = []
    for row in data.get("data", []):
        f = row.get("fields", {})
        sources = f.get("source") or []
        countries = ", ".join(c.get("name", "") for c in (f.get("country") or []))
        cities = ", ".join(c.get("name", "") for c in (f.get("city") or []))
        types = ", ".join(t.get("name", "") for t in (f.get("type") or []))
        out.append({
            "organization": sources[0].get("name", "Unknown") if sources else "Unknown",
            "title": clean_text(f.get("title")),
            "url": f.get("url_alias") or f.get("url") or f"https://reliefweb.int/job/{row.get('id')}",
            "description": clean_text(f"{types}. {f.get('body', '')} {f.get('how_to_apply', '')}", 4000),
            "posted_date": parse_date((f.get("date") or {}).get("created")),
            "deadline": parse_date((f.get("date") or {}).get("closing")),
            "location_text": ", ".join(x for x in (cities, countries) if x),
            "verification": "official_api",
        })
    return out


def worldbank(source: dict, ctx) -> list[dict]:
    out, seen = [], set()
    for term in source.get("terms", []):
        params = {
            "format": "json", "qterm": term, "rows": source.get("rows", 30),
            "srt": "noticedate", "order": "desc",
            "fl": "id,bid_description,project_name,project_id,notice_type,noticedate,submission_date,"
                  "submission_deadline_date,project_ctry_name,procurement_method_name,procurement_group,notice_status,notice_text",
        }
        data = ctx.fetcher.get_json(f"{WORLDBANK_URL}?{urllib.parse.urlencode(params)}")
        notices = data.get("procnotices", [])
        if isinstance(notices, dict):
            notices = list(notices.values())
        for n in notices:
            nid = n.get("id")
            if not nid or nid in seen:
                continue
            seen.add(nid)
            method = n.get("procurement_method_name", "")
            out.append({
                "organization": f"World Bank-financed project ({n.get('project_ctry_name', 'n/a')})",
                "title": clean_text(n.get("bid_description") or n.get("project_name")),
                "url": f"https://projects.worldbank.org/en/projects-operations/procurement-detail/{nid}",
                "description": clean_text(
                    f"{n.get('notice_type', '')}. {method}. {n.get('procurement_group', '')}. "
                    f"Project: {n.get('project_name', '')}. {n.get('notice_text', '')}", 4000),
                "posted_date": parse_date(n.get("noticedate")),
                "deadline": parse_date(n.get("submission_deadline_date") or n.get("submission_date")),
                "location_text": n.get("project_ctry_name", ""),
                "status": "closed" if str(n.get("notice_status", "")).lower() in ("closed", "cancelled") else "open",
                "verification": "official_api",
            })
    return out


def g2b(source: dict, ctx) -> list[dict]:
    key = ctx.env.get(source.get("key_env", "DATA_GO_KR_KEY"))
    if not key:
        raise SkipSource("DATA_GO_KR_KEY 미설정 (공공데이터포털 나라장터 API 키 필요)")
    end = today()
    start = end - timedelta(days=int(source.get("lookback_days", 7)))
    service_key = key if "%" in key else urllib.parse.quote(key, safe="")
    out, seen = [], set()
    for kw in source.get("keywords", []):
        params = urllib.parse.urlencode({
            "numOfRows": 100, "pageNo": 1, "inqryDiv": 1, "type": "json",
            "inqryBgnDt": start.strftime("%Y%m%d") + "0000", "inqryEndDt": end.strftime("%Y%m%d") + "2359",
            "bidNtceNm": kw,
        })
        data = ctx.fetcher.get_json(f"{source['base_url']}?serviceKey={service_key}&{params}")
        body = (data.get("response") or {}).get("body") or {}
        items = body.get("items") or []
        if isinstance(items, dict):
            items = items.get("item", [])
        if isinstance(items, dict):
            items = [items]
        for it in items:
            uid = f"{it.get('bidNtceNo')}-{it.get('bidNtceOrd')}"
            if uid in seen:
                continue
            seen.add(uid)
            price = it.get("presmptPrce") or it.get("asignBdgtAmt")
            comp = None
            try:
                if price and float(price) > 0:
                    comp = {"min": float(price), "max": float(price), "currency": "KRW", "unit": "project",
                            "text": f"추정가격 {float(price):,.0f}원"}
            except ValueError:
                comp = None
            out.append({
                "organization": it.get("dminsttNm") or it.get("ntceInsttNm") or "조달청",
                "title": clean_text(it.get("bidNtceNm")),
                "url": it.get("bidNtceDtlUrl") or "https://www.g2b.go.kr/",
                "description": clean_text(f"나라장터 용역 입찰공고 ({kw}). 공고기관 {it.get('ntceInsttNm', '')}. "
                                          "입찰 참가는 사업자(업체) 자격 필요 – 개인은 수주업체의 전문가로 참여."),
                "posted_date": parse_date(it.get("bidNtceDt")),
                "deadline": parse_date(it.get("bidClseDt")),
                "location_text": "대한민국",
                "korea_eligible": "yes",
                "procurement_type": "firm_only",
                "comp_structured": comp,
                "verification": "official_api",
            })
    return out
