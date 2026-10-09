// 전자책 PDF 빌드: node book/build.mjs
// manuscript.html을 A4 PDF로 렌더링합니다. 한글 폰트는 Google Fonts(Noto Sans KR)를 쓰므로 네트워크가 필요합니다.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

// 로컬 node_modules에 없으면 전역(npm root -g) playwright를 사용
const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require("playwright"); } catch {}
  const { execSync } = require("node:child_process");
  const g = execSync("npm root -g").toString().trim();
  return require(path.join(g, "playwright"));
}
const { chromium } = loadPlaywright();

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "manuscript.html");
const out = path.join(here, "면접관은-이렇게-듣는다.pdf");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
try {
  const page = await browser.newPage();
  await page.goto("file://" + src, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#5d6b82;text-align:center;font-family:sans-serif">' +
      '면접관은 이렇게 듣는다 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: "22mm", right: "20mm", bottom: "24mm", left: "20mm" },
  });
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`PDF 생성 완료: ${out} (${kb} KB)`);
} finally {
  await browser.close();
}
