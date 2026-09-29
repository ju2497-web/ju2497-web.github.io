"""Opportunity store: JSON file, dedupe by org+title / URL, change history."""
from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

from .textutil import normalize_org, normalize_title, today

TRACKED_FIELDS = ("deadline", "status", "compensation_text", "title", "priority")


def dedupe_key(org: str, title: str) -> str:
    return f"{normalize_org(org)}|{normalize_title(title)}"


def make_id(key: str, deadline: str | None = None, cycle: int = 0) -> str:
    raw = key if not cycle else f"{key}|{deadline}|{cycle}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]


def normalize_url(url: str) -> str:
    u = (url or "").strip()
    u = u.split("#")[0]
    for prefix in ("https://", "http://"):
        if u.startswith(prefix):
            u = u[len(prefix):]
    u = u.removeprefix("www.")
    return u.rstrip("/").lower()


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.data = {"version": 1, "updated": None, "opportunities": {}}
        if self.path.exists():
            self.data = json.loads(self.path.read_text(encoding="utf-8"))
        self._by_url = {normalize_url(o["url"]): oid for oid, o in self.opps.items() if o.get("url")}
        self._by_key = {o["key"]: oid for oid, o in self.opps.items()}

    @property
    def opps(self) -> dict:
        return self.data["opportunities"]

    def find(self, key: str, url: str) -> str | None:
        """Match on (1) org+normalized title, (2) deep-link URL, (3) near-identical title in same org."""
        if key in self._by_key:
            return self._by_key[key]
        nurl = normalize_url(url)
        if nurl.count("/") >= 2 and nurl in self._by_url:
            return self._by_url[nurl]
        org, title = key.split("|", 1)
        words = set(title.split())
        if len(words) >= 4:
            for oid, o in self.opps.items():
                o_org, o_title = o["key"].split("|", 1)
                if o_org != org:
                    continue
                other = set(o_title.split())
                if len(words & other) / len(words | other) >= 0.8:
                    return oid
        return None

    def upsert(self, opp: dict, run_date: date | None = None) -> str:
        """Insert or update. Returns 'new' | 'changed' | 'unchanged' | 'new_cycle'."""
        run = (run_date or today()).isoformat()
        key = dedupe_key(opp["organization"], opp["title"])
        opp["key"] = key
        existing_id = self.find(key, opp.get("url", ""))
        if existing_id:
            old = self.opps[existing_id]
            # A re-issued call (old closed long ago, new deadline much later) is a new cycle
            if (old.get("status") == "closed" and opp.get("deadline") and old.get("deadline")
                    and opp["deadline"] > old["deadline"] and _gap_days(old["deadline"], opp["deadline"]) > 90):
                cycle = old.get("cycle", 0) + 1
                opp.update({"id": make_id(key, opp["deadline"], cycle), "cycle": cycle,
                            "first_seen": run, "last_seen": run, "last_changed": run, "history": []})
                self._insert(opp)
                return "new_cycle"
            changes = []
            for f in TRACKED_FIELDS:
                if f in opp and opp.get(f) != old.get(f) and not (f == "priority" and old.get(f) is None):
                    changes.append({"date": run, "field": f, "old": old.get(f), "new": opp.get(f)})
            keep = {k: old[k] for k in ("id", "first_seen", "history", "cycle") if k in old}
            merged = {**old, **opp, **keep}
            merged["last_seen"] = run
            if changes:
                merged["history"] = (old.get("history") or []) + changes
                merged["last_changed"] = run
            self.opps[existing_id] = merged
            self._index(merged)
            return "changed" if changes else "unchanged"
        opp.update({"id": make_id(key), "first_seen": run, "last_seen": run, "last_changed": run, "history": []})
        if opp["id"] in self.opps:  # hash collision with different key – extremely unlikely
            opp["id"] = make_id(key + opp.get("url", ""))
        self._insert(opp)
        return "new"

    def _insert(self, opp: dict) -> None:
        self.opps[opp["id"]] = opp
        self._index(opp)

    def _index(self, opp: dict) -> None:
        self._by_key[opp["key"]] = opp["id"]
        if opp.get("url"):
            self._by_url[normalize_url(opp["url"])] = opp["id"]

    def mark_expired(self, ref: date | None = None) -> int:
        ref_iso = (ref or today()).isoformat()
        n = 0
        for o in self.opps.values():
            if o.get("deadline") and o["deadline"] < ref_iso and o.get("status") != "closed":
                o.setdefault("history", []).append({"date": ref_iso, "field": "status", "old": o.get("status"), "new": "closed"})
                o["status"] = "closed"
                n += 1
        return n

    def save(self) -> None:
        self.data["updated"] = today().isoformat()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        ordered = dict(sorted(self.opps.items(), key=lambda kv: (-kv[1].get("score", 0), kv[0])))
        self.data["opportunities"] = ordered
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _gap_days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days
