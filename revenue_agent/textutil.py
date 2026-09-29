"""Text, date and HTML helpers (stdlib only)."""
from __future__ import annotations

import html
import os
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser

KST = timezone(timedelta(hours=9))

_WS = re.compile(r"\s+")
_TAG = re.compile(r"<[^>]+>")


def today() -> date:
    """Today in Korea time; override with RA_TODAY=YYYY-MM-DD (tests, backfills)."""
    forced = os.environ.get("RA_TODAY")
    if forced:
        return date.fromisoformat(forced)
    return datetime.now(KST).date()


def clean_text(value: str | None, limit: int | None = None) -> str:
    if not value:
        return ""
    text = html.unescape(_TAG.sub(" ", str(value)))
    text = _WS.sub(" ", text).strip()
    if limit and len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def normalize_title(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "").lower()
    text = re.sub(r"\((?:roster|re-?advertis\w*|re-?tender|extended|deadline extended)\)", " ", text)
    text = re.sub(r"[^\w\s가-힣]", " ", text)
    return _WS.sub(" ", text).strip()


def normalize_org(value: str) -> str:
    text = normalize_title(value)
    return re.sub(r"\b(the|inc|ltd|llc|group)\b", " ", text).strip()


_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def parse_date(value) -> str | None:
    """Parse many date formats to ISO YYYY-MM-DD. Returns None when unsure."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):  # epoch ms / s
        seconds = value / 1000 if value > 10_000_000_000 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc).astimezone(KST).date().isoformat()
    text = str(value).strip()
    m = re.match(r"^(\d{4})[-./](\d{1,2})[-./](\d{1,2})", text)
    if m:
        return _safe(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(\d{4})?$", text)  # 202610021000 (나라장터)
    if m:
        return _safe(int(m[1]), int(m[2]), int(m[3]))
    m = re.search(r"(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일", text)
    if m:
        return _safe(int(m[1]), int(m[2]), int(m[3]))
    m = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})", text)
    if m and m[2][:3].lower() in _MONTHS:
        return _safe(int(m[3]), _MONTHS[m[2][:3].lower()], int(m[1]))
    m = re.search(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", text)
    if m and m[1][:3].lower() in _MONTHS:
        return _safe(int(m[3]), _MONTHS[m[1][:3].lower()], int(m[2]))
    return None


def _safe(y: int, mo: int, d: int) -> str | None:
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


_DEADLINE_CUES = re.compile(
    r"(?:deadline|closing date|closes?(?: on)?|submission date|due date|apply by|applications? (?:must be )?(?:received|submitted) by|on or before|마감(?:일|일시)?)\s*[:\-]?\s*(.{0,60})",
    re.I,
)


def find_deadline(text: str) -> str | None:
    for m in _DEADLINE_CUES.finditer(text or ""):
        found = parse_date(m.group(1))
        if found:
            return found
    return None


def days_until(iso: str | None, ref: date | None = None) -> int | None:
    if not iso:
        return None
    try:
        return (date.fromisoformat(iso) - (ref or today())).days
    except ValueError:
        return None


class LinkExtractor(HTMLParser):
    """Collect (href, anchor text) pairs from an HTML page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._buf: list[str] = []
        self.text_parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._buf = []

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1
        if tag == "a" and self._href is not None:
            self.links.append((self._href, _WS.sub(" ", "".join(self._buf)).strip()))
            self._href = None

    def handle_data(self, data):
        if self._skip:
            return
        self.text_parts.append(data)
        if self._href is not None:
            self._buf.append(data)

    @property
    def text(self) -> str:
        return _WS.sub(" ", " ".join(self.text_parts)).strip()


def html_to_text(page: str) -> str:
    parser = LinkExtractor()
    parser.feed(page or "")
    return parser.text
