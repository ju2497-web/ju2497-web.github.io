// 「마흔의 철학 한 줄」 쇼츠 MP4 + 표지 PNG.
// 실행: NODE_PATH=$(npm root -g) node philo/render.js [ep1 ...]
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const DIR = __dirname, OUT = path.join(DIR, "out"), FPS = 24;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto("file://" + path.join(DIR, "philo.html"));
  let eps = await p.evaluate(() => EPISODES.map((e) => e.id));
  const want = process.argv.slice(2);
  if (want.length) eps = eps.filter((e) => want.includes(e));
  for (const ep of eps) {
    await p.goto("file://" + path.join(DIR, "philo.html") + "?ep=" + ep);
    await p.evaluate(() => document.fonts.ready);
    const dur = await p.evaluate(() => window.DURATION);
    await p.evaluate(() => window.setTime(1.5));
    await p.screenshot({ path: path.join(OUT, `${ep}_cover.png`) });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), ep + "-"));
    const n = Math.round(dur * FPS);
    for (let i = 0; i < n; i++) {
      await p.evaluate((t) => window.setTime(t), i / FPS);
      await p.screenshot({ path: path.join(dir, String(i).padStart(4, "0") + ".jpg"), type: "jpeg", quality: 92 });
    }
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(dir, "%04d.jpg"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", path.join(OUT, `${ep}_shorts.mp4`)]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`${ep}: ${dur.toFixed(1)}초 완료`);
  }
  await b.close();
})();
