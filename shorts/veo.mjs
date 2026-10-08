// 실사 쇼츠 자동 생성: veo-episodes.json 의 프롬프트를 Google Veo(Gemini API)로 보내 MP4를 받는다.
// 필요: 환경 변수 GEMINI_API_KEY (환경 설정의 시크릿으로 등록. 채팅에 붙여 넣지 말 것)
// 실행: node shorts/veo.mjs --models        사용 가능한 Veo 모델 확인
//       node shorts/veo.mjs ep1 [ep2 ...]    지정한 편 생성 (생략하면 전체)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, "out", "veo");
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.VEO_MODEL || "veo-3.1-generate-preview";
const args = process.argv.slice(2);

if (!KEY) {
  console.error("GEMINI_API_KEY 가 없습니다. 환경 설정의 시크릿(또는 환경 변수)으로 등록한 뒤 새 세션에서 실행하세요.");
  process.exit(1);
}
const headers = { "x-goog-api-key": KEY, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}/${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

if (args.includes("--models")) {
  const { models = [] } = await api("models?pageSize=200");
  for (const m of models.filter((m) => m.name.includes("veo"))) console.log(m.name, "-", (m.supportedGenerationMethods || []).join(","));
  process.exit(0);
}

const { style, episodes } = JSON.parse(readFileSync(join(DIR, "veo-episodes.json"), "utf8"));
const want = args.filter((a) => !a.startsWith("--"));
mkdirSync(OUT, { recursive: true });

for (const ep of episodes.filter((e) => !want.length || want.includes(e.id))) {
  const dialogue = ep.dialogue.startsWith("없음") ? "No dialogue." : `Dialogue in Korean: ${ep.dialogue}`;
  const prompt = `${ep.prompt}\n${dialogue}\n${style}`;
  console.log(`${ep.id}: 요청 중 (${MODEL})`);
  let op = await api(`models/${MODEL}:predictLongRunning`, {
    method: "POST",
    body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: "9:16" } }),
  });
  while (!op.done) {
    await sleep(10000);
    op = await api(op.name);
    process.stdout.write(".");
  }
  console.log("");
  if (op.error) { console.error(`${ep.id}: 실패 ${JSON.stringify(op.error)}`); continue; }
  const samples = op.response?.generateVideoResponse?.generatedSamples || [];
  if (!samples.length) { console.error(`${ep.id}: 영상 없음 ${JSON.stringify(op.response).slice(0, 500)}`); continue; }
  const res = await fetch(samples[0].video.uri, { headers: { "x-goog-api-key": KEY } });
  const file = join(OUT, `${ep.id}.mp4`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${ep.id}: 저장 ${file}`);
}
