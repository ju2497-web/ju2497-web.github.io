"""Source adapters. Each adapter: fetch(source: dict, ctx: Context) -> list[dict] of raw items.

Raw item keys: organization, title, url, description, posted_date, deadline, location_text,
source, source_type, verification, comp_structured (optional), plus optional seed overrides.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import os

from . import ats, feeds, public_apis, seeds
from .base import SkipSource  # noqa: F401 (re-export)


@dataclass
class Context:
    fetcher: object
    settings: object
    known_urls: set = field(default_factory=set)
    env: dict = field(default_factory=lambda: dict(os.environ))


REGISTRY = {
    "seeds": seeds.fetch,
    "reliefweb": public_apis.reliefweb,
    "worldbank": public_apis.worldbank,
    "g2b": public_apis.g2b,
    "greenhouse": ats.greenhouse,
    "lever": ats.lever,
    "ashby": ats.ashby,
    "rss": feeds.rss,
    "pagewatch": feeds.pagewatch,
}
