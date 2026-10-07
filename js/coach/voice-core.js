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
