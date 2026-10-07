// 교수 채점 기준점(모범답안 3단계): 불러오기, 같은 질문 찾기, 내 점수 위치 설명.
const strip = (s) => (s || "").replace(/[^\p{L}\p{N}]/gu, "");
function bigrams(s) { const t = strip(s), set = new Set(); for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2)); return set; }
function sim(a, b) { const A = bigrams(a), B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; for (const g of A) if (B.has(g)) n++; return n / Math.max(A.size, B.size); }

let cache = null;
export async function loadAnchors(url = "data/anchors.json") {
  if (cache) return cache;
  try { cache = (await (await fetch(url, { cache: "no-cache" })).json()).items || []; } catch { cache = []; }
  try { const local = JSON.parse(localStorage.getItem("coach.anchors.local") || "null"); if (Array.isArray(local)) { const m = new Map(cache.map((x) => [x.id, x])); local.forEach((x) => m.set(x.id, x)); cache = [...m.values()]; } } catch {}
  return cache;
}

// 같은 질문(문장 유사도 0.55 이상)의 기준점
export function findAnchor(items, question) {
  let best = null, bestS = 0;
  for (const it of items) { const s = sim(it.question, question); if (s > bestS) { best = it; bestS = s; } }
  return bestS >= 0.55 ? best : null;
}

export function placement(score, levels) {
  const sorted = [...levels].sort((a, b) => a.score - b.score);
  if (score >= sorted[sorted.length - 1].score) return `내 답변 ${score}점은 교수 기준 ‘${sorted[sorted.length - 1].level}’ 수준이에요.`;
  if (score < sorted[0].score) return `내 답변 ${score}점은 교수 기준 ‘${sorted[0].level}’보다 아래예요.`;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (score >= sorted[i].score && score < sorted[i + 1].score) return `내 답변 ${score}점은 교수 기준 ‘${sorted[i].level}’과 ‘${sorted[i + 1].level}’ 사이예요.`;
  }
  return "";
}
