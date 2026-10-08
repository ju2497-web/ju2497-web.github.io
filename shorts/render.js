// 4컷 PNG와 쇼츠 MP4를 만든다.
// 실행: NODE_PATH=$(npm root -g) node shorts/render.js [ep1 ep2 ...] [--comic-only]
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const OUT = path.join(DIR, "out");
const FPS = 24;
const args = process.argv.slice(2);
const comicOnly = args.includes("--comic-only");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const url = (mode, ep) => "file://" + path.join(DIR, "studio.html") + `?mode=${mode}&ep=${ep}`;

  const probe = await browser.newPage();
  await probe.goto(url("comic", "ep1"));
  let eps = await probe.evaluate(() => EPISODES.map((e) => e.id));
  await probe.close();
  const want = args.filter((a) => !a.startsWith("--"));
  if (want.length) eps = eps.filter((e) => want.includes(e));

  for (const ep of eps) {
    const c = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await c.goto(url("comic", ep));
    await c.evaluate(() => document.fonts.ready);
    await c.screenshot({ path: path.join(OUT, `${ep}_4cut.png`) });
    await c.close();
    console.log(`${ep}: 4컷 완료`);
    if (comicOnly) continue;

    const v = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    await v.goto(url("video", ep));
    await v.evaluate(() => document.fonts.ready);
    const dur = await v.evaluate(() => window.DURATION);
    const frames = fs.mkdtempSync(path.join(require("os").tmpdir(), `${ep}-`));
    const n = Math.round(dur * FPS);
    for (let i = 0; i < n; i++) {
      await v.evaluate((t) => window.setTime(t), i / FPS);
      await v.screenshot({ path: path.join(frames, `${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92 });
    }
    await v.close();
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(frames, "%04d.jpg"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21", "-movflags", "+faststart", path.join(OUT, `${ep}_shorts.mp4`)]);
    fs.rmSync(frames, { recursive: true, force: true });
    console.log(`${ep}: 쇼츠 완료 (${dur.toFixed(1)}초, ${n}프레임)`);
  }
  await browser.close();
})();
