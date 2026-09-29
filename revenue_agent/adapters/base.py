"""Shared adapter helpers."""
from __future__ import annotations


class SkipSource(Exception):
    """Source cannot run right now (e.g. missing credential). Reported, not an error."""


def matches(text: str, include: list[str] | None) -> bool:
    if not include:
        return True
    low = (text or "").lower()
    return any(k.lower() in low for k in include)
