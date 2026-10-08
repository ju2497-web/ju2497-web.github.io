// apps.mjs 설정으로 lab/<slug>/index.html, lab/index.html, lab/ads.csv 를 만든다.
// 실행: node lab/build.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apps } from "./apps.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = "https://ju2497-web.github.io/lab";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const won = (n) => n.toLocaleString("ko-KR") + "원";

function frame(side, f, img) {
  const inner = img
    ? `<img src="${esc(img)}" alt="${esc(f.label)} 예시">`
    : `<div class="ic" aria-hidden="true">${f.icon}</div>`;
  return `<div class="frame ${side}">${inner}<div class="lb">${esc(f.label)}</div></div>`;
}

function page(a) {
  const [imgB, imgA] = a.images || [];
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(a.title)}</title>
<meta name="description" content="${esc(a.sub)}">
<meta property="og:title" content="${esc(a.emoji + " " + a.title)}">
<meta property="og:description" content="${esc(a.sub)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/${a.slug}/">
<meta name="theme-color" content="${a.color}">
<link rel="stylesheet" href="../lab.css">
<style>:root{--accent:${a.color}}</style>
<script src="../config.js"></script>
</head>
<body data-app="${a.slug}" data-price="${a.price}">
<main class="wrap">
  <span class="badge">${esc(a.target)}</span>
  <h1>${esc(a.title)}</h1>
  <p class="sub">${esc(a.sub)}</p>

  <div class="ba">
    ${frame("before", a.before, imgB)}
    <div class="arrow" aria-hidden="true">→</div>
    ${frame("after", a.after, imgA)}
  </div>
  <p class="note">${imgA ? "예시 결과물입니다" : "결과물 구성 안내 그림입니다"}</p>

  <button class="cta" data-cta="hero">${esc(a.cta)} · ${won(a.price)}</button>

  <section class="card">
    <h2>이렇게 만들어져요</h2>
    <ol>
      <li>사진을 올립니다 (${esc(a.before.label)})</li>
      <li>AI가 몇 분 안에 결과물을 만듭니다</li>
      <li>휴대폰으로 바로 받아 저장하고 공유합니다</li>
    </ol>
  </section>

  <section class="card">
    <h2>받으시는 것</h2>
    <ul>${a.gets.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
  </section>

  <section class="card">
    <div class="price"><b>${won(a.price)}</b><span>${esc(a.anchor)}</span></div>
    <p class="sub" style="margin:6px 0 0">${esc(a.occasion)}</p>
  </section>

  <section class="card faq">
    <h2>자주 묻는 질문</h2>
    <details><summary>올린 사진은 어떻게 되나요?</summary><p>결과물을 만든 직후 서버에서 삭제하며, 다른 용도로 쓰지 않습니다.</p></details>
    <details><summary>얼마나 걸리나요?</summary><p>보통 몇 분 안에 완성됩니다.</p></details>
    <details><summary>결과가 마음에 안 들면요?</summary><p>한 번 무료로 다시 만들어 드립니다.</p></details>
  </section>

  <footer>AI로 만든 재미·기념용 결과물이며 실제 인물·미래를 보장하지 않습니다.</footer>
</main>

<div class="sticky"><button class="cta" data-cta="sticky">${esc(a.cta)} · ${won(a.price)}</button></div>

<div class="modal" id="modal" role="dialog" aria-modal="true" aria-labelledby="mt">
  <div class="sheet">
    <h3 id="mt">🎉 오픈 준비 중이에요</h3>
    <p>지금 알림을 신청하시면 오픈 즉시 <b>50% 할인</b>으로 가장 먼저 만들어 드립니다. 지금은 결제되지 않습니다.</p>
    <form id="wait">
      <input id="contact" type="text" inputmode="email" autocomplete="email" placeholder="이메일 또는 휴대폰 번호">
      <button class="cta" type="submit">50% 할인 알림 받기</button>
    </form>
    <button class="x" id="close" type="button">닫기</button>
  </div>
</div>
<script src="../lab.js"></script>
</body>
</html>
`;
}

function hub() {
  const rows = apps
    .map((a) => `<a href="${a.slug}/"><span class="e">${a.emoji}</span><span><b>${esc(a.title)}</b><small>${esc(a.target)} · ${won(a.price)}</small></span></a>`)
    .join("\n    ");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>판매 테스트 실험실</title>
<link rel="stylesheet" href="lab.css">
<script src="config.js"></script>
</head>
<body data-app="hub">
<main class="wrap">
  <h1>판매 테스트 실험실</h1>
  <p class="sub">앱 ${apps.length}개의 판매 페이지입니다. 광고는 각 페이지 주소로 직접 연결하세요.</p>
  <div class="grid">
    ${rows}
  </div>
</main>
<script src="lab.js"></script>
</body>
</html>
`;
}

for (const a of apps) {
  const dir = join(ROOT, a.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), page(a));
}
writeFileSync(join(ROOT, "index.html"), hub());

const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
const ads = [["app", "headline", "primary_text", "cta", "url"]]
  .concat(apps.map((a) => [a.slug, a.title, `${a.sub} ${won(a.price)}.`, a.cta, `${SITE}/${a.slug}/?utm_source=meta&utm_campaign=fakedoor&utm_content=${a.slug}`]))
  .map((r) => r.map(csv).join(","))
  .join("\n");
writeFileSync(join(ROOT, "ads.csv"), "﻿" + ads + "\n");

console.log(`built ${apps.length} pages + hub + ads.csv`);
