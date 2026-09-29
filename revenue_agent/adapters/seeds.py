"""Human-verified seed opportunities (data/seeds/*.json)."""
from __future__ import annotations

import json
from pathlib import Path


def fetch(source: dict, ctx) -> list[dict]:
    folder = Path(ctx.settings.root) / source.get("path", "data/seeds")
    items: list[dict] = []
    for f in sorted(folder.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        defaults = doc.get("defaults", {})
        for raw in doc.get("items", []):
            item = {**defaults, **raw}
            item.setdefault("verification", "seed_verified")
            item["source"] = f"seed:{f.stem}"
            item["source_type"] = "seed"
            items.append(item)
    return items
