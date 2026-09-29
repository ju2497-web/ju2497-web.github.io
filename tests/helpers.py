"""Test helpers: isolated project root + offline fixture fetcher."""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

from revenue_agent.config import load_settings
from revenue_agent.http import FixtureFetcher

REPO = Path(__file__).resolve().parent.parent
FIX = Path(__file__).resolve().parent / "fixtures"

FIXTURE_SOURCES = """
[defaults]
user_agent = "test"
max_items_per_source = 50
max_detail_fetches_per_source = 5

[[source]]
id = "seeds"
type = "seeds"
path = "data/seeds"

[[source]]
id = "reliefweb"
type = "reliefweb"
appname_env = "RELIEFWEB_APPNAME"
query = "x"

[[source]]
id = "worldbank"
type = "worldbank"
terms = ["e-learning"]

[[source]]
id = "scale"
type = "greenhouse"
organization = "Scale AI (Outlier)"
board = "scaleai"
include_title = ["expert", "medical"]

[[source]]
id = "lilt"
type = "lever"
organization = "LILT"
company = "lilt"
include_title = ["expert", "reviewer"]

[[source]]
id = "mercor"
type = "ashby"
organization = "Mercor"
board = "mercor"
include_title = ["expert"]

[[source]]
id = "g2b"
type = "g2b"
key_env = "DATA_GO_KR_KEY"
base_url = "https://apis.data.go.kr/test"
keywords = ["이러닝"]

[[source]]
id = "alerts"
type = "rss"
organization = "Google Alerts"
url = "https://www.google.com/alerts/feeds/test"

[[source]]
id = "aslm"
type = "pagewatch"
organization = "ASLM (African Society for Laboratory Medicine)"
url = "https://aslm.org/opportunities/"
include = ["rfp", "sme", "consult", "subject matter"]

[[source]]
id = "off"
type = "rss"
enabled = false
url = "https://nowhere.invalid/feed"
"""

FIXTURE_MAP = {
    "https://api.reliefweb.int/": FIX / "reliefweb.json",
    "https://search.worldbank.org/": FIX / "worldbank.json",
    "https://boards-api.greenhouse.io/": FIX / "greenhouse.json",
    "https://api.lever.co/": FIX / "lever.json",
    "https://api.ashbyhq.com/": FIX / "ashby.json",
    "https://apis.data.go.kr/test": FIX / "g2b.json",
    "https://www.google.com/alerts/": FIX / "alerts.xml",
    "https://aslm.org/opportunities/rfp-sme": FIX / "aslm_detail.html",
    "https://aslm.org/opportunities/": FIX / "aslm_list.html",
}

ENV = {"RELIEFWEB_APPNAME": "test-app", "DATA_GO_KR_KEY": "abc%2Bkey"}


def make_root(with_seeds: bool = True) -> Path:
    root = Path(tempfile.mkdtemp(prefix="ra-test-"))
    (root / "config").mkdir()
    shutil.copy(REPO / "config" / "profile.toml", root / "config" / "profile.toml")
    (root / "config" / "sources.toml").write_text(FIXTURE_SOURCES, encoding="utf-8")
    (root / "data" / "seeds").mkdir(parents=True)
    if with_seeds:
        for f in (REPO / "data" / "seeds").glob("*.json"):
            shutil.copy(f, root / "data" / "seeds" / f.name)
    return root


def settings_for(root: Path):
    os.environ.pop("RA_TRACKER_PATH", None)
    return load_settings(root)


def fetcher() -> FixtureFetcher:
    return FixtureFetcher({k: str(v) for k, v in FIXTURE_MAP.items()})
