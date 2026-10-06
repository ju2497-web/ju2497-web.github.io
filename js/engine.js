// 규칙 기반 답변 엔진: 문의 분석(전형·질문자·의도 매칭) → 채널별 답변 조립.

const SUSI_HINTS = ["수시", "교과", "종합", "학종", "논술", "면접", "학생부", "생기부", "최저", "6회", "6장", "자소서", "실기"];
const JUNGSI_HINTS = ["정시", "가군", "나군", "다군", "백분위", "표준점수", "표점", "환산", "추가모집", "모집군", "수능 반영", "수능반영"];
const PARENT_HINTS = ["학부모", "자녀", "아이가", "아이는", "아이의", "딸", "아들", "저희 애", "우리 애", "애가"];

const strip = (s) => s.toLowerCase().replace(/\s+/g, "");

function bigrams(s) {
  const t = strip(s).replace(/[^\p{L}\p{N}]/gu, "");
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / Math.min(A.size, B.size);
}

const countHits = (text, list) => list.filter((k) => text.includes(strip(k))).length;

export function detectTrack(text) {
  const t = strip(text);
  const s = countHits(t, SUSI_HINTS);
  const j = countHits(t, JUNGSI_HINTS);
  if (s === 0 && j === 0) return "공통";
  if (s > 0 && j > 0) return s === j ? "수시·정시" : s > j ? "수시" : "정시";
  return s > j ? "수시" : "정시";
}

export function detectAsker(text) {
  const t = strip(text);
  return PARENT_HINTS.some((k) => t.includes(strip(k))) ? "학부모" : "학생";
}

export function scoreEntries(text, kb, track) {
  const t = strip(text);
  return kb
    .map((entry) => {
      const hits = [];
      let score = 0;
      for (const kw of entry.keywords || []) {
        const k = strip(kw);
        if (k && t.includes(k)) {
          hits.push(kw);
          score += k.length >= 3 ? 2 : 1.5;
        }
      }
      score += similarity(text, entry.question || entry.title) * 4;
      if (track !== "공통" && track !== "수시·정시") {
        if (entry.track === track) score += 1.5;
        else if (entry.track === (track === "수시" ? "정시" : "수시")) score -= 1.5;
      }
      return { entry, score: Math.round(score * 10) / 10, hits };
    })
    .sort((a, b) => b.score - a.score);
}

export function analyze(text, kb, { threshold = 2.5, max = 3 } = {}) {
  const track = detectTrack(text);
  const asker = detectAsker(text);
  const ranked = scoreEntries(text, kb, track);
  const top = ranked[0]?.score || 0;
  const matches = ranked
    .filter((r) => r.score >= threshold && r.score >= top * 0.55 && r.hits.length > 0)
    .slice(0, max);
  return { track, asker, matches, ranked };
}

// ───────── 템플릿 변수 치환 ─────────
// 값의 마지막 글자 받침에 맞춰 조사를 고릅니다. 예) {{대학명}}은 → ○○대학교는
const PARTICLES = { 은: ["은", "는"], 는: ["은", "는"], 이: ["이", "가"], 가: ["이", "가"], 을: ["을", "를"], 를: ["을", "를"], 과: ["과", "와"], 와: ["과", "와"] };
function hasBatchim(word) {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[0-9lmnr]$/i.test(word.trim()) && !/[2459]$/.test(word.trim());
}

export function fill(template, settings, missing) {
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}(?:(은|는|이|가|을|를|과|와)(?![가-힣]))?/g, (_, key, josa) => {
    const v = (settings[key] ?? "").toString().trim();
    if (!v) {
      missing?.add(key);
      return `[설정 필요: ${key}]` + (josa ? PARTICLES[josa][0] : "");
    }
    return v + (josa ? PARTICLES[josa][hasBatchim(v) ? 0 : 1] : "");
  });
}

// ───────── 답변 조립 ─────────
const firstPara = (s) => s.split(/\n\s*\n/)[0];

export function compose({ inquiry, entries, settings, channel = "email", tone = "formal", asker = "학생", name = "" }) {
  const missing = new Set();
  const f = (s) => fill(s, settings, missing);
  const uni = f("{{대학명}}");
  const who = name ? `${name} ${asker === "학부모" ? "학부모님" : "님"}` : asker === "학부모" ? "학부모님" : "수험생님";
  const friendly = tone === "friendly";

  const bodies = entries.map((e) => ({
    title: e.title,
    full: f(e.answer),
    short: f(firstPara(e.answer)),
  }));

  const noMatch = `문의하신 내용은 정확한 확인이 필요한 사항으로, 담당자가 확인한 뒤 다시 안내해 드리겠습니다. 급하신 경우 입학처(${f("{{입학처전화}}")})로 연락 주시면 바로 도와드리겠습니다.`;
  const disclaimer = `※ 위 안내는 일반적인 사항이며, 최종 기준은 ${f("{{학년도}}")}학년도 ${uni} 모집요강을 따릅니다.`;
  const contact = `문의: ${uni} 입학처 ${f("{{입학처전화}}")} / ${f("{{입학처이메일}}")}\n홈페이지: ${f("{{입학처홈페이지}}")}`;

  const join = (list, useShort) => {
    if (!list.length) return noMatch;
    if (list.length === 1) return useShort ? list[0].short : list[0].full;
    return list.map((b, i) => `${i + 1}. ${b.title}\n${useShort ? b.short : b.full}`).join("\n\n");
  };

  let out = "";
  let subject = "";

  if (channel === "email") {
    subject = `[${uni} 입학처] 문의하신 내용에 대한 답변드립니다${bodies[0] ? ` – ${bodies[0].title}` : ""}`;
    out = [
      `${who}, 안녕하세요.`,
      `${uni} 입학처입니다. ${friendly ? `저희 대학에 관심 가져 주셔서 정말 감사합니다! 문의하신 내용을 안내해 드릴게요.` : `저희 대학에 관심을 가져 주셔서 감사드리며, 문의하신 내용에 대해 다음과 같이 답변드립니다.`}`,
      join(bodies, false),
      disclaimer,
      friendly ? `더 궁금한 점이 있으면 언제든 편하게 문의해 주세요. 좋은 결과 있기를 응원할게요!` : `추가로 궁금하신 사항이 있으시면 언제든지 문의해 주시기 바랍니다. 좋은 결과 있으시기를 기원합니다.`,
      `감사합니다.\n\n${f("{{담당자}}")} 드림\n${contact}`,
    ].join("\n\n");
  } else if (channel === "board") {
    out = [
      `안녕하세요, ${uni} 입학처입니다.`,
      friendly ? `문의 남겨 주셔서 감사합니다 :)` : `문의해 주셔서 감사합니다.`,
      join(bodies, false),
      disclaimer,
      `추가 문의는 입학처(${f("{{입학처전화}}")})로 연락 주시기 바랍니다. 감사합니다.`,
    ].join("\n\n");
  } else if (channel === "kakao") {
    out = [
      `안녕하세요, ${uni} 입학처입니다${friendly ? " 😊" : "."}`,
      join(bodies, true),
      `자세한 사항은 모집요강(${f("{{입학처홈페이지}}")})을 확인해 주세요.`,
      friendly ? `더 궁금한 점 있으면 편하게 물어봐 주세요!` : `추가 문의는 ${f("{{입학처전화}}")}로 연락 주시기 바랍니다. 감사합니다.`,
    ].join("\n\n");
  } else if (channel === "phone") {
    const lines = bodies.length
      ? bodies.map((b) => `상담원: ${b.short}`).join("\n\n")
      : `상담원: ${noMatch}`;
    out = [
      `상담원: 네, ${uni} 입학처입니다. 무엇을 도와드릴까요?`,
      `(문의 내용 확인: "${inquiry.trim().slice(0, 80)}${inquiry.trim().length > 80 ? "…" : ""}")`,
      lines,
      `상담원: 정확한 기준은 ${f("{{학년도}}")}학년도 모집요강에서 한 번 더 확인 부탁드립니다. 혹시 더 궁금하신 점 있으실까요?`,
      `상담원: 네, 문의해 주셔서 감사합니다. 좋은 결과 있으시길 바랍니다.`,
    ].join("\n\n");
  }

  return { subject, text: out, missing: [...missing] };
}
