"""Revenue Agent CLI.

  python -m revenue_agent run                 # 수집→분류→점수→저장→지원 패키지→대시보드
  python -m revenue_agent run --only seeds    # 특정 소스만
  python -m revenue_agent list [--priority S,A]
  python -m revenue_agent show ID
  python -m revenue_agent add --org ORG --title TITLE --url URL [--deadline 2026-10-31] [--pay "USD 80/hour"] [--desc TEXT]
  python -m revenue_agent track ID APPLIED [--note ...] [--follow-up 2026-10-10]
  python -m revenue_agent expect ID 3000000 [--currency KRW]
  python -m revenue_agent earn ID 1500 --currency USD [--hours 10]
  python -m revenue_agent metrics
  python -m revenue_agent import-tracker revenue-tracker.json
  python -m revenue_agent packages [--id ID ...]
  python -m revenue_agent dashboard [--public]
  python -m revenue_agent rescore
"""
from __future__ import annotations

import argparse
import json
import sys

from .config import load_settings
from .dashboard import render, write_dashboard
from .packages import write_packages
from .pipeline import build_opportunity, rescore_all, run
from .store import Store
from .tracker import Tracker, compute_metrics


def _opps_sorted(store: Store) -> list[dict]:
    return sorted(store.opps.values(), key=lambda o: -o.get("score", 0))


def _run_log(settings) -> dict | None:
    return json.loads(settings.run_log.read_text(encoding="utf-8")) if settings.run_log.exists() else None


def build_outputs(settings, public_only: bool = False) -> list[str]:
    store = Store(settings.store_path)
    opps = _opps_sorted(store)
    run_log = _run_log(settings)
    written = []
    public_html = render(opps, settings, run_log, None, set(), public=True)
    written.append(str(write_dashboard(settings.public_dashboard, public_html)))
    if not public_only:
        pkgs = write_packages(opps, settings)
        tracker = Tracker(settings.tracker_path, settings.goal_krw)
        local_html = render(opps, settings, run_log, tracker.data, {p.stem for p in pkgs}, public=False)
        written.append(str(write_dashboard(settings.local_dashboard, local_html)))
        written.append(f"{len(pkgs)} packages → {settings.packages_dir}")
    return written


def _get(store: Store, oid: str) -> dict:
    if oid in store.opps:
        return store.opps[oid]
    matches = [o for k, o in store.opps.items() if k.startswith(oid)]
    if len(matches) == 1:
        return matches[0]
    sys.exit(f"opportunity not found: {oid}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="revenue_agent", description="Revenue Agent – 고단가 수익 기회 엔진")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("run"); p.add_argument("--only", nargs="*"); p.add_argument("--public-only", action="store_true")
    p = sub.add_parser("list"); p.add_argument("--priority", default="S,A,B"); p.add_argument("--all", action="store_true")
    p = sub.add_parser("show"); p.add_argument("id")
    p = sub.add_parser("add")
    for a in ("--org", "--title", "--url"):
        p.add_argument(a, required=True)
    p.add_argument("--deadline"); p.add_argument("--pay", default=""); p.add_argument("--desc", default="")
    p.add_argument("--type", dest="ptype", choices=["individual", "firm_only", "consortium", "roster", "platform", "job"])
    p.add_argument("--korea", choices=["yes", "no", "unknown"]); p.add_argument("--remote", choices=["remote", "hybrid", "onsite"])
    p = sub.add_parser("track"); p.add_argument("id"); p.add_argument("status"); p.add_argument("--note", default="")
    p.add_argument("--follow-up"); p.add_argument("--date")
    p = sub.add_parser("expect"); p.add_argument("id"); p.add_argument("amount", type=float); p.add_argument("--currency", default="KRW")
    p = sub.add_parser("earn"); p.add_argument("id"); p.add_argument("amount", type=float)
    p.add_argument("--currency", default="KRW"); p.add_argument("--hours", type=float); p.add_argument("--note", default="")
    p.add_argument("--date")
    sub.add_parser("metrics")
    p = sub.add_parser("import-tracker"); p.add_argument("path")
    p = sub.add_parser("packages"); p.add_argument("--id", nargs="*")
    p = sub.add_parser("dashboard"); p.add_argument("--public", action="store_true")
    sub.add_parser("rescore")
    args = ap.parse_args(argv)
    s = load_settings()

    if args.cmd == "run":
        report = run(s, only=args.only)
        print(json.dumps(report["counts"], ensure_ascii=False), f"expired={report['expired']}")
        for src in report["sources"]:
            print(f"  {src['status']:8} {src['id']:24} items={src['items']:<4} {src.get('message', '')}")
        for line in build_outputs(s, public_only=args.public_only):
            print("  →", line)
        return 0

    store = Store(s.store_path)
    if args.cmd == "list":
        wanted = set(args.priority.split(","))
        for o in _opps_sorted(store):
            if args.all or o.get("priority") in wanted:
                print(f"{o['priority']:>6} {o['score']:>3}  {o['id']}  {o['organization'][:30]:30}  {o['title'][:70]}")
        return 0
    if args.cmd == "show":
        print(json.dumps(_get(store, args.id), ensure_ascii=False, indent=1))
        return 0
    if args.cmd == "add":
        raw = {"organization": args.org, "title": args.title, "url": args.url, "deadline": args.deadline,
               "compensation_text": args.pay, "description": f"{args.desc} {args.pay}", "source": "manual",
               "source_type": "manual", "verification": "manual", "procurement_type": args.ptype,
               "korea_eligible": args.korea, "remote": args.remote}
        opp = build_opportunity(raw, s)
        opp["procurement_type_seed"] = args.ptype
        result = store.upsert(opp)
        store.save()
        print(result, opp["id"], opp["priority"], opp["score"], "–", opp["next_action"])
        build_outputs(s)
        return 0
    if args.cmd == "rescore":
        rescore_all(store, s)
        store.save()
        print("\n".join(build_outputs(s)))
        return 0
    if args.cmd == "packages":
        paths = write_packages(_opps_sorted(store), s, only_ids=[_get(store, i)["id"] for i in args.id] if args.id else None)
        print("\n".join(str(x) for x in paths) or "no S/A opportunities")
        return 0
    if args.cmd == "dashboard":
        print("\n".join(build_outputs(s, public_only=args.public)))
        return 0

    tracker = Tracker(s.tracker_path, s.goal_krw)
    if args.cmd == "track":
        e = tracker.set_status(_get(store, args.id), args.status, args.note, args.follow_up, args.date)
        tracker.save()
        print(args.id, "→", e["status"], "follow-up:", e.get("follow_up"))
    elif args.cmd == "expect":
        tracker.set_expected(_get(store, args.id)["id"], args.amount, args.currency, s.fx)
        tracker.save()
    elif args.cmd == "earn":
        e = tracker.add_payment(_get(store, args.id), args.amount, args.currency, s.fx, args.hours, args.note, args.date)
        tracker.save()
        print("recorded; status", e["status"])
    elif args.cmd == "import-tracker":
        with open(args.path, encoding="utf-8") as fh:
            n = tracker.merge(json.load(fh))
        tracker.save()
        print(f"merged {n} entries into {s.tracker_path}")
    elif args.cmd == "metrics":
        m = compute_metrics(tracker, store.opps, s.fx)
        print(json.dumps(m, ensure_ascii=False, indent=1))
        return 0
    build_outputs(s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
