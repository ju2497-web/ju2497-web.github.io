"""Configuration loading and project paths."""
from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(os.environ.get("RA_ROOT", Path(__file__).resolve().parent.parent))


def _load(path: Path) -> dict:
    with open(path, "rb") as fh:
        return tomllib.load(fh)


@dataclass
class Settings:
    profile: dict
    sources: list[dict]
    source_defaults: dict
    root: Path = ROOT
    store_path: Path = field(default=None)  # type: ignore[assignment]
    tracker_path: Path = field(default=None)  # type: ignore[assignment]
    packages_dir: Path = field(default=None)  # type: ignore[assignment]
    public_dashboard: Path = field(default=None)  # type: ignore[assignment]
    local_dashboard: Path = field(default=None)  # type: ignore[assignment]
    run_log: Path = field(default=None)  # type: ignore[assignment]

    @property
    def fx(self) -> dict:
        return self.profile.get("fx", {})

    @property
    def rates(self) -> dict:
        return self.profile.get("rates", {})

    @property
    def goal_krw(self) -> int:
        return int(self.profile.get("goals", {}).get("monthly_revenue_krw", 10_000_000))


def load_settings(root: Path | None = None) -> Settings:
    root = Path(root or ROOT)
    profile = _load(root / "config" / "profile.toml")
    # Private overlay (contract rates, evidence, identity) – never committed
    local = Path(os.environ.get("RA_PROFILE_LOCAL", root / "data" / "private" / "profile.local.toml"))
    if local.exists():
        for key, value in _load(local).items():
            if isinstance(value, dict) and isinstance(profile.get(key), dict):
                profile[key] = {**profile[key], **value}
            else:
                profile[key] = value
    src = _load(root / "config" / "sources.toml")
    s = Settings(profile=profile, sources=src.get("source", []), source_defaults=src.get("defaults", {}), root=root)
    s.store_path = root / "data" / "opportunities.json"
    # Personal tracker/revenue is private by default (repo is public). Override with RA_TRACKER_PATH.
    s.tracker_path = Path(os.environ.get("RA_TRACKER_PATH", root / "data" / "private" / "tracker.json"))
    s.packages_dir = root / "output" / "packages"
    s.public_dashboard = root / "revenue" / "index.html"
    s.local_dashboard = root / "output" / "dashboard.html"
    s.run_log = root / "data" / "run_log.json"
    return s
