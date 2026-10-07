// 숨고 응답기 로직: 요청 읽기 → 보낼지 판정 → 맞춤 견적 문안 → 채팅 자료 요청(①~⑦) → 후속 1회 → 자주 묻는 질문.
// 숨고는 외부 링크·연락처 공유를 제한하므로 모든 문안은 숨고 채팅 안에서 끝나도록 씁니다.

import { CONFIG } from "./config.js";
import { emptyApplication, CONCERNS } from "./application.js";
import { parseQuestions } from "../interview-engine.js";

const won = (n) => `${Number(n).toLocaleString("ko-KR")}원`;
const clean = (s) => (s || "").trim();

// ───────── 요청 읽기 ─────────
export function parseRequest(text) {
  const t = text || "";
  const univ = (t.match(/([가-힣]{2,12}(?:대학교|대학|대))(?![가-힣])/) || [])[1] || "";
  const dept = (t.replace(univ, "").match(/([가-힣]{2,14}(?:학과|학부|전공|과))(?![가-힣])/) || [])[1] || "";
  const track = (t.match(/(학생부\s?종합|학종|학생부\s?교과|교과|논술|면접형|서류형|지역인재|학교장\s?추천|추천|특기자|편입|정시)[가-힣()·]*/) || [])[0] || "";
  const dm = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || t.match(/(\d{1,2})[./](\d{1,2})(?![\d])/);
  let interview = "", daysLeft = null;
  if (dm) {
    const now = new Date();
    let d = new Date(now.getFullYear(), +dm[1] - 1, +dm[2]);
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate()) - 1000 * 60 * 60 * 24 * 60) d = new Date(now.getFullYear() + 1, +dm[1] - 1, +dm[2]);
    interview = `${+dm[1]}월 ${+dm[2]}일`;
    daysLeft = Math.ceil((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  }
  const hasQuestions = /공개|기출|문항|질문지|선행학습/.test(t);
  const health = /간호|임상병리|보건|물리치료|작업치료|방사선|치위생|응급구조|의예|약학|의생명|바이오|생명/.test(t + dept);
  const wantsZoom = /줌|zoom|화상|모의\s?면접|실전|연습/i.test(t);
  return { univ, dept, track, interview, daysLeft, hasQuestions, health, wantsZoom };
}

// ───────── 판정 ─────────
export function triage(text, req = parseRequest(text)) {
  const t = text || "";
  const reasons = [];
  if (CONFIG.blockedUniversities.some((u) => u && (t.includes(u) || req.univ === u))) {
    return { verdict: "거절", reasons: ["이해충돌 방지 대상 대학 지원자입니다."] };
  }
  if (/없는 경험|지어|꾸며|만들어 ?(줘|주세요|주실)|거짓|허위/.test(t)) {
    return { verdict: "거절", reasons: ["없는 경험을 만들어 달라는 요청입니다. 허위 경험은 넣지 않는다는 원칙과 충돌합니다."] };
  }
  if (/합격 ?보장|무조건 ?합격|100%/.test(t)) reasons.push("합격 보장 요구가 있습니다. 보장할 수 없다는 점을 견적에 분명히 적어야 합니다.");
  if (req.daysLeft !== null && req.daysLeft < 0) return { verdict: "보류", reasons: ["면접일이 이미 지난 것으로 보입니다. 날짜를 확인하세요."] };
  if (req.daysLeft !== null && req.daysLeft < CONFIG.soomgo.minDaysBeforeInterview) reasons.push(`면접까지 ${req.daysLeft}일 남았습니다. 자료 수집과 ${CONFIG.soomgo.deliveryHours}시간 제작 일정이 맞는지 먼저 확인하세요.`);
  if (!req.univ && !req.dept) reasons.push("대학·학과가 요청에 없습니다. 맞춤 견적이 어려워 성사율이 낮을 수 있습니다.");
  const plus = [];
  if (req.health) plus.push("보건·의생명 계열(강점 분야)");
  if (req.hasQuestions) plus.push("공개 문항 언급");
  if (req.univ && req.dept) plus.push("대학·학과 명확");
  if (req.daysLeft !== null && req.daysLeft >= 3) plus.push(`면접까지 ${req.daysLeft}일(제작 여유)`);
  const verdict = reasons.some((r) => /남았습니다|없습니다/.test(r)) && plus.length < 2 ? "보류" : "보냄";
  return { verdict, reasons, plus };
}

// 견적 비용 대비 손익분기 성사율(견적 1건 비용은 config의 quoteCash, 원 단위)
export function breakEven(price) {
  const c = CONFIG.soomgo.quoteCash;
  return { cash: c, rate: Math.round((c / price) * 1000) / 10 };
}

// ───────── 문안 ─────────
function target(req) {
  return [req.univ, req.dept, req.track].filter(Boolean).join(" ") || "지원하시는 대학·학과";
}

export function quoteMessage(req, opts = {}) {
  const S = CONFIG.soomgo;
  const plans = S.plans.map((p) => `· ${p.name} ${won(p.price)}: ${p.desc}`).join("\n");
  const when = req.interview ? ` ${req.interview} 면접 전에 충분히 연습하실 수 있도록 일정을 맞추겠습니다.` : "";
  const field = req.health ? "보건계열 현직 대학교수로, 전공 관련 꼬리질문까지 정확하게 짚어 드립니다." : "현직 대학교수로, 면접관이 실제로 보는 평가 기준에 맞춰 구성해 드립니다.";
  return `안녕하세요. 대학 면접 답변을 준비해 드리는 대학교수입니다.

요청하신 ${target(req)} 면접 준비 견적 드립니다. ${field}

[작업 범위]
대학이 공개한 면접 문항 전체에 대해 ① 질문의 평가 의도 분석 ② 학생 본인의 실제 경험으로 만든 답변(문항당 45~55초 분량) ③ 예상 꼬리질문 3개와 대응 방향을 정리해 드립니다.

[금액]
${plans}
· ${S.zoom.name} +${won(S.zoom.price)}: ${S.zoom.minutes}분, ${S.zoom.desc}

[진행]
고용하시면 채팅으로 7가지 자료 양식을 보내 드립니다. 문장을 잘 쓰실 필요 없이 있었던 일만 적어 주시면 되고, 자료를 받은 뒤 ${S.deliveryHours}시간 안에 답변 노트를 전달합니다.${when}

허위 경험은 넣지 않으며, 합격을 보장하는 서비스는 아닙니다. 결제는 숨고페이로 진행해 주세요.${opts.extra ? `\n\n${opts.extra}` : ""}`;
}

export const MATERIALS_MESSAGE = () => `고용해 주셔서 감사합니다. 면접 답변 제작을 위해 아래 양식을 복사해서 채워 보내 주세요. 약 5분이면 됩니다.

① 지원 대학 / 학과:
② 지원 전형명:
③ 대학에서 공개한 면접 문항 전체:
(문항 캡처나 파일은 이 채팅에 사진·파일로 함께 보내 주셔도 됩니다)
④ 학교생활기록부(정밀형만):
(전체가 부담스러우면 답변에 쓰고 싶은 부분만 붙여 넣어 주세요. 학교명·이름은 지우고 보내 주세요)
⑤ 꼭 활용하고 싶은 경험 3~5개:
-
-
-
⑥ 지원 학과를 선택한 이유:
⑦ 면접에서 걱정되는 부분이나 꼭 강조하고 싶은 점:

경험은 문장을 잘 쓰실 필요가 없습니다. 예) "생명과학 조별과제에서 한 친구가 계속 자료를 늦게 줌. 처음엔 화냈는데 나중에 동생을 돌보고 있다는 걸 알게 됨. 역할을 다시 나눔." 이 정도면 충분합니다.

자료를 받으면 공개 문항의 평가 의도를 먼저 분석한 뒤, 실제 경험을 반영해 면접에서 말할 수 있는 답변으로 구성하겠습니다.`;

export const FOLLOWUP_MESSAGE = (req) => `안녕하세요. 지난번 ${target(req)} 면접 견적 드렸던 교수입니다. 혹시 결정에 도움이 되실까 해서, 공개 문항 중 1개를 골라 주시면 질문 의도와 답변 방향을 짧게 먼저 보여 드리겠습니다. 이미 다른 곳에서 진행 중이시면 답장 안 주셔도 됩니다. 면접 잘 보시길 바랍니다.`;

export const FAQ = [
  { q: "더 저렴하게 안 되나요?", a: () => `금액은 문항 수가 아니라 작업 범위로 정했습니다. 가장 부담이 적은 간편형(${won(CONFIG.soomgo.plans[0].price)})으로도 공개 문항 전체의 답변과 예상 꼬리질문을 받으실 수 있습니다. 비용을 더 줄이고 싶으시면 꼭 필요한 문항만 골라 진행하는 방법도 상의해 드리겠습니다.` },
  { q: "문항이 몇 개까지 되나요?", a: () => "대학이 공개한 문항 전체를 기준으로 합니다. 보통 5~8문항이며, 공개 문항이 10개를 넘으면 미리 말씀드리고 범위를 함께 정하겠습니다." },
  { q: "합격할 수 있을까요? 합격 보장되나요?", a: () => "합격 여부는 대학의 평가로 결정되기 때문에 보장해 드릴 수는 없습니다. 대신 면접관이 각 질문에서 무엇을 보는지 정확히 짚고, 학생 본인의 경험이 가장 잘 드러나도록 답변을 다듬어 드립니다." },
  { q: "특별한 활동이 없는데 괜찮나요?", a: () => "괜찮습니다. 면접에서는 활동의 크기보다 평범한 경험을 얼마나 구체적으로 말하는지가 더 중요합니다. 조별과제, 수업 중 탐구, 친구와의 갈등 같은 일상 경험도 충분히 좋은 답변이 됩니다." },
  { q: "학생부 없이도 되나요?", a: () => "네, 간편형은 공개 문항과 직접 적어 주신 경험만으로 진행합니다. 학생부까지 반영해 꼬리질문 대비를 더 촘촘하게 하려면 정밀형을 권해 드립니다." },
  { q: "얼마나 걸리나요?", a: () => `자료를 받은 뒤 ${CONFIG.soomgo.deliveryHours}시간 안에 전달해 드립니다. 면접일이 가까우면 말씀해 주세요. 가능한 범위에서 일정을 맞춰 보겠습니다.` },
  { q: "줌 모의면접은 어떻게 하나요?", a: () => `답변 노트를 받으신 뒤 원하시는 시간에 ${CONFIG.soomgo.zoom.minutes}분 동안 실제 면접처럼 질문과 꼬리질문을 드리고, 끝나고 바로 말하기 속도·내용·태도를 피드백해 드립니다. 접속 방법은 고용 후 숨고 채팅으로 안내드립니다.` },
  { q: "답변을 그대로 외워도 되나요?", a: () => "통째로 외우면 면접에서 오히려 어색해집니다. 답변 노트에 문항별 핵심 키워드와 말하기 대본을 함께 드리니, 키워드만 보고 자기 말로 말하는 연습을 권해 드립니다." },
];

// ───────── 학생 채팅 답장(①~⑦) → 신청서 ─────────
const CAT_GUESS = [["조별과제", /조별|모둠|팀 ?과제|팀 ?프로젝트/], ["봉사", /봉사/], ["동아리", /동아리/], ["갈등 경험", /갈등|다툼|싸움|싸웠|의견 차이/], ["실패 경험", /실패|떨어|성적이|낮게/], ["리더십", /반장|회장|부장|리더|대표/], ["탐구활동", /탐구|실험|보고서|조사|세특/], ["진로 활동", /진로|병원|체험|견학|직업/]];
const guessCat = (t) => (CAT_GUESS.find(([, re]) => re.test(t)) || ["기타"])[0];

export function parseChatReply(text) {
  const t = (text || "").replace(/\r/g, "");
  const marks = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];
  const pos = marks.map((m) => t.indexOf(m));
  let seg;
  if (pos.filter((p) => p >= 0).length >= 3) {
    seg = marks.map((m, i) => {
      if (pos[i] < 0) return "";
      const next = pos.slice(i + 1).find((p) => p > pos[i]);
      return t.slice(pos[i] + 1, next ?? t.length);
    });
  } else {
    const re = /^\s*([1-7])\s*[.)]\s*/gm;
    const hits = [...t.matchAll(re)];
    if (hits.length < 3) throw new Error("①~⑦ 양식으로 된 학생 답장을 붙여 넣어 주세요.");
    seg = Array(7).fill("");
    hits.forEach((h, i) => { seg[+h[1] - 1] = t.slice(h.index + h[0].length, hits[i + 1]?.index ?? t.length); });
  }
  // 각 칸의 안내 문구(라벨·괄호 설명) 제거
  const body = (s) => clean(s.replace(/^[^:\n]*:/, "").replace(/^\s*\((?:문항 캡처|전체가)[^)]*\)\s*$/gm, ""));
  const s = seg.map(body);
  const app = emptyApplication();
  const [u, d] = s[0].split(/[\/,·|]/).map(clean);
  app.university = u || ""; app.department = d || "";
  app.track = s[1].split("\n")[0];
  app.questions = parseQuestions(s[2]);
  app.record = s[3];
  app.tier = clean(s[3]) ? "precise" : "basic";
  const exps = s[4].split(/\n\s*(?:[-•·*]|\d+[.)])\s*|^\s*(?:[-•·*]|\d+[.)])\s*/m).map(clean).filter((x) => x.length > 3);
  app.experiences = (exps.length ? exps : [s[4]].filter(Boolean)).slice(0, 5).map((x) => ({ cat: guessCat(x), text: x }));
  app.motive = s[5];
  const CUE = { "말이 길어짐": /말이 길|길어/, "특별한 활동이 없음": /활동이 없|특별한 (게|것|활동)/, "전공 질문이 어려움": /전공 ?질문|전공.*어려/, "지원동기가 약함": /동기/, "긴장을 많이 함": /긴장|떨려|떨림/, "꼬리질문이 두려움": /꼬리/ };
  app.concerns = CONCERNS.filter((c) => CUE[c]?.test(s[6]));
  app.concernNote = s[6];
  app.contact = { name: "숨고 고객", reach: "숨고 채팅" };
  app.agree = true;
  app.questionSource = "학생 제공(숨고 채팅)";
  return app;
}
