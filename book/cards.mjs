// 상세페이지 이미지 내보내기: node book/cards.mjs
// book.html의 각 섹션(data-card)을 860px 너비 PNG로 저장합니다. 크몽·래피드 상세 이미지로 그대로 올립니다.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require("playwright"); } catch {}
  const g = require("node:child_process").execSync("npm root -g").toString().trim();
  return require(path.join(g, "playwright"));
}
const { chromium } = loadPlaywright();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "book", "detail");
fs.mkdirSync(outDir, { recursive: true });

// 정적 서버(ES 모듈은 file://로 못 읽음)
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 860, height: 1200 }, deviceScaleFactor: 2 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`http://localhost:${port}/book.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const cards = await page.$$("[data-card]");
  for (const el of cards) {
    const name = await el.getAttribute("data-card");
    const file = path.join(outDir, `${name}.png`);
    await el.screenshot({ path: file });
    console.log("저장:", path.relative(root, file));
  }
} finally {
  await browser.close();
  server.close();
}
