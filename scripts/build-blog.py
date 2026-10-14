#!/usr/bin/env python3
"""docs/블로그-글-10편.md 원고에서 blog/ 페이지를 만든다.

사용: python3 scripts/build-blog.py            # blog/posts.json에 적힌 편을 모두 다시 생성
     python3 scripts/build-blog.py 3          # 3편을 오늘 날짜로 공개 목록에 추가하고 생성
     python3 scripts/build-blog.py 3 2026-10-20   # 날짜 지정
"""
import json, re, sys, html, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "블로그-글-10편.md"
OUT = ROOT / "blog"
POSTS = OUT / "posts.json"
SIGNATURE = "대학에서 면접 평가에 참여해 온 보건계열 현직 교수가 씁니다."

def parse():
    text = SRC.read_text(encoding="utf-8")
    posts = {}
    for m in re.finditer(r"^## (\d+)편\. (.+?)\n(.*?)(?=^## \d+편\.|\Z)", text, re.S | re.M):
        n, title, body = int(m.group(1)), m.group(2).strip(), m.group(3)
        cand = re.search(r"\*\*제목 후보\*\*:\s*(.+)", body)
        candidates = [c.strip() for c in cand.group(1).split(" / ")] if cand else [title]
        thread = re.search(r"\*\*스레드용[^*]*\*\*\n(.+?)(?:\n\n|\Z)", body, re.S)
        paras = []
        for p in re.split(r"\n\s*\n", body):
            p = p.strip()
            if not p or p.startswith("**제목 후보**") or p.startswith("**스레드용") or p == "---":
                continue
            if thread and p == thread.group(1).strip():
                continue
            paras.append(p)
        posts[n] = dict(n=n, heading=title, candidates=candidates, paras=paras,
                        thread=thread.group(1).strip() if thread else "")
    return posts

def page(post, date, prev_post, next_post):
    title = post["candidates"][0]
    desc = html.escape(post["paras"][0][:110]) + "…"
    body = "\n".join(f"      <p>{html.escape(p)}</p>" for p in post["paras"])
    nav = []
    if prev_post:
        nav.append(f'<a href="{prev_post["n"]:02d}.html">← 이전 글: {html.escape(prev_post["candidates"][0])}</a>')
    if next_post:
        nav.append(f'<a href="{next_post["n"]:02d}.html">다음 글: {html.escape(next_post["candidates"][0])} →</a>')
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} | 면접관이 실제로 보는 것</title>
  <meta name="description" content="{desc}">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E%E2%9C%8D%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
  <link rel="stylesheet" href="../css/blog.css">
</head>
<body>
  <header class="top">
    <div class="brand">
      <span class="logo" aria-hidden="true">✍</span>
      <div>
        <h1><a href="index.html">면접관이 실제로 보는 것</a></h1>
        <p class="sub">대입 면접, 평가자의 자리에서 쓰는 글 · <a href="../coach.html">AI 면접 코치</a></p>
      </div>
    </div>
  </header>

  <main class="post">
    <article class="card">
      <p class="meta">{post["n"]}편 · {date}</p>
      <h2>{html.escape(title)}</h2>
{body}
      <aside class="sig">
        <p>{SIGNATURE} 공개 문항으로 본인 답변을 만들고 실제 평가자의 검수를 받는 서비스는 <a href="../coach.html">AI 면접 코치</a>에서 확인할 수 있습니다. 제 소속 대학 지원자는 받지 않습니다.</p>
      </aside>
    </article>
    <nav class="postnav">{" ".join(nav)}</nav>
  </main>
  <footer class="foot">모든 내용은 일반적인 면접 준비 안내이며, 특정 대학의 평가 기준을 뜻하지 않습니다.</footer>
</body>
</html>
"""

def index(published, posts):
    items = []
    for e in reversed(published):
        p = posts[e["n"]]
        items.append(f"""      <li class="card">
        <p class="meta">{p["n"]}편 · {e["date"]}</p>
        <h2><a href="{p["n"]:02d}.html">{html.escape(p["candidates"][0])}</a></h2>
        <p>{html.escape(p["thread"] or p["paras"][0])}</p>
      </li>""")
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>면접관이 실제로 보는 것</title>
  <meta name="description" content="대입 면접에서 평가자가 실제로 보는 것을 문항 유형별로 설명하는 글. 보건계열 현직 교수가 씁니다.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E%E2%9C%8D%3C/text%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
  <link rel="stylesheet" href="../css/blog.css">
</head>
<body>
  <header class="top">
    <div class="brand">
      <span class="logo" aria-hidden="true">✍</span>
      <div>
        <h1>면접관이 실제로 보는 것</h1>
        <p class="sub">대입 면접, 평가자의 자리에서 쓰는 글 · 매주 한 편 · <a href="../coach.html">AI 면접 코치</a></p>
      </div>
    </div>
  </header>

  <main class="post">
    <p class="intro">{SIGNATURE} 학생들이 가장 많이 하는 오해를 문항 유형별로 하나씩 풀어 갑니다. 새 글은 매주 올라옵니다.</p>
    <ul class="postlist">
{chr(10).join(items)}
    </ul>
  </main>
  <footer class="foot">모든 내용은 일반적인 면접 준비 안내이며, 특정 대학의 평가 기준을 뜻하지 않습니다.</footer>
</body>
</html>
"""

def main(argv):
    posts = parse()
    published = json.loads(POSTS.read_text(encoding="utf-8")) if POSTS.exists() else []
    if len(argv) > 1:
        n = int(argv[1])
        if n not in posts:
            sys.exit(f"{n}편이 원고에 없습니다")
        date = argv[2] if len(argv) > 2 else datetime.date.today().isoformat()
        published = [e for e in published if e["n"] != n] + [dict(n=n, date=date)]
        published.sort(key=lambda e: e["n"])
        POSTS.write_text(json.dumps(published, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT.mkdir(exist_ok=True)
    for i, e in enumerate(published):
        prev_post = posts[published[i-1]["n"]] if i > 0 else None
        next_post = posts[published[i+1]["n"]] if i+1 < len(published) else None
        (OUT / f"{e['n']:02d}.html").write_text(page(posts[e["n"]], e["date"], prev_post, next_post), encoding="utf-8")
        print(f"blog/{e['n']:02d}.html  {posts[e['n']]['candidates'][0]}")
    (OUT / "index.html").write_text(index(published, posts), encoding="utf-8")
    print("blog/index.html")

if __name__ == "__main__":
    main(sys.argv)
