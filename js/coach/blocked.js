// 이해충돌 차단 대학 검사. 대학명은 저장소 어디에도 적지 않고, 정규화한 이름의 SHA-256 해시만 config.js에 둡니다.
// 정규화: 공백 제거, 끝의 "대학교/대학/대" 제거. (예: "○○대학교", "○○대", "○○ 대학" → 모두 "○○")
import { CONFIG } from "./config.js";

const cache = new Map();
export const normUniv = (u) => String(u || "").normalize("NFC").replace(/\s+/g, "").replace(/(대학교|대학|대)$/, "");

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 비동기 검사(자유 입력 대학명에 사용)
export async function checkBlocked(u) {
  const k = normUniv(u);
  if (!k) return false;
  if (cache.has(k)) return cache.get(k);
  let blocked = false;
  try { blocked = CONFIG.blockedUniversityHashes.includes(await sha256(k)); } catch { blocked = false; }
  cache.set(k, blocked);
  return blocked;
}

// 목록을 미리 계산해 두면 이후 isBlocked()를 동기로 쓸 수 있습니다.
export async function preloadBlocked(names) {
  await Promise.all([...new Set(names || [])].map(checkBlocked));
}
export const isBlocked = (u) => cache.get(normUniv(u)) === true;

// 자유 문장(숨고 요청 등)에서 대학명 후보를 뽑아 하나라도 차단 대학이면 true
export async function textHasBlocked(text) {
  const names = [...String(text || "").matchAll(/([가-힣A-Za-z]{2,12})(?:대학교|대학|대)(?![가-힣])/g)].map((m) => m[0]);
  const r = await Promise.all(names.map(checkBlocked));
  return r.some(Boolean);
}
