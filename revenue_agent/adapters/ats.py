"""Public job-board APIs (Greenhouse, Lever, Ashby) – used by AI-training / expert companies."""
from __future__ import annotations

from ..textutil import clean_text, parse_date
from .base import matches

LEVER_INTERVAL = {"per-hour-wage": "hour", "per-day-wage": "day", "per-week-salary": "week",
                  "per-month-salary": "month", "per-year-salary": "year", "one-time": "project"}
ASHBY_INTERVAL = {"1 HOUR": "hour", "1 DAY": "day", "1 WEEK": "week", "1 MONTH": "month", "1 YEAR": "year"}


def greenhouse(source: dict, ctx) -> list[dict]:
    data = ctx.fetcher.get_json(f"https://boards-api.greenhouse.io/v1/boards/{source['board']}/jobs?content=true")
    out = []
    for j in data.get("jobs", []):
        title = j.get("title", "")
        if not matches(title, source.get("include_title")):
            continue
        out.append({
            "organization": source.get("organization", source["board"]),
            "title": clean_text(title),
            "url": j.get("absolute_url"),
            "description": clean_text(j.get("content"), 4000),
            "posted_date": parse_date(j.get("first_published") or j.get("updated_at")),
            "location_text": (j.get("location") or {}).get("name", ""),
            "verification": "official_api",
        })
    return out


def lever(source: dict, ctx) -> list[dict]:
    data = ctx.fetcher.get_json(f"https://api.lever.co/v0/postings/{source['company']}?mode=json")
    out = []
    for j in data if isinstance(data, list) else []:
        title = j.get("text", "")
        if not matches(title, source.get("include_title")):
            continue
        cats = j.get("categories") or {}
        sr = j.get("salaryRange") or {}
        comp = None
        if sr.get("min"):
            comp = {"min": sr["min"], "max": sr.get("max") or sr["min"], "currency": sr.get("currency", "USD"),
                    "unit": LEVER_INTERVAL.get(sr.get("interval"), "unknown"), "text": j.get("salaryDescriptionPlain", "")}
        out.append({
            "organization": source.get("organization", source["company"]),
            "title": clean_text(title),
            "url": j.get("hostedUrl"),
            "description": clean_text(f"{cats.get('commitment', '')}. {j.get('workplaceType', '')}. "
                                      f"{j.get('descriptionPlain', '')} {j.get('additionalPlain', '')}", 4000),
            "posted_date": parse_date(j.get("createdAt")),
            "location_text": cats.get("location", ""),
            "comp_structured": comp,
            "verification": "official_api",
        })
    return out


def ashby(source: dict, ctx) -> list[dict]:
    data = ctx.fetcher.get_json(
        f"https://api.ashbyhq.com/posting-api/job-board/{source['board']}?includeCompensation=true")
    out = []
    for j in data.get("jobs", []):
        title = j.get("title", "")
        if not matches(title, source.get("include_title")) or j.get("isListed") is False:
            continue
        comp_info = j.get("compensation") or {}
        comp = None
        for c in comp_info.get("summaryComponents") or []:
            if c.get("minValue") and c.get("compensationType") in ("Salary", "Hourly", None):
                comp = {"min": c["minValue"], "max": c.get("maxValue") or c["minValue"],
                        "currency": c.get("currencyCode", "USD"), "unit": ASHBY_INTERVAL.get(c.get("interval"), "unknown"),
                        "text": comp_info.get("compensationTierSummary", "")}
                break
        remote = "remote" if j.get("isRemote") or j.get("workplaceType") == "Remote" else None
        out.append({
            "organization": source.get("organization", source["board"]),
            "title": clean_text(title),
            "url": j.get("jobUrl") or j.get("applyUrl"),
            "description": clean_text(f"{j.get('employmentType', '')}. {comp_info.get('compensationTierSummary', '')}. "
                                      f"{j.get('descriptionPlain') or j.get('descriptionHtml', '')}", 4000),
            "posted_date": parse_date(j.get("publishedAt")),
            "location_text": j.get("location", ""),
            "remote": remote,
            "comp_structured": comp,
            "verification": "official_api",
        })
    return out
