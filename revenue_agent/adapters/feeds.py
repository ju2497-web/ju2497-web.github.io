"""RSS/Atom feeds and polite official-page link watching."""
from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET

from ..textutil import LinkExtractor, clean_text, find_deadline, html_to_text, parse_date
from .base import matches

ATOM = "{http://www.w3.org/2005/Atom}"
_NAV_WORDS = {"home", "about us", "contact", "login", "sign in", "register", "privacy", "cookies", "read more",
              "more", "next", "previous", "search", "menu", "careers", "procurement", "opportunities"}


def rss(source: dict, ctx) -> list[dict]:
    root = ET.fromstring(ctx.fetcher.get_text(source["url"]).encode("utf-8"))
    out = []
    items = root.findall(".//item") or root.findall(f".//{ATOM}entry")
    for it in items:
        title = _t(it, "title") or _t(it, f"{ATOM}title")
        link = _t(it, "link")
        if not link:
            el = it.find(f"{ATOM}link")
            link = el.get("href") if el is not None else ""
        # Google Alerts wraps the target in a redirect: keep the real URL
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(link).query)
        if "url" in q:
            link = q["url"][0]
        desc = _t(it, "description") or _t(it, f"{ATOM}content") or _t(it, f"{ATOM}summary")
        text = clean_text(desc, 3000)
        if not matches(f"{title} {text}", source.get("include")):
            continue
        out.append({
            "organization": source.get("organization") or urllib.parse.urlsplit(link).netloc,
            "title": clean_text(title),
            "url": link,
            "description": text,
            "posted_date": parse_date(_t(it, "pubDate") or _t(it, f"{ATOM}published") or _t(it, f"{ATOM}updated")),
            "deadline": find_deadline(text),
            "verification": "feed_item",
        })
    return out


def _t(el, tag: str) -> str:
    found = el.find(tag)
    return (found.text or "").strip() if found is not None and found.text else ""


def pagewatch(source: dict, ctx) -> list[dict]:
    """List links on an official notice page that match keywords; fetch a few new detail pages."""
    page_url = source["url"]
    html = ctx.fetcher.get_text(page_url)
    parser = LinkExtractor()
    parser.feed(html)
    base_host = urllib.parse.urlsplit(page_url).netloc
    out, seen = [], set()
    detail_budget = int(ctx.settings.source_defaults.get("max_detail_fetches_per_source", 6))
    for href, text in parser.links:
        if not href or href.startswith(("mailto:", "javascript:", "#", "tel:")):
            continue
        url = urllib.parse.urljoin(page_url, href).split("#")[0]
        title = clean_text(text)
        if len(title) < 15 or title.lower() in _NAV_WORDS or url in seen or url.rstrip("/") == page_url.rstrip("/"):
            continue
        host = urllib.parse.urlsplit(url).netloc
        if host and host != base_host and not url.lower().endswith(".pdf"):
            continue
        if not matches(f"{title} {url}", source.get("include")):
            continue
        seen.add(url)
        item = {
            "organization": source.get("organization", base_host),
            "title": title,
            "url": url,
            "description": "",
            "verification": "listed_on_official_page",
        }
        if url not in ctx.known_urls and detail_budget > 0 and not url.lower().endswith(".pdf") and ctx.fetcher.allowed(url):
            detail_budget -= 1
            try:
                text_body = html_to_text(ctx.fetcher.get_text(url))
                item["description"] = clean_text(text_body, 4000)
                item["deadline"] = find_deadline(text_body)
            except Exception:  # detail page failures never break the listing
                pass
        out.append(item)
        if len(out) >= int(ctx.settings.source_defaults.get("max_items_per_source", 60)):
            break
    return out
