// 기본형(규칙 기반) 면접 코치 엔진.
// ① 질문 의도 → ② 평가역량 → ③ 경험 추출 → ④ 평범한 답변 대비 → ⑤ 목표 시간 답변 →
// ⑥ 예상 점수 → ⑦ 감점 요인 수정 → ⑧ 꼬리질문 → ⑨ 답변 방향 → ⑩ 말하기 대본

import { QTYPES, TYPE_ORDER, COMPETENCIES, CLICHES, DEPT_PROFILES } from "./framework.js";
import { clean, J, isSentence, past, present, progressive, learned } from "../interview-engine.js";

const strip = (s) => (s || "").toLowerCase().replace(/\s+/g, "");
export const charsOf = (t) => (t || "").replace(/\s+/g, "").length;
export const secondsOf = (t) => Math.round(charsOf(t) / 5); // 또박또박 초당 약 5음절
const ph = (label) => `[✎ ${label}]`;

export function deptProfile(dept) {
  const d = DEPT_PROFILES.find((p) => p.re.test(dept || ""));
  if (d) return d;
  const stem = (dept || "").replace(/(학과|학부|전공|과)$/, "");
  return { role: stem ? `${stem} 전문가` : "전문가", words: stem ? [stem, "전공"] : ["전공"] };
}

export function detectType(q) {
  const t = strip(q);
  let best = "general", bestScore = 0;
  for (const key of TYPE_ORDER) {
    const s = QTYPES[key].hints.filter((h) => t.includes(strip(h))).length;
    if (s > bestScore) { best = key; bestScore = s; }
  }
  return best;
}

// ───────── 문장 도우미 ─────────
function because(s) {
  s = clean(s);
  if (!s) return `${ph("이유")} 때문입니다.`;
  if (isSentence(s)) return s + ".";
  return `${s} 때문입니다.`;
}
function will(s) {
  s = clean(s);
  if (!s) return `${ph("앞으로의 계획")}.`;
  if (isSentence(s)) return s + ".";
  if (/기$/.test(s)) return s.replace(/기$/, "겠습니다.");
  const p = progressive(s);
  return p.endsWith("하고 있습니다.") ? p.replace(/하고 있습니다\.$/, "하겠습니다.") : `${s}${J.을(s)} 실천하겠습니다.`;
}
function considered(s) {
  s = clean(s);
  if (!s) return `${ph("고려한 상대의 사정")}을 먼저 생각했습니다.`;
  if (isSentence(s)) return s + ".";
  return `${s}${J.을(s)} 먼저 생각했습니다.`;
}
function situationWith(s) {
  s = clean(s);
  if (!s) return `${ph("누구와 무엇 때문에")} 의견이 달랐던 적이 있습니다.`;
  if (isSentence(s)) return s + ".";
  if (/(와|과|랑|하고)$/.test(s)) return `${s} 의견이 달랐던 적이 있습니다.`;
  return present(s).replace(/입니다\.$/, " 일이 있었습니다.");
}
function happened(s) {
  s = clean(s);
  if (!s) return "";
  if (isSentence(s)) return s + ".";
  if (/(나옴|생김|떨어짐|받음|당함)$/.test(s)) return s.replace(/나옴$/, "나왔습니다.").replace(/생김$/, "생겼습니다.").replace(/떨어짐$/, "떨어졌습니다.").replace(/받음$/, "받았습니다.").replace(/당함$/, "당했습니다.");
  if (/(심|셨음)$/.test(s)) return s.replace(/심$/, "셨습니다.").replace(/셨음$/, "셨습니다.");
  return past(s);
}
const healthy = (c) => /환자/.test(deptProfile(c.dept).words.join());
const v = (f, k, label) => (clean(f[k]) ? clean(f[k]) : ph(label));
const has = (f, k) => !!clean(f[k]);
const roleJ = (role) => `${role}${J.이(role)}`;

// 각 빌더는 [{t: 문장, opt: 길이 초과 시 생략 가능}] 반환
const BUILD = {
  conflict(f, c) {
    return [
      { t: "저는 갈등이 생기면 먼저 상대가 왜 그렇게 생각하는지부터 들으려고 합니다." },
      { t: situationWith(f.situation) },
      { t: has(f, "understand") ? `상대의 입장을 이해하기 위해 저는 ${happened(f.understand)}` : `상대의 입장을 이해하기 위해 저는 ${ph("내가 한 노력")}.` },
      { t: has(f, "action") ? `그래서 ${past(f.action)}` : `그래서 ${ph("내가 한 해결 행동")}.` },
      { t: has(f, "result") ? `그 결과 ${happened(f.result)}` : "", opt: true },
      { t: has(f, "learned") ? `이 경험으로 ${learned(f.learned)}` : `이 경험으로 ${ph("배운 점")}.` },
      { t: `${roleJ(c.role)} 되어서도 환자와 동료의 입장을 먼저 헤아리겠습니다.`, opt: true },
    ];
  },
  emotion(f, c) {
    return [
      { t: "저는 감정이 앞서는 순간에 한 번 멈추고 상황을 먼저 보려고 합니다." },
      { t: has(f, "situation") ? happened(f.situation) : `${ph("불편했던 상대의 말·행동")}.` },
      { t: `순간 마음이 불편했지만, ${considered(f.consider)}` },
      { t: has(f, "action") ? `그래서 ${past(f.action)}` : `그래서 ${ph("감정을 조절한 방법과 행동")}.` },
      { t: has(f, "result") ? `그 결과 ${happened(f.result)}` : "", opt: true },
      { t: has(f, "learned") ? `이 경험으로 ${learned(f.learned)}` : `이 경험으로 ${ph("배운 점")}.` },
      { t: healthy(c) ? `${roleJ(c.role)} 되어서도 환자와 보호자의 날 선 말 뒤에 있는 불안을 먼저 보겠습니다.` : `앞으로도 상대의 말 뒤에 있는 마음을 먼저 보겠습니다.`, opt: true },
    ];
  },
  jobcomp(f, c) {
    const comp = v(f, "competency", "가장 중요한 역량 하나");
    return [
      { t: `저는 ${c.role}에게 가장 중요한 역량이 ${comp}${batchimOf(comp) ? "이라고" : "라고"} 생각합니다.` },
      { t: `그 이유는 ${because(f.reason)}` },
      { t: has(f, "evidence") ? `실제로 ${happened(f.evidence)}` : "", opt: true },
      { t: has(f, "myhabit") ? `저는 ${progressive(f.myhabit)}` : `저는 ${ph("관련 습관·노력")}.` },
      { t: `이 습관을 ${c.dept || "전공"}에서 체계적인 역량으로 키우겠습니다.`, opt: true },
    ];
  },
  learning(f, c) {
    const act = v(f, "activity", "활동·과목 이름");
    return [
      { t: `${c.dept || "전공"} 공부에 도움이 될 경험으로 ${act}${J.을(act)} 꼽고 싶습니다.` },
      { t: has(f, "did") ? `저는 ${past(f.did)}` : `저는 ${ph("내가 한 일(방법)")}.` },
      { t: has(f, "difficulty") ? `처음에는 어려움도 있었지만 ${past(f.difficulty)}` : "", opt: true },
      { t: has(f, "learned") ? `이 과정에서 ${learned(f.learned)}` : `이 과정에서 ${ph("배운 점")}.` },
      { t: has(f, "link") ? because(f.link).replace(/^/, `${c.dept || "전공"} 공부에 도움이 된다고 생각하는 이유는 `) : `이 경험이 ${c.dept || "전공"}의 이론과 실습에 좋은 바탕이 될 것입니다.` },
    ];
  },
  strengthweak(f, c) {
    const s = v(f, "strength", "장점 한 가지"), w = v(f, "weakness", "보완할 점 한 가지");
    return [
      { t: `저의 가장 큰 장점은 ${s}입니다.` },
      { t: has(f, "proof") ? happened(f.proof) : `${ph("장점이 드러난 경험")}.` },
      { t: `반면 보완할 점은 ${w}입니다.` },
      { t: has(f, "fix") ? `이를 고치기 위해 ${progressive(f.fix)}` : `이를 고치기 위해 ${ph("지금 하고 있는 노력")}.` },
      { t: `${c.role}${J.이(c.role)} 되는 과정에서는 ${will(f.future)}` },
      { t: `이렇게 장점은 살리고 보완점은 고쳐, ${healthy(c) ? "환자와 동료가" : "함께하는 사람들이"} 믿고 의지할 수 있는 ${c.role}${J.이(c.role)} 되겠습니다.`, opt: true },
    ];
  },
  improve(f, c) {
    return [
      { t: "저는 결과가 기대에 못 미쳤을 때, 노력의 양보다 방법을 바꿔 극복한 경험이 있습니다." },
      { t: has(f, "situation") ? happened(f.situation) : `${ph("기대보다 안 나온 결과")}.` },
      { t: has(f, "cause") ? `원인을 살펴보니 ${present(f.cause).replace(/입니다\.$/, "였습니다.")}` : `원인을 살펴보니 ${ph("원인 분석")}.` },
      { t: has(f, "action") ? `그래서 ${past(f.action)}` : `그래서 ${ph("바꾼 방법")}.` },
      { t: has(f, "result") ? `그 결과 ${happened(f.result)}` : "", opt: true },
      { t: has(f, "learned") ? `이 경험으로 ${learned(f.learned)}` : `이 경험으로 ${ph("배운 점")}.` },
      { t: `이 태도는 ${healthy(c) ? "실수의 원인을 찾아 환자 안전을 지켜야 하는" : "문제의 원인을 찾아 개선해야 하는"} ${c.role}에게도 꼭 필요하다고 생각합니다.`, opt: true },
    ];
  },
  motive(f, c) {
    return [
      { t: `제가 ${c.dept || "이 학과"}에 지원한 것은 ${has(f, "trigger") ? happened(f.trigger).replace(/\.$/, "") : ph("관심을 갖게 된 계기")}${has(f, "trigger") ? "고, 그 장면에서 이 직업을 처음 진지하게 생각하게 되었기 때문입니다." : "에서 시작되었습니다."}`.replace("습니다고", "고") },
      { t: has(f, "explore") ? `그 뒤 ${past(f.explore)}` : `그 뒤 ${ph("스스로 알아보거나 해 본 것")}.` },
      { t: has(f, "learned") ? `이 과정에서 ${learned(f.learned)}` : "", opt: true },
      { t: has(f, "goal") ? `입학 후에는 전문 지식과 실습 역량을 쌓아 ${will(f.goal)}` : `입학 후에는 ${ph("목표")}.` },
    ];
  },
  ethics(f, c) {
    const pr = v(f, "principle", "가장 우선할 가치");
    return [
      { t: `저는 이 상황에서 ${pr}${J.을(pr)} 가장 먼저 지키겠습니다.` },
      { t: has(f, "steps") ? `구체적으로 ${will(f.steps)}` : `구체적으로 ${ph("행동 순서")}.` },
      { t: /간호|임상|병리|치료|방사선|응급|치위생|의/.test(c.dept || "") ? "작은 판단 하나가 환자의 안전으로 이어지기 때문에, 조금 늦어지더라도 정직하게 처리하는 것이 환자를 위한 길이라고 생각합니다." : "작은 원칙을 지키는 것이 결국 신뢰를 만든다고 생각하기 때문입니다." },
      { t: has(f, "experience") ? `실제로 ${happened(f.experience)}` : "", opt: true },
      { t: "그리고 같은 일이 반복되지 않도록 원인을 기록하고 공유하겠습니다.", opt: true },
    ];
  },
  career(f, c) {
    const g = v(f, "goal", "졸업 후 목표");
    return [
      { t: `저의 목표는 ${g}${batchimOf(g) ? "이" : "가"} 되는 것입니다.` },
      { t: has(f, "why") ? `그 이유는 ${because(f.why)}` : "", opt: true },
      { t: has(f, "plan1") ? `이를 위해 입학 후에는 ${will(f.plan1)}` : `이를 위해 입학 후에는 ${ph("저학년 계획")}.` },
      { t: has(f, "plan2") ? `고학년에는 ${will(f.plan2)}` : `고학년에는 ${ph("실습·자격 계획")}.` },
    ];
  },
  general(f, c) {
    return [
      { t: has(f, "conclusion") ? present(f.conclusion) : `${ph("질문에 대한 결론 한 문장")}.` },
      { t: has(f, "evidence") ? `그렇게 생각하는 이유는 제 경험 때문입니다. ${happened(f.evidence)}` : `그렇게 생각하는 이유는 ${ph("근거가 되는 경험")} 때문입니다.` },
      { t: has(f, "learned") ? `이 경험으로 ${learned(f.learned)}` : "", opt: true },
      { t: has(f, "link") ? present(f.link) : `이 생각을 ${c.dept || "전공"} 공부로 이어가겠습니다.`, opt: true },
    ];
  },
};

function batchimOf(w) {
  const c = (w || "").trim().slice(-1).charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

const joinSentences = (list) => list.map((s) => s.t).filter(Boolean).join(" ").replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").trim();

// ⑦ 목표 시간을 넘으면 생략 가능 문장부터 뺍니다.
function fitLength(parts, targetSec) {
  const list = parts.filter((p) => p.t);
  const dropped = [];
  while (secondsOf(joinSentences(list)) > targetSec + 5) {
    const i = list.map((p) => p.opt).lastIndexOf(true);
    if (i < 0) break;
    dropped.push(list.splice(i, 1)[0].t);
  }
  return { text: joinSentences(list), dropped };
}

// ───────── ⑥ 평가 ─────────
const ASKS = [
  { when: /이유/, label: "이유", need: /때문|이유|왜냐하면/ },
  { when: /어떻게 해결|해결했/, label: "해결 방법", need: /제안|나누|나눴|나눠|바꾸|바꿨|조정|정하|정했|맡기|맡겼|함께|설명|대화|물어|물었/ },
  { when: /입장/, label: "상대 입장을 이해한 노력", need: /입장|사정|이유를 (물|들)|들었|헤아|이해하려|물어보/ },
  { when: /감정/, label: "감정 조절 방법", need: /감정|마음|가라앉|물러|숨|진정|멈추|참/ },
  { when: /노력/, label: "노력의 구체적 방법", need: /노력|연습|매일|꾸준|정리|바꾸|하고 있|순서|위해|위하여/ },
  { when: /발전/, label: "앞으로의 발전 계획", need: /겠습니다/ },
  { when: /보완/, label: "보완점", need: /보완|단점|고치|부족/ },
  { when: /장점/, label: "장점", need: /장점|강점/ },
  { when: /역량|자질/, label: "역량 제시", need: /역량|능력|자질|태도|관찰|확인|소통/ },
  { when: /경험/, label: "구체적인 경험", need: /했습니다|있습니다|였습니다|었습니다|았습니다/ },
  { when: /개선/, label: "개선 방법", need: /원인|방법|바꾸|개선|순서/ },
];
const REFLECT = /배웠|깨달|알게 되|느꼈|생각하게 되|중요하다는|필요하다고|소중하다는/;
const BLIND = [
  [/[가-힣]{1,10}(고등학교|고교|외고|과학고|자사고|여고|중학교)/, "출신 학교명"],
  [/(아버지|어머니|부모님|아빠|엄마|삼촌|이모|고모)[^.\n]{0,20}(의사|교수|변호사|판사|공무원|사장|대표|원장|간호사|근무|일하)/, "가족의 직업·직장"],
  [/제 이름은|저는 [가-힣]{2,3}입니다\./, "본인 이름"],
];

const FORWARD_TYPES = ["strengthweak", "jobcomp", "ethics", "career", "motive"];

export function evaluate(answer, question, dept, targetSec, type = detectType(question)) {
  const a = answer || "";
  const sentences = a.split(/(?<=[.?!])\s+/).filter(Boolean);
  const first = sentences[0] || "";
  const dp = deptProfile(dept);
  const cats = [];
  const add = (name, got, max, issue) => cats.push({ name, got: Math.max(0, Math.round(got)), max, issue });

  // 질문 요구 충족 20
  const asks = ASKS.filter((x) => x.when.test(question));
  const missed = asks.filter((x) => !x.need.test(a));
  add("질문 요구 충족", asks.length ? 20 * (1 - missed.length / asks.length) : 20, 20,
    missed.length ? { title: `질문이 요구한 ‘${missed.map((m) => m.label).join("’, ‘")}’이(가) 빠졌습니다`, fix: "문항의 요구 사항을 하나씩 체크해, 빠진 부분을 한 문장씩 추가하세요." } : null);

  // 두괄식 10
  const fl = charsOf(first);
  const bg = /^(제가 )?(\d|[일이삼]학년|고등학교|작년|그때|어느 날|예전에)/.test(first);
  const head = bg ? 3 : fl <= 55 ? 10 : fl <= 80 ? 6 : 2;
  add("두괄식(첫 문장 결론)", head, 10, head < 10 ? { title: bg ? "배경 설명부터 시작합니다" : "첫 문장이 길어 결론이 늦게 나옵니다", fix: "첫 문장을 ‘저는 ~라고 생각합니다/~한 경험이 있습니다’처럼 결론 한 문장으로 바꾸세요." } : null);

  // 구체성 20
  const nums = /[0-9]|한 번|두 번|세 번|매일|분 후|다섯|여섯|일주일|한 달|[0-9]+명/.test(a);
  const me = (a.match(/저는|제가|저의|제 /g) || []).length;
  const we = (a.match(/우리|저희/g) || []).length;
  const acts = (a.match(/했습니다|하였습니다|였습니다|었습니다|았습니다|웠습니다/g) || []).length;
  let spec = (nums ? 6 : 0) + (me >= 2 ? 6 : me === 1 ? 3 : 0) + (acts >= 3 ? 8 : acts === 2 ? 5 : acts === 1 ? 2 : 0);
  if (we > me) spec -= 4;
  add("구체성(나의 행동)", spec, 20, spec < 16 ? {
    title: we > me ? "‘우리’가 ‘나’보다 많아 내 역할이 보이지 않습니다" : !nums ? "숫자·횟수·시간 같은 구체적 정보가 없습니다" : "내가 실제로 한 행동이 부족합니다",
    fix: "‘저는 ~했습니다’로 내가 한 행동을 2~3개, 횟수·기간·방법을 하나 이상 넣으세요.",
  } : null);

  // 성찰 15
  const forward = FORWARD_TYPES.includes(type) && /겠습니다/.test(a) && /생각합니다|때문입니다|입니다/.test(a);
  const refl = REFLECT.test(a) || forward ? 15 : /생각합니다|때문입니다/.test(a) ? 8 : 0;
  add("성찰(배운 점)", refl, 15, refl < 15 ? { title: "경험에서 무엇을 배웠는지가 분명하지 않습니다", fix: "‘이 경험으로 ~라는 것을 배웠습니다’처럼 배운 점을 한 문장으로 쓰세요." } : null);

  // 전공 연결 15
  const hits = dp.words.filter((w) => a.includes(w)).length;
  const link = hits >= 2 ? 15 : hits === 1 ? 8 : 0;
  add("전공 연결", link, 15, link < 15 ? { title: "지원 학과·직업과의 연결이 약합니다", fix: `마지막 문장에서 이 경험이 ${dp.role}의 어떤 장면과 이어지는지 말하세요.` } : null);

  // 진정성(평범한 표현) 10
  const cl = CLICHES.filter(([re]) => re.test(a));
  add("진정성(평범한 표현 없음)", 10 - cl.length * 4, 10, cl.length ? { title: `평범한 표현 ${cl.length}개: ${cl.map((c) => c[1]).join(" / ")}`, fix: cl.map((c) => c[2]).join(" · ") } : null);

  // 시간 10
  const sec = secondsOf(a);
  const diff = Math.abs(sec - targetSec);
  const tm = diff <= 5 ? 10 : diff <= 12 ? 5 : 0;
  add("말하기 시간", tm, 10, tm < 10 ? { title: sec < targetSec ? `약 ${sec}초로 목표(${targetSec}초)보다 짧습니다` : `약 ${sec}초로 목표(${targetSec}초)보다 깁니다`, fix: sec < targetSec ? "구체적인 장면(무엇을·어떻게)과 배운 점을 한 문장씩 더하세요." : "배경 설명과 반복되는 문장을 줄이고 결론·핵심 경험만 남기세요." } : null);

  // 블라인드(치명적 감점)
  const blind = BLIND.filter(([re]) => re.test(a)).map(([, n]) => n);
  const holes = (a.match(/\[✎/g) || []).length;

  let score = cats.reduce((s, c) => s + c.got, 0) - blind.length * 15 - Math.min(holes * 6, 40);
  score = Math.max(0, Math.min(100, score));
  const issues = cats.filter((c) => c.issue).map((c) => ({ ...c.issue, lost: c.max - c.got, cat: c.name }))
    .sort((x, y) => y.lost - x.lost);
  if (holes) issues.unshift({ title: `채워야 할 경험 칸 ${holes}곳이 남아 있습니다`, fix: "경험 입력란을 채우면 점수가 크게 올라갑니다.", lost: Math.min(holes * 6, 40), cat: "경험 입력" });
  blind.forEach((n) => issues.unshift({ title: `블라인드 위반: ${n}${J.이(n)} 드러납니다`, fix: "출신 학교·가족 직업·이름은 말하지 않습니다. 해당 표현을 지우세요.", lost: 15, cat: "블라인드" }));
  return { score, cats, issues, seconds: sec, grade: grade(score) };
}

function grade(s) {
  if (s >= 90) return "우수 · 그대로 연습해도 좋은 수준";
  if (s >= 80) return "양호 · 감점 요인 1~2개만 고치면 상위권";
  if (s >= 65) return "보통 · 구체성과 연결을 보강하세요";
  return "보완 필요 · 경험을 더 구체적으로 채우세요";
}

// ───────── ⑩ 말하기 대본·코칭 ─────────
function emphasisWords(type, f) {
  const keys = { conflict: ["understand", "action"], emotion: ["consider", "action"], jobcomp: ["competency"], learning: ["activity"], strengthweak: ["strength", "weakness"], improve: ["cause", "action"], motive: ["trigger", "goal"], ethics: ["principle"], career: ["goal"], general: ["conclusion"] }[type] || [];
  return keys.map((k) => clean(f[k])).filter(Boolean)
    .map((s) => (s.replace(/\s+/g, "").length <= 14 ? s : s.split(/\s+/).slice(0, 2).join(" ")).replace(/[을를이가은는의에]$/, ""));
}

export function speakingScript(answer, emph) {
  const sentences = answer.split(/(?<=[.?!])\s+/).filter(Boolean);
  return sentences.map((s, i) => {
    let t = s.replace(/,\s*/g, ", / ").replace(/(고|며|서|는데|지만|면서) (?=[가-힣])/g, "$1 / ");
    for (const w of emph) if (w && t.includes(w)) t = t.replace(w, `【${w}】`);
    return `${i === 0 ? "▶ " : ""}${t}${i === sentences.length - 1 ? " (눈 맞추고 천천히)" : ""}`;
  }).join("\n");
}

function coaching(type, sec, target) {
  const tips = [
    "첫 문장은 외워서 또렷하게, 나머지는 키워드만 기억하고 자연스럽게 말하세요.",
    "‘ / ’ 표시에서 반 박자 쉬고, 【 】 단어는 조금 천천히 힘주어 말하세요.",
    `목표 ${target}초 기준, 1초에 약 5음절 속도가 알맞습니다.${sec > target + 5 ? " 지금 답변은 길어서 빨라지기 쉬우니 한 문장을 줄이세요." : ""}`,
  ];
  const t = QTYPES[type];
  if (type === "ethics") tips.push("윤리 문항은 빠르게 답하기보다 2초 생각한 뒤 ‘저는 ○○을 가장 먼저 지키겠습니다’로 시작하세요.");
  if (type === "conflict" || type === "emotion") tips.push("상대를 탓하는 말투가 나오지 않도록, 상대의 사정을 말할 때 목소리를 부드럽게 하세요.");
  if (type === "strengthweak") tips.push("단점을 말할 때 표정이 굳지 않게, 보완 노력 문장에서 다시 밝은 톤으로 전환하세요.");
  tips.push(`이 문항에서 면접관이 보는 것: ${t.looks.join(" · ")}`);
  return tips;
}

// ───────── 전체 실행 ─────────
export function runBasic({ question, dept, fields, targetSec = 50, draft = "" }) {
  const type = detectType(question);
  const T = QTYPES[type];
  const dp = deptProfile(dept);
  const ctx = { dept: clean(dept), role: dp.role };
  const parts = BUILD[type](fields || {}, ctx);
  const { text: answer, dropped } = fitLength(parts, targetSec);
  const evalFinal = evaluate(answer, question, dept, targetSec, type);
  const evalDraft = clean(draft) ? evaluate(draft, question, dept, targetSec, type) : null;
  const evalPlain = T.plain ? evaluate(T.plain, question, dept, targetSec, type) : null;
  const emph = emphasisWords(type, fields || {});
  return {
    mode: "basic",
    type, typeLabel: T.label,
    intent: T.intent,
    competencies: T.comps.map((c) => COMPETENCIES[c]),
    looks: T.looks,
    fields: T.fields,
    plain: T.plain ? { text: T.plain, score: evalPlain.score, issues: evalPlain.issues.slice(0, 3) } : null,
    draft: evalDraft ? { text: draft, score: evalDraft.score, issues: evalDraft.issues } : null,
    answer,
    score: evalFinal.score,
    grade: evalFinal.grade,
    cats: evalFinal.cats,
    issues: evalFinal.issues,
    seconds: evalFinal.seconds,
    fixes: dropped.length ? [`목표 시간(${targetSec}초)에 맞추기 위해 보조 문장 ${dropped.length}개를 뺐습니다.`] : [],
    followups: T.followups.map((x) => ({ q: x.q, answer: "", dir: x.dir })),
    script: speakingScript(answer, emph),
    coaching: coaching(type, evalFinal.seconds, targetSec),
  };
}

// 신청서 기반 재구성(application.js)에서 재사용
export { fitLength, coaching, happened, healthy, joinSentences };
