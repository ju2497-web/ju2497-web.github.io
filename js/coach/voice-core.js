// 음성 면접 코치 핵심 로직: 유형별로 '말로 묻는 질문', 구어 → 면접체 변환, 말하기 연습 채점.

import { CLICHES } from "./framework.js";

// 유형별로 학생에게 말로 물어볼 질문(최대 5개). 답이 그대로 기본형 엔진의 경험 칸에 들어갑니다.
export const SPOKEN = {
  conflict: [
    ["situation", "누구랑, 무엇 때문에 의견이 부딪혔어요? 있었던 일 그대로 말해 주세요."],
    ["understand", "상대 입장을 이해하려고 뭘 했어요? 알게 된 사정이 있었나요?"],
    ["action", "그래서 어떻게 해결했어요? 결과도 함께 말해 주세요."],
    ["learned", "그 일로 뭘 배웠어요? 한 문장이면 돼요."],
  ],
  emotion: [
    ["situation", "상대의 어떤 말이나 행동 때문에 마음이 불편했어요?"],
    ["consider", "그때 상대의 사정이나 상황 중에 뭘 생각했어요?"],
    ["action", "감정을 어떻게 가라앉혔고, 어떻게 행동했어요? 결과도 말해 주세요."],
    ["learned", "그 일로 뭘 배웠어요?"],
  ],
  jobcomp: [
    ["competency", "그 직업에 가장 중요한 역량을 하나만 꼽는다면 뭐예요?"],
    ["reason", "왜 그게 가장 중요하다고 생각해요? 실제로 일하는 장면을 떠올려 말해 주세요."],
    ["myhabit", "나한테 있는, 그 역량과 관련된 습관이나 경험이 있어요?"],
  ],
  learning: [
    ["activity", "도움이 될 것 같은 활동이나 수업 이름이 뭐예요?"],
    ["did", "거기서 내가 직접 한 일을 말해 주세요. 방법이나 숫자가 있으면 더 좋아요."],
    ["learned", "그걸 하면서 뭘 배웠어요?"],
    ["link", "그게 전공 공부에 왜 도움이 될 것 같아요?"],
  ],
  strengthweak: [
    ["strength", "나의 가장 큰 장점 하나는 뭐예요?"],
    ["proof", "그 장점이 드러난 일을 하나 말해 주세요."],
    ["weakness", "보완하고 싶은 점 하나는요?"],
    ["fix", "그걸 고치려고 지금 하고 있는 게 있어요?"],
    ["future", "그 직업을 준비하면서 앞으로 어떻게 더 발전시킬 거예요?"],
  ],
  improve: [
    ["situation", "어떤 결과가 기대만큼 안 나왔어요?"],
    ["cause", "원인이 뭐였던 것 같아요?"],
    ["action", "그래서 방법을 어떻게 바꿨고, 결과는 어땠어요?"],
    ["learned", "그 일로 뭘 배웠어요?"],
  ],
  motive: [
    ["trigger", "이 학과에 관심을 갖게 된 계기가 뭐예요? 장면을 떠올려 말해 주세요."],
    ["explore", "그 뒤에 스스로 찾아보거나 해 본 게 있어요?"],
    ["goal", "졸업하고 어떤 사람이 되고 싶어요?"],
  ],
  ethics: [
    ["principle", "그 상황에서 가장 먼저 지킬 원칙은 뭐라고 생각해요?"],
    ["steps", "구체적으로 어떤 순서로 행동할 거예요?"],
    ["experience", "비슷하게 원칙을 지켰던 경험이 있으면 말해 주세요. 없으면 건너뛰어도 돼요."],
  ],
  career: [
    ["goal", "졸업 후에 되고 싶은 모습은요?"],
    ["why", "왜 그게 목표예요?"],
    ["plan1", "입학하면 처음에 뭘 할 거예요?"],
    ["plan2", "고학년이나 실습 때는요?"],
  ],
  general: [
    ["conclusion", "이 질문에 대한 내 생각을 한 문장으로 말하면요?"],
    ["evidence", "그렇게 생각하게 된 경험을 말해 주세요."],
    ["learned", "그 경험에서 배운 점은요?"],
  ],
};

const FILLER = /(^|\s)(음+|어+|으+|그+|저기|막|약간|뭔가|이제|그러니까|아니|그냥|뭐지)(?=\s|$|[,.])/g;

// 말한 그대로의 구어를 면접 답변체(~습니다)로
const jong = (ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 ? c % 28 : -1; };

export function formalize(t) {
  let s = ` ${(t || "").replace(/\s+/g, " ")} `;
  for (let i = 0; i < 2; i++) s = s.replace(FILLER, " ");
  s = s.replace(/(아|어|해|줘|와|봐|돼|워|러)가지고/g, "$1서")
    .replace(/([았었였했])거든요/g, "$1습니다").replace(/있거든요/g, "있습니다").replace(/거든요/g, "습니다")
    .replace(/([가-힣])대요/g, (m, c) => (jong(c) === 20 ? `${c}다고 했습니다` : m))
    .replace(/([가-힣])어요/g, (m, c) => (jong(c) === 20 ? `${c}습니다` : m))
    .replace(/([가-힣])니까요/g, "$1기 때문입니다")
    .replace(/(이에요|예요)/g, "입니다").replace(/해요/g, "합니다").replace(/돼요/g, "됩니다")
    .replace(/있어요/g, "있습니다").replace(/없어요/g, "없습니다").replace(/같아요/g, "같습니다").replace(/싶어요/g, "싶습니다")
    .replace(/봐요/g, "봅니다").replace(/줘요/g, "줍니다").replace(/와요/g, "옵니다").replace(/거예요/g, "것입니다")
    .replace(/(니다)\s+(?=[가-힣])/g, "$1. ");
  return s.replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").trim().replace(/^(그래서|그리고|근데|그런데|그러니까)\s+/, "").replace(/\. (그래서|그리고|근데) /g, ". ");
}

export function countFillers(t) { return ((` ${t || ""} `).match(FILLER) || []).length; }

// 말하기 연습 채점: 실제 말한 시간, 핵심어, 군말, 상투 표현
export function practiceFeedback({ transcript, seconds, target, keywords }) {
  const tips = [];
  let score = 100;
  const diff = seconds - target;
  if (Math.abs(diff) > 10) { score -= 20; tips.push(diff > 0 ? `${seconds}초 말했어요. 목표(${target}초)보다 ${diff}초 길어요. 배경 설명을 줄이고 결론부터 말해 보세요.` : `${seconds}초 말했어요. 목표(${target}초)보다 ${-diff}초 짧아요. 내가 한 행동을 한 문장 더 말해 보세요.`); }
  else if (Math.abs(diff) > 5) { score -= 8; tips.push(`${seconds}초, 목표(${target}초)에 거의 맞았어요.`); }
  else tips.push(`${seconds}초, 시간 배분이 좋아요.`);
  const t = (transcript || "").replace(/\s+/g, "");
  const missed = keywords.filter((k) => !t.includes(k.replace(/\s+/g, "")));
  score -= missed.length * 10;
  tips.push(missed.length ? `빠진 핵심어: ${missed.join(", ")}. 이 단어가 들어가야 내 경험이 드러나요.` : "핵심어를 모두 말했어요.");
  const f = countFillers(transcript);
  if (f > 6) { score -= 18; tips.push(`‘음·어·막’ 같은 군말이 ${f}번 나왔어요. 문장 사이에 잠깐 멈추는 연습을 해 보세요.`); }
  else if (f > 3) { score -= 8; tips.push(`군말이 ${f}번 있었어요. 조금만 줄이면 훨씬 또렷하게 들려요.`); }
  const cl = CLICHES.filter(([re]) => re.test(transcript || ""));
  cl.forEach(([, why, fix]) => { score -= 8; tips.push(`${why}. ${fix}.`); });
  if (!transcript || t.length < 20) { score = Math.min(score, 30); tips.unshift("말한 내용이 거의 인식되지 않았어요. 조용한 곳에서 다시 해 보세요."); }
  return { score: Math.max(0, Math.min(100, Math.round(score))), tips };
}

export function followupFeedback({ transcript, seconds }) {
  const tips = [];
  const t = transcript || "";
  if (seconds < 8 || t.replace(/\s/g, "").length < 25) tips.push("너무 짧아요. 꼬리질문도 ‘결론 한 문장 + 이유나 장면 한 문장’으로 답하면 좋아요.");
  else if (seconds > 45) tips.push("꼬리질문 답이 길어요. 30초 안쪽으로 핵심만 말해 보세요.");
  else tips.push("길이가 적당해요.");
  if (/[0-9]|번|명|시간|분|매일|했/.test(t)) tips.push("구체적인 행동이나 숫자가 들어가 있어 좋아요.");
  else tips.push("‘제가 ~했습니다’처럼 실제 행동을 하나 넣어 보세요.");
  if (/모르겠|잘 모르/.test(t)) tips.push("모를 때는 ‘아는 부분까지 말하고, 입학 후 더 공부하겠다’로 마무리하면 감점이 적어요.");
  return tips;
}

// ───────── 말한 답변 채점(무료 엔진) ─────────
import { evaluate, deptProfile, secondsOf, fitLength, joinSentences } from "./engine.js";
import { QTYPES } from "./framework.js";

const CONCRETE = /[0-9]|번|명|시간|분|매일|주일|개월|학년|동아리|봉사|실험|탐구|과제|프로젝트|수업|보고서|병원|모둠|조별|대회/;
const ACTED = { test: (s) => [...s.matchAll(/([가-힣])습니다/g)].some((m) => { const c = m[1].charCodeAt(0) - 0xac00; return c >= 0 && c % 28 === 20; }) };
const splitSentences = (t) => {
  const parts = t.split(/(?<=[.?!])\s+/).filter(Boolean)
    .flatMap((p) => p.split(/\s(?=(?:그래서|그런데|근데|그리고|왜냐하면|그 결과|결국|예를 들어|특히)\s)/))
    .map((s) => s.trim().replace(/^(그리고|근데|그런데)\s+/, "")).filter((s) => s.length > 1);
  return parts.map((s) => (/[.?!]$/.test(s) ? s : s + "."));
};
const isConcrete = (s) => CONCRETE.test(s) && ACTED.test(s);
const isCliche = (s) => CLICHES.some(([re]) => re.test(s));

export function scoreSpoken({ transcript, question, dept, type, seconds, target = 50 }) {
  const formal = formalize(transcript);
  const ev = evaluate(formal, question, dept, target, type);
  const cat = Object.fromEntries(ev.cats.map((c) => [c.name, c.got / c.max]));
  const sents = splitSentences(formal);
  const concreteCount = sents.filter(isConcrete).length;
  const cliches = sents.filter(isCliche).length;
  const fillers = countFillers(transcript);
  const sec = seconds || secondsOf(formal);
  const timeFit = Math.max(0, 1 - Math.max(0, Math.abs(sec - target) - 5) / 25);
  const dims = {
    "질문 적합성": Math.round(100 * (0.7 * cat["질문 요구 충족"] + 0.3 * cat["두괄식(첫 문장 결론)"])),
    "구체성": Math.round(100 * cat["구체성(나의 행동)"]),
    "차별성": Math.max(0, Math.min(100, 40 + concreteCount * 22 - cliches * 25 + (cat["성찰(배운 점)"] >= 1 ? 15 : 0))),
    "전공적합성": Math.round(100 * cat["전공 연결"]),
    "전달력": Math.max(0, Math.round(100 * (0.6 * timeFit + 0.4 * cat["두괄식(첫 문장 결론)"])) - Math.max(0, fillers - 2) * 6),
  };
  const total = Math.round(Object.values(dims).reduce((a, b) => a + b, 0) / 5);
  // 첫 20초(약 100음절)가 일반론인지
  let acc = "", first20 = [];
  for (const s of sents) { if (acc.replace(/\s/g, "").length >= 100) break; acc += s; first20.push(s); }
  const genericStart = !first20.some(isConcrete) && sents.some(isConcrete);
  const problem = pickProblem({ dims, genericStart, cliches, concreteCount, fillers, sec, target, ev });
  return { total, dims, problem, formal, seconds: sec, fillers };
}

function pickProblem({ dims, genericStart, cliches, concreteCount, fillers, sec, target, ev }) {
  if (ev.issues.some((i) => i.cat === "블라인드")) return ev.issues.find((i) => i.cat === "블라인드").title + ". 출신 학교·가족 직업·이름은 말하지 않습니다.";
  if (genericStart) return "첫 20초가 너무 일반적입니다. 면접관이 기억할 만한 내 경험을 앞으로 옮겼습니다.";
  if (!concreteCount) return "결론은 있지만 다른 지원자와 구별되는 내 경험이 없습니다. 실제로 했던 일 하나를 넣어야 합니다.";
  if (cliches) return "누구나 하는 표현이 들어 있어 면접관 기억에 남지 않습니다. 그 표현을 내 경험 문장으로 바꿨습니다.";
  const low = Object.entries(dims).sort((a, b) => a[1] - b[1])[0];
  const msg = {
    "질문 적합성": "질문이 요구한 것을 다 답하지 않았습니다. 질문의 하위 질문(이유·방법 등)을 한 문장씩 채웠습니다.",
    "구체성": "‘내가 한 행동’이 부족합니다. ‘저는 ~했습니다’ 문장을 늘렸습니다.",
    "차별성": "배운 점이 분명하지 않아 평범하게 들립니다. 경험에서 배운 점을 한 문장으로 정리했습니다.",
    "전공적합성": "지원 학과와의 연결이 약합니다. 마지막 문장을 전공·직업과 이었습니다.",
    "전달력": sec > target + 5 ? `${sec}초로 깁니다. 45~55초로 줄였습니다.` : fillers > 2 ? "‘음·어’ 같은 군말이 많습니다. 문장 사이에 잠깐 멈추세요." : `${sec}초로 짧습니다. 장면 하나를 더 말해 보세요.`,
  }[low[0]];
  return msg;
}

// ───────── 학생 답변 재구성(무료 엔진) ─────────
export function improveAnswer({ transcript, question, dept, type, target = 50 }) {
  const formal = formalize(transcript);
  const sents = splitSentences(formal);
  const changes = [];
  const dp = deptProfile(dept);
  const kept = sents.filter((s) => { if (isCliche(s)) { changes.push(`진부한 표현 삭제: “${s.slice(0, 24)}…”`); return false; } return true; });
  const concrete = kept.filter(isConcrete);
  const learnedS = kept.filter((s) => !isConcrete(s) && /배웠|깨달|알게 되/.test(s));
  const general = kept.filter((s) => !concrete.includes(s) && !learnedS.includes(s));
  const conclusion = general.find((s) => /생각|중요|역량|입니다|합니다/.test(s)) || general[0];
  const parts = [];
  if (conclusion) parts.push({ t: conclusion });
  else parts.push({ t: `${"[✎ 질문에 대한 내 결론 한 문장]"}.` });
  const reason = general.find((s) => s !== conclusion && /때문|이유/.test(s));
  if (reason) parts.push({ t: reason });
  if (concrete.length) {
    if (sents.indexOf(concrete[0]) > sents.indexOf(conclusion ?? sents[0]) + 1) changes.push("기억에 남는 내 경험을 앞으로 옮겼습니다.");
    concrete.forEach((s) => parts.push({ t: s }));
  } else {
    parts.push({ t: "[✎ 이 생각이 드러난 내 경험 한 가지: 언제·무엇을·어떻게].", });
    changes.push("경험 문장이 없어 채울 자리를 만들었습니다.");
  }
  general.filter((s) => s !== conclusion && s !== reason).slice(0, 1).forEach((s) => parts.push({ t: s, opt: true }));
  learnedS.forEach((s) => parts.push({ t: s }));
  if (!learnedS.length && concrete.length) { parts.push({ t: "[✎ 이 경험에서 배운 점 한 문장]." }); changes.push("배운 점을 말할 자리를 만들었습니다. 이 한 문장이 차별성을 올립니다."); }
  const joined = parts.map((p) => p.t).join(" ");
  if (!dp.words.some((w) => joined.includes(w))) {
    parts.push({ t: dp.words.includes("환자") ? `이 태도를 환자 곁에서 일하는 ${dp.role}의 일로 이어 가겠습니다.` : `이 태도를 ${dp.role}의 일에서도 지켜 가겠습니다.` });
    changes.push("마지막에 전공·직업과의 연결을 넣었습니다.");
  }
  const { text, dropped } = fitLength(parts, target);
  if (dropped.length) changes.push(`${target}초에 맞추려고 덜 중요한 문장 ${dropped.length}개를 뺐습니다.`);
  return { answer: text || joinSentences(parts), changes };
}
