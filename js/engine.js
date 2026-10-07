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

// ───────── 진정성: 상황별 공감 문장과 맺음말 ─────────
const SITUATIONS = [
  { id: "mistake", label: "실수·당황", hints: ["잘못", "실수", "깜빡", "놓쳤", "당황", "어떡", "어떻게 해야"],
    open: () => "많이 당황하셨을 텐데, 지금부터 하나씩 차분히 안내해 드리겠습니다.",
    close: () => "처리 과정에서 막히는 부분이 있으면 바로 연락 주세요. 끝까지 함께 확인해 드리겠습니다." },
  { id: "waiting", label: "결과 대기", hints: ["예비", "추합", "충원", "발표", "결과", "기다"],
    open: () => "결과를 기다리는 시간이 무척 길게 느껴지실 줄 압니다. 그 마음을 헤아리며 아는 범위에서 최대한 구체적으로 말씀드리겠습니다.",
    close: () => "기다리는 동안 마음 졸이지 않으시도록, 일정이 확정되는 대로 빠르게 안내하겠습니다. 좋은 소식으로 다시 연락드릴 수 있기를 바랍니다." },
  { id: "retry", label: "재도전(N수)", hints: ["재수", "삼수", "n수", "반수", "졸업생", "다시 도전", "재도전"],
    open: () => "다시 도전하기로 결심하기까지 많은 고민과 용기가 필요하셨을 것 같습니다. 그 결정이 헛되지 않도록 정확하게 안내해 드리겠습니다.",
    close: () => "한 해를 더 준비하는 그 노력이 꼭 좋은 결실로 이어지기를 진심으로 응원합니다." },
  { id: "anxious", label: "불안·고민", hints: ["불안", "걱정", "고민", "막막", "모르겠", "자신이 없", "괜찮을까", "가능할까", "될까요", "있을까요"],
    open: (a) => a === "학부모" ? "자녀의 입시를 지켜보시는 마음이 얼마나 무거우실지 짐작이 됩니다. 조금이나마 고민을 덜어 드릴 수 있도록 성실히 답변드리겠습니다." : "입시를 앞두고 고민이 많은 시기라는 것을 잘 알고 있습니다. 조금이나마 막막함을 덜 수 있도록 성실히 답변드리겠습니다.",
    close: () => "혼자 고민하기보다 언제든 물어봐 주세요. 입학처는 지원 전 과정에서 든든한 상담 창구가 되겠습니다." },
  { id: "geomjeong", label: "검정고시", hints: ["검정고시", "검시", "자퇴", "홈스쿨"],
    open: () => "자신만의 길을 걸어오며 준비하신 만큼, 지원 과정에서 불리함이 없도록 꼼꼼히 안내해 드리겠습니다.",
    close: () => "걸어오신 길이 다른 만큼 더 단단한 강점이 되리라 믿습니다. 지원 과정에서 필요한 부분은 언제든 도와드리겠습니다." },
  { id: "aptitude", label: "적성·진로 탐색", hints: ["적성", "문과", "맞을까", "진로", "꿈", "관심", "무엇을 배", "뭘 배", "어떤 학과"],
    open: () => "진로를 진지하게 고민하며 학과를 알아보시는 모습이 인상 깊습니다. 실제 학생들이 배우고 경험하는 내용을 중심으로 말씀드리겠습니다.",
    close: () => "학과가 궁금하시다면 입학설명회나 학과 체험 프로그램에 직접 와 보셔도 좋습니다. 직접 보고 느끼시는 것이 가장 정확한 답이 될 것입니다." },
  { id: "parent", label: "학부모 문의", hints: ["학부모", "자녀", "아이가", "아이는", "딸", "아들", "저희 애", "우리 애"],
    open: () => "자녀의 진로를 함께 고민하며 직접 문의해 주셔서 감사합니다. 학부모님께서 판단하시는 데 도움이 되도록 정확하게 안내해 드리겠습니다.",
    close: () => "자녀분께 가장 좋은 선택이 될 수 있도록 입학처도 정성껏 돕겠습니다." },
];
const DEFAULT_OPEN = "꼼꼼하게 알아보고 문의해 주셔서 감사합니다. 궁금하신 내용을 정확하게 안내해 드리겠습니다.";
const DEFAULT_CLOSE = "준비하시는 과정이 좋은 결과로 이어지기를 진심으로 응원합니다.";

export function detectSituation(text) {
  const t = strip(text);
  return SITUATIONS.find((s) => s.hints.some((h) => t.includes(strip(h)))) || null;
}

// ───────── 담당자 메모 → 완성 문장 ─────────
const ENDINGS = [
  [/불가능?$/, "불가능합니다."], [/가능$/, "가능합니다."], [/있음$/, "있습니다."], [/없음$/, "없습니다."],
  [/됨$/, "됩니다."], [/함$/, "합니다."], [/임$/, "입니다."], [/필요$/, "필요합니다."], [/예정$/, "예정입니다."],
  [/권장$/, "권장합니다."], [/추천$/, "추천드립니다."], [/(참고|참조)$/, "$1해 주시기 바랍니다."],
  [/확인$/, "확인해 주시기 바랍니다."], [/(요망|바람|부탁)$/, "부탁드립니다."], [/(안내|연락)$/, "$1드리겠습니다."],
  [/(합격|등록|모집|지원)$/, "$1합니다."],
  [/(발표|공지|진행|운영|마감|시작|종료|충원|선발|실시|개최|반영|제공|지급|면제)$/, "$1됩니다."],
];

// "따라옴"→"따라옵니다", "받음"→"받습니다" 같은 명사형 어미를 서술형으로.
const M_SYLLABLES = "옴됨함줌봄짐냄씀뵘옮";
function verbalize(s) {
  const last = s.slice(-1);
  if (s.length >= 2 && last === "음") {
    const prev = s.charCodeAt(s.length - 2);
    if (prev >= 0xac00 && prev <= 0xd7a3 && (prev - 0xac00) % 28 !== 0) return s.slice(0, -1) + "습니다.";
  }
  if (M_SYLLABLES.includes(last)) {
    const base = last.charCodeAt(0) - 16 + 17; // 받침 ㅁ(16) → ㅂ(17)
    return s.slice(0, -1) + String.fromCharCode(base) + "니다.";
  }
  return null;
}

// "작년 예비 18번까지 충원" → "충원되었습니다"처럼 과거 표현이면 시제를 맞춥니다.
const PAST = /(작년|지난해|지난 해|전년도|지난 학년도|입결)/;
function tense(src, out) {
  if (!PAST.test(src)) return out;
  return out.replace(/됩니다\.$/, "되었습니다.").replace(/합니다\.$/, "했습니다.");
}

export function polishNote(line) {
  const r = polishNoteRaw(line);
  return r ? tense(line, r) : r;
}

function polishNoteRaw(line) {
  let s = line.trim().replace(/^([-*•·▪◦‣]|\d+[.)])\s*/, "").trim();
  if (!s) return "";
  if (/[.!?]$/.test(s)) return s;
  for (const [re, rep] of ENDINGS) if (re.test(s)) return s.replace(re, rep);
  if (/[다요]$/.test(s)) return s + ".";
  const v = verbalize(s);
  if (v) return v;
  return s + "입니다.";
}

export function polishNotes(notes, settings, missing) {
  const lines = (notes || "").split(/\n/).map((l) => polishNote(fill(l, settings, missing))).filter(Boolean);
  if (!lines.length) return "";
  return lines.length <= 3 ? lines.join(" ") : lines.map((l) => `· ${l}`).join("\n");
}

// ───────── 차별화: 강점 문장 고르기 ─────────
// 설정의 강점은 한 줄에 하나. "태그1,태그2: 문장" 형식이면 태그가 문의에 있을 때 우선 선택.
export function parseStrengths(raw) {
  return (raw || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^([^:：]{1,60})[:：]\s*(.+)$/);
    if (m && (m[1].includes(",") || m[1].length <= 12)) {
      return { tags: m[1].split(/[,，]/).map((x) => x.trim()).filter(Boolean), text: m[2].trim() };
    }
    return { tags: [], text: l };
  });
}

export function pickStrengths(inquiry, raw, max = 2) {
  const list = parseStrengths(raw);
  if (!list.length) return [];
  const t = strip(inquiry);
  const scored = list.map((s, i) => ({ ...s, i, hit: s.tags.filter((g) => t.includes(strip(g))).length }));
  const hits = scored.filter((s) => s.hit > 0).sort((a, b) => b.hit - a.hit || a.i - b.i);
  if (hits.length) return hits.slice(0, max);
  const general = scored.find((s) => !s.tags.length) || scored[0];
  return [general];
}

const polishSentence = (s) => (/[.!?]$/.test(s) ? s : polishNote(s));

export function compose({ inquiry, entries, settings, channel = "email", tone = "formal", asker = "학생", name = "",
  notes = "", empathy = true, differentiate = true }) {
  const missing = new Set();
  const f = (s) => fill(s, settings, missing);
  const uni = f("{{대학명}}");
  const who = name ? `${name} ${asker === "학부모" ? "학부모님" : "님"}` : asker === "학부모" ? "학부모님" : "수험생님";
  const friendly = tone === "friendly";
  const situation = detectSituation(inquiry);
  const short = channel === "kakao" || channel === "phone";

  const memo = polishNotes(notes, settings, missing);
  const bodies = entries.map((e) => ({ title: e.title, full: f(e.answer), short: f(firstPara(e.answer)) }));
  const strengths = differentiate ? pickStrengths(inquiry, settings.강점, short ? 1 : 2).map((s) => polishSentence(f(s.text))) : [];

  const opener = empathy ? (situation ? situation.open(asker) : DEFAULT_OPEN) : "";
  const closer = empathy ? (situation ? situation.close(asker) : DEFAULT_CLOSE) : "";

  const noMatch = `문의하신 내용은 정확한 확인이 필요한 사항으로, 담당자가 확인한 뒤 다시 안내해 드리겠습니다. 급하신 경우 입학처(${f("{{입학처전화}}")})로 연락 주시면 바로 도와드리겠습니다.`;
  const disclaimer = `※ 위 안내는 일반적인 사항이며, 최종 기준은 ${f("{{학년도}}")}학년도 ${uni} 모집요강을 따릅니다.`;
  const contact = `문의: ${uni} 입학처 ${f("{{입학처전화}}")} / ${f("{{입학처이메일}}")}\n홈페이지: ${f("{{입학처홈페이지}}")}`;

  // 본문: 담당자 메모가 있으면 맨 앞에 직접 답변으로, 지식베이스 답변은 그 뒤에 보충 안내로.
  const main = () => {
    const list = bodies;
    const kbText = (useShort) => {
      if (!list.length) return "";
      if (list.length === 1 && !memo) return useShort ? list[0].short : list[0].full;
      return list.map((b, i) => `${i + 1}. ${b.title}\n${useShort ? b.short : b.full}`).join("\n\n");
    };
    if (memo && short) return memo;
    if (memo && list.length) return `${memo}\n\n${short ? "" : "함께 알아 두시면 좋은 내용도 정리해 드립니다.\n\n"}${kbText(short)}`.replace(/\n{3,}/g, "\n\n");
    if (memo) return memo;
    return list.length ? kbText(short) : noMatch;
  };
  const diff = strengths.length
    ? (short ? strengths[0] : `덧붙여 ${uni}${settings.학과명 ? ` ${f("{{학과명}}")}` : ""}만의 자랑을 조금 소개해 드리고 싶습니다. ${strengths.join(" ")}`)
    : "";

  let out = "";
  let subject = "";
  const title = bodies[0]?.title || (memo ? "문의 답변" : "");

  if (channel === "email") {
    subject = `[${uni} 입학처] ${name ? `${who}, ` : ""}문의하신 내용에 대한 답변드립니다${title ? ` – ${title}` : ""}`;
    out = [
      `${who}, 안녕하세요.`,
      `${uni} 입학처입니다. ${friendly ? "저희 대학에 관심 가져 주셔서 정말 감사합니다!" : "저희 대학에 관심을 가져 주셔서 감사드립니다."}${opener ? ` ${opener}` : ""}`,
      main(),
      diff,
      disclaimer,
      [closer, friendly ? "더 궁금한 점이 있으면 언제든 편하게 문의해 주세요." : "추가로 궁금하신 사항이 있으시면 언제든지 문의해 주시기 바랍니다."].filter(Boolean).join(" "),
      `감사합니다.\n\n${f("{{담당자}}")} 드림\n${contact}`,
    ].filter(Boolean).join("\n\n");
  } else if (channel === "board") {
    out = [
      `안녕하세요, ${uni} 입학처입니다.`,
      `${friendly ? "문의 남겨 주셔서 감사합니다 :)" : "문의해 주셔서 감사합니다."}${opener ? ` ${opener}` : ""}`,
      main(),
      diff,
      disclaimer,
      [closer, `추가 문의는 입학처(${f("{{입학처전화}}")})로 연락 주시기 바랍니다. 감사합니다.`].filter(Boolean).join(" "),
    ].filter(Boolean).join("\n\n");
  } else if (channel === "kakao") {
    out = [
      `안녕하세요, ${uni} 입학처입니다${friendly ? " 😊" : "."}`,
      opener && situation ? opener : "",
      main(),
      diff,
      `자세한 사항은 모집요강(${f("{{입학처홈페이지}}")})을 확인해 주세요.`,
      [closer && situation ? closer : "", friendly ? "더 궁금한 점 있으면 편하게 물어봐 주세요!" : `추가 문의는 입학처(${f("{{입학처전화}}")})로 연락 주시기 바랍니다.`].filter(Boolean).join(" "),
    ].filter(Boolean).join("\n\n");
  } else if (channel === "phone") {
    const body = main().split(/\n\n+/).map((p) => `상담원: ${p}`).join("\n\n");
    out = [
      `상담원: 네, ${uni} 입학처입니다. 무엇을 도와드릴까요?`,
      `(문의 내용 확인: "${inquiry.trim().slice(0, 80)}${inquiry.trim().length > 80 ? "…" : ""}")`,
      opener ? `상담원: ${opener}` : "",
      body,
      diff ? `상담원: ${diff}` : "",
      `상담원: 정확한 기준은 ${f("{{학년도}}")}학년도 모집요강에서 한 번 더 확인 부탁드립니다. 혹시 더 궁금하신 점 있으실까요?`,
      `상담원: 네, 문의해 주셔서 감사합니다.${closer ? ` ${closer}` : ""}`,
    ].filter(Boolean).join("\n\n");
  }

  const text = out;
  if (/○○/.test(text.replace(/○○대학교/g, ""))) missing.add("○○ 표시(실제 값으로 교체)");
  return { subject, text, missing: [...missing], situation: situation?.label || "", strengths };
}
