"""Polite HTTP client: robots.txt, per-host rate limit, retries. Injectable for tests."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser


class FetchError(Exception):
    pass


class Fetcher:
    def __init__(self, user_agent: str, timeout: float = 25, per_host_delay: float = 2.0, retries: int = 2):
        self.user_agent = user_agent
        self.timeout = timeout
        self.delay = per_host_delay
        self.retries = retries
        self._last: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    # robots.txt is honoured for HTML pages; official APIs are designed for programmatic use.
    def allowed(self, url: str) -> bool:
        parts = urllib.parse.urlsplit(url)
        base = f"{parts.scheme}://{parts.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                raw = self._raw(base + "/robots.txt", check_robots=False)
                rp.parse(raw.decode("utf-8", "replace").splitlines())
            except FetchError:
                rp = None  # no robots.txt reachable → treat as allowed
            self._robots[base] = rp
        rp = self._robots[base]
        return True if rp is None else rp.can_fetch(self.user_agent, url)

    def _wait(self, host: str) -> None:
        last = self._last.get(host)
        if last is not None:
            gap = time.monotonic() - last
            if gap < self.delay:
                time.sleep(self.delay - gap)
        self._last[host] = time.monotonic()

    def _raw(self, url: str, data: bytes | None = None, headers: dict | None = None, check_robots: bool = True) -> bytes:
        if check_robots and not self.allowed(url):
            raise FetchError(f"robots.txt disallows {url}")
        host = urllib.parse.urlsplit(url).netloc
        req = urllib.request.Request(url, data=data, headers={"User-Agent": self.user_agent, **(headers or {})})
        last_err: Exception | None = None
        for attempt in range(self.retries + 1):
            self._wait(host)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return resp.read()
            except urllib.error.HTTPError as e:
                last_err = e
                if e.code in (401, 403, 404, 410):
                    break  # not retryable; access restrictions are respected, never bypassed
                if e.code == 429:
                    time.sleep(10 * (attempt + 1))
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                last_err = e
            time.sleep(2 ** attempt)
        raise FetchError(f"{url}: {last_err}")

    def get_text(self, url: str, check_robots: bool = True) -> str:
        return self._raw(url, check_robots=check_robots).decode("utf-8", "replace")

    def get_json(self, url: str):
        return json.loads(self._raw(url, headers={"Accept": "application/json"}, check_robots=False))

    def post_json(self, url: str, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        return json.loads(self._raw(url, data=body, headers={"Content-Type": "application/json", "Accept": "application/json"}, check_robots=False))


class FixtureFetcher:
    """Offline fetcher for tests/demo: maps URL prefixes to fixture files."""

    def __init__(self, mapping: dict[str, str]):
        self.mapping = mapping
        self.calls: list[str] = []

    def _find(self, url: str) -> str:
        self.calls.append(url)
        for prefix, path in self.mapping.items():
            if url.startswith(prefix):
                with open(path, encoding="utf-8") as fh:
                    return fh.read()
        raise FetchError(f"no fixture for {url}")

    def allowed(self, url: str) -> bool:
        return True

    def get_text(self, url: str, check_robots: bool = True) -> str:
        return self._find(url)

    def get_json(self, url: str):
        return json.loads(self._find(url))

    def post_json(self, url: str, payload: dict):
        return json.loads(self._find(url))
