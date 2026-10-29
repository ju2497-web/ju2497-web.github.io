#!/usr/bin/env python3
"""「강교수가 직접 해 봤습니다」 블로그를 만든다.

원고: blog-src/*.md (맨 위 --- 사이에 title, date, category, slug, description)
결과: blog/<slug>.html, blog/index.html, sitemap.xml
예전 면접 글(blog/01~03.html)은 docs/블로그-글-10편.md에서 같은 틀로 다시 만든다.

사용: python3 scripts/build-notes.py
날짜가 오늘(한국 시간)보다 뒤인 원고는 공개하지 않는다.
"""
import datetime, html, importlib.util, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "blog-src"
OUT = ROOT / "blog"
SITE = "https://ju2497-web.github.io"
NAME = "강교수가 직접 해 봤습니다"
TAGLINE = "AI로 돈 벌기 · AI 활용 · 건강검진, 보건계열 현직 교수의 실험 기록"
SIGNATURE = "보건계열 현직 교수 강교수가 직접 해 보고 씁니다."
# 뉴스레터 구독 페이지 주소(스티비·메일리 등). 비어 있으면 구독 칸을 숨긴다.
SUBSCRIBE_URL = "https://page.stibee.com/subscriptions/526841"
KST = datetime.timezone(datetime.timedelta(hours=9))
ICON = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E%F0%9F%A7%AA%3C/text%3E%3C/svg%3E"


def inline(text):
    """굵은 글씨와 링크만 지원한다. 나머지는 그대로 이스케이프."""
    out, pos = [], 0
    for m in re.finditer(r"\[([^\]]+)\]\((https?://[^)\s]+|[\w./#-]+)\)|\*\*(.+?)\*\*", text):
        out.append(html.escape(text[pos:m.start()]))
        if m.group(1):
            href = m.group(2)
            ext = href.startswith("http")
            attrs = ' target="_blank" rel="noopener"' if ext else ""
            out.append(f'<a href="{html.escape(href)}"{attrs}>{html.escape(m.group(1))}</a>')
        else:
            out.append(f"<strong>{html.escape(m.group(3))}</strong>")
        pos = m.end()
    out.append(html.escape(text[pos:]))
    return "".join(out)


def render(md):
    """원고에 쓰는 만큼만 지원하는 작은 마크다운 변환기."""
    lines, html_out, i = md.strip().split("\n"), [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        img = re.match(r"^!\[([^\]]*)\]\(([^)\s]+)\)\s*$", line)
        if img:
            alt, src = html.escape(img.group(1)), html.escape(img.group(2))
            html_out.append(f'      <figure><img src="{src}" alt="{alt}" loading="lazy"><figcaption>{alt}</figcaption></figure>'); i += 1; continue
        if line.startswith("### "):
            html_out.append(f"      <h4>{inline(line[4:].strip())}</h4>"); i += 1; continue
        if line.startswith("## "):
            html_out.append(f"      <h3>{inline(line[3:].strip())}</h3>"); i += 1; continue
        if line.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i][1:].strip()); i += 1
            html_out.append(f"      <blockquote><p>{inline(' '.join(buf))}</p></blockquote>"); continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            head = "".join(f"<th>{inline(c)}</th>" for c in rows[0])
            body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
            html_out.append(f'      <div class="tablewrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'); continue
        if re.match(r"^(\d+\.|-) ", line):
            ordered = bool(re.match(r"^\d+\. ", line))
            items = []
            while i < len(lines) and re.match(r"^(\d+\.|-) ", lines[i]):
                items.append(re.sub(r"^(\d+\.|-) ", "", lines[i])); i += 1
            tag = "ol" if ordered else "ul"
            html_out.append(f"      <{tag}>" + "".join(f"<li>{inline(t)}</li>" for t in items) + f"</{tag}>"); continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r"^(#{2,3} |>|\||!\[|(\d+\.|-) )", lines[i]):
            buf.append(lines[i].strip()); i += 1
        html_out.append(f"      <p>{inline(' '.join(buf))}</p>")
    return "\n".join(html_out)


def read_post(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    if not m:
        sys.exit(f"{path.name}: 맨 위에 --- 머리말이 없습니다")
    meta = dict(re.findall(r"^(\w+):\s*(.+)$", m.group(1), re.M))
    for k in ("title", "date", "category", "slug", "description"):
        if k not in meta:
            sys.exit(f"{path.name}: {k}가 없습니다")
    if not re.fullmatch(r"[a-z0-9-]+", meta["slug"]):
        sys.exit(f"{path.name}: slug는 영문 소문자·숫자·하이픈만")
    return dict(meta, body=m.group(2), file=f"{meta['slug']}.html")


def head(title, desc, url):
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(desc)}">
  <link rel="canonical" href="{url}">
  <link rel="alternate" type="application/rss+xml" title="{NAME}" href="{SITE}/blog/feed.xml">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{url}">
  <link rel="icon" href="{ICON}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
  <link rel="stylesheet" href="../css/blog.css">
</head>
<body>
  <header class="top">
    <div class="brand">
      <span class="logo" aria-hidden="true">🧪</span>
      <div>
        <h1><a href="index.html">{NAME}</a></h1>
        <p class="sub">{TAGLINE}</p>
      </div>
    </div>
  </header>
"""


FOOT = """  <footer class="foot">건강 관련 글은 일반 정보이며 진단·치료를 대신하지 않습니다. 투자 권유를 하지 않습니다.</footer>
</body>
</html>
"""


def subscribe_box():
    if not SUBSCRIBE_URL:
        return ""
    return f"""      <aside class="subscribe"><p><strong>새 글을 메일로 받아 보세요.</strong> 월요일부터 토요일까지, 직접 해 본 것만 씁니다. 광고 메일은 보내지 않습니다.</p>
      <a class="btn" href="{html.escape(SUBSCRIBE_URL)}" target="_blank" rel="noopener">무료 구독하기</a></aside>"""


def related_box(p, posts, n=3):
    """같은 갈래의 다른 글을 먼저, 모자라면 최근 글로 채운다. 새 글이 옛 글에서도 이어지도록(내부 링크)."""
    others = [q for q in reversed(posts) if q["file"] != p["file"] and q["category"] != "입시·면접"]
    pick = [q for q in others if q["category"] == p["category"]][:n]
    pick += [q for q in others if q not in pick][: n - len(pick)]
    if not pick:
        return ""
    items = "".join(f'<li><a href="{q["file"]}">{html.escape(q["title"])}</a></li>' for q in pick)
    return f'      <aside class="related"><p><strong>같이 읽으면 좋은 글</strong></p><ul>{items}</ul></aside>'


def post_page(p, prev_p, next_p, posts=()):
    nav = []
    if prev_p:
        nav.append(f'<a href="{prev_p["file"]}">← {html.escape(prev_p["title"])}</a>')
    if next_p:
        nav.append(f'<a href="{next_p["file"]}">{html.escape(next_p["title"])} →</a>')
    return head(f'{p["title"]} | {NAME}', p["description"], f'{SITE}/blog/{p["file"]}') + f"""
  <main class="post">
    <article class="card">
      <p class="meta">{html.escape(p["category"])} · {p["date"]}</p>
      <h2>{html.escape(p["title"])}</h2>
{p["html"]}
      <aside class="sig"><p>{SIGNATURE}</p></aside>
{related_box(p, posts)}
{subscribe_box()}
    </article>
    <nav class="postnav">{" ".join(nav)}</nav>
  </main>
""" + FOOT


def legacy_posts():
    """예전 면접 글 1~3편을 새 틀로 다시 만든다(주소는 그대로)."""
    spec = importlib.util.spec_from_file_location("build_blog", ROOT / "scripts" / "build-blog.py")
    old = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old)
    drafts = old.parse()
    published = json.loads((OUT / "posts.json").read_text(encoding="utf-8"))
    posts = []
    for e in published:
        d = drafts[e["n"]]
        body = "\n".join(f"      <p>{html.escape(x)}</p>" for x in d["paras"])
        posts.append(dict(title=d["candidates"][0], date=e["date"], category="입시·면접",
                          slug=f"{e['n']:02d}", file=f"{e['n']:02d}.html",
                          description=(d["thread"] or d["paras"][0])[:150], html=body))
    return posts


def main():
    today = datetime.datetime.now(KST).date().isoformat()
    posts = legacy_posts()
    for path in sorted(SRC.glob("*.md")):
        p = read_post(path)
        if p["date"] > today:
            print(f"예약(아직 공개 안 함): {p['date']} {p['title']}")
            continue
        p["html"] = render(p["body"])
        posts.append(p)
    posts.sort(key=lambda p: (p["date"], p["file"]))
    for i, p in enumerate(posts):
        prev_p = posts[i - 1] if i > 0 else None
        next_p = posts[i + 1] if i + 1 < len(posts) else None
        (OUT / p["file"]).write_text(post_page(p, prev_p, next_p, posts), encoding="utf-8")
        print(f"blog/{p['file']}  {p['title']}")
    items = "\n".join(f"""      <li class="card">
        <p class="meta">{html.escape(p["category"])} · {p["date"]}</p>
        <h2><a href="{p["file"]}">{html.escape(p["title"])}</a></h2>
        <p>{html.escape(p["description"])}</p>
      </li>""" for p in reversed(posts))
    index = head(NAME, f"{TAGLINE}. {SIGNATURE}", f"{SITE}/blog/") + f"""
  <main class="post">
    <p class="intro">말로 듣는 AI 이야기 말고, 직접 해 본 결과를 씁니다. AI로 돈 버는 법, AI 도구를 일에 쓰는 법, 건강검진 결과지 읽는 법. 월요일부터 토요일까지 매일 한 편씩 올라옵니다.</p>
{subscribe_box()}
    <ul class="postlist">
{items}
    </ul>
  </main>
""" + FOOT
    (OUT / "index.html").write_text(index, encoding="utf-8")
    print("blog/index.html")
    # 날짜가 바뀔 때마다 파일이 달라지지 않도록, 목록은 가장 최근 글 날짜를 쓰고 고정 페이지는 날짜를 적지 않는다.
    latest = max(p["date"] for p in posts)
    urls = [(f"{SITE}/blog/", latest)] + [(f"{SITE}/{x}", None) for x in ("coach.html", "interview.html", "apply.html")]
    urls += [(f"{SITE}/blog/{p['file']}", p["date"]) for p in posts]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{u}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>" for u, d in urls]
    sitemap.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")
    print("sitemap.xml")
    # 새 글 알림용 RSS. 뉴스레터 자동 발송(RSS 이메일)이나 구독 앱이 이 주소를 읽는다.
    def rfc822(d):
        return datetime.datetime.fromisoformat(d).replace(hour=7, tzinfo=KST).strftime("%a, %d %b %Y %H:%M:%S %z")
    entries = "".join(f"""
    <item>
      <title>{html.escape(p["title"])}</title>
      <link>{SITE}/blog/{p["file"]}</link>
      <guid>{SITE}/blog/{p["file"]}</guid>
      <pubDate>{rfc822(p["date"])}</pubDate>
      <category>{html.escape(p["category"])}</category>
      <description>{html.escape(p["description"])}</description>
    </item>""" for p in list(reversed(posts))[:20])
    feed = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>{NAME}</title>
    <link>{SITE}/blog/</link>
    <description>{TAGLINE}</description>
    <language>ko</language>{entries}
  </channel>
</rss>
"""
    (OUT / "feed.xml").write_text(feed, encoding="utf-8")
    print("blog/feed.xml")


if __name__ == "__main__":
    main()
