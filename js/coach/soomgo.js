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
// blocked: 호출 전에 textHasBlocked(text)로 계산해 넘깁니다(대학명은 저장소에 두지 않으므로 해시 비교가 비동기).
export function triage(text, req = parseRequest(text), blocked = false) {
  const t = text || "";
  const reasons = [];
  if (blocked) {
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

// 캐시 손익(1캐시=1원 가정은 화면으로 확인 불가하므로 '캐시' 단위로만 표시)
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
  // 추천 상품을 먼저(가격이 품질 신호로 읽히므로 가장 싼 것을 앞세우지 않음). entry 상품은 맨 끝 한 줄.
  const line = (p) => `· ${p.name} ${won(p.price)}${p.recommended ? "(추천)" : ""}${p.limited ? `(${p.limited})` : ""}: ${p.short || p.desc}`;
  const main = S.plans.filter((p) => !p.entry);
  const ordered = [...main.filter((p) => p.recommended), ...main.filter((p) => !p.recommended).sort((a, b) => a.price - b.price)];
  const entry = S.plans.filter((p) => p.entry).map(line).join("\n");
  const plans = ordered.map(line).join("\n") + (entry ? `\n${entry}` : "") + (S.launchOffer ? `\n${S.launchOffer.text}` : "");
  const when = req.interview ? ` ${req.interview} 면접 전에 충분히 연습하실 수 있도록 일정을 맞추겠습니다.` : "";
  const field = req.health ? " 보건계열이라 전공 관련 꼬리질문까지 정확하게 짚어 드립니다." : "";
  return `입학처장으로 대학 면접 평가를 운영하고 참여해 온 현직 교수입니다.${field}

면접은 전형의 30~40%입니다. 인생의 마지막 결정이 될 수도 있는 기회를, 아무렇게나 준비한 면접으로 보내시겠습니까.

어디서든 구할 수 있는 답변은 면접관에게 구분되지 않습니다. 교수가 보는 면접 답변은 다릅니다. 저는 매년 그 답변을 평가표에 적는 사람이고, 학생 한 명의 답변을 서너 시간 읽고 고칩니다. 비싼 가격이 아닙니다. 집에서 다니는 대학과 지방에서 자취하는 대학은 한 달 월세만으로도 이 금액이 갈립니다.

[받으시는 것] ${target(req)} 공개 문항 전체에 대해 ① 면접관이 실제로 보는 평가 의도 ② 학생 본인의 경험으로 만든 45~55초 답변 ③ 예상 꼬리질문 3개와 대응 ④ 말하기 대본과 핵심 키워드 ⑤ 교수 총평. 초안을 드린 뒤 학생이 말해 보고 다시 고칩니다(수정 1회 포함). 면접일까지 쓰는 연습용 앱 이용 코드를 함께 드립니다.

[선택하세요]
${plans}

[진행] 결제 확인 → 채팅으로 7가지 자료 양식(약 5분, 있었던 일만 적으시면 됩니다) → 자료 접수 후 ${S.deliveryHours}시간 안에 전달.${when}

지원 대학·학과와 면접일을 알려 주시면 일정이 맞는지 바로 답드리겠습니다. 허위 경험은 넣지 않으며, 합격을 보장하는 서비스는 아닙니다. 기회를 놓치지 마십시오.${opts.extra ? `\n\n${opts.extra}` : ""}`;
}

export const MATERIALS_MESSAGE = () => `고용해 주셔서 감사합니다. 면접 답변 제작을 위해 아래 양식을 복사해서 채워 보내 주세요. 약 5분이면 됩니다.

① 지원 대학 / 학과:
② 지원 전형명:
③ 대학에서 공개한 면접 문항 전체:
(문항 캡처나 파일은 이 채팅에 사진·파일로 함께 보내 주셔도 됩니다)
④ 학교생활기록부(선택):
(전체가 부담스러우면 답변에 쓰고 싶은 부분만 붙여 넣어 주세요. 학교명·이름은 지우고 보내 주세요)
⑤ 꼭 활용하고 싶은 경험 3~5개:
-
-
-
⑥ 지원 학과를 선택한 이유:
⑦ 면접에서 걱정되는 부분이나 꼭 강조하고 싶은 점:

경험은 문장을 잘 쓰실 필요가 없습니다. 예) "생명과학 조별과제에서 한 친구가 계속 자료를 늦게 줌. 처음엔 화냈는데 나중에 동생을 돌보고 있다는 걸 알게 됨. 역할을 다시 나눔." 이 정도면 충분합니다.

자료를 받으면 공개 문항의 평가 의도를 먼저 분석한 뒤, 실제 경험을 반영해 면접에서 말할 수 있는 답변으로 구성하겠습니다.`;

export const FOLLOWUP_MESSAGE = (req) => {
  const S = CONFIG.soomgo;
  const when = req.interview ? `${req.interview} 면접까지 자료 접수 후 ${S.deliveryHours}시간 안에 전달하려면 ` : `자료 접수 후 ${S.deliveryHours}시간 안에 전달하므로 `;
  return `안녕하세요. 지난번 ${target(req)} 면접 견적 드렸던 교수입니다. ${when}늦지 않게 시작하시는 것이 좋아 한 번만 더 연락드립니다. 궁금한 점(문항 수, 학생부 반영 여부, 줌 모의면접 일정)은 채팅으로 바로 답해 드리겠습니다. 이미 다른 곳에서 진행 중이시면 답장 안 주셔도 됩니다. 면접 잘 보시길 바랍니다.`;
};

// ───────── 전달 완료 안내(이용 코드 포함) + 리뷰 요청 ─────────
export const DELIVERY_MESSAGE = (req, code = "") => {
  const S = CONFIG.soomgo;
  const codeLine = code
    ? `\n\n[앱 이용 코드] ${code}\n면접일까지 공개 문항을 직접 넣어 예상 점수·감점 요인·꼬리질문을 반복 확인할 수 있습니다. 코드는 본인만 사용해 주세요.`
    : "";
  return `${target(req)} 면접 답변 노트를 보내 드립니다. 문항마다 ① 질문의 평가 의도 ② 본인 경험으로 만든 답변 ③ 예상 꼬리질문 3개와 대응 방향 순서로 정리했습니다.

연습 방법은 세 가지만 지켜 주세요.
1. 통째로 외우지 말고, 문항별 핵심 키워드만 보고 자기 말로 말하기
2. 휴대폰으로 녹음해서 45~55초 안에 끝나는지 확인하기
3. 꼬리질문은 답변 방향만 기억하고 실제 말은 그 자리에서 만들기${codeLine}

읽어 보시고 수정하고 싶은 문항이 있으면 ${S.deliveryHours}시간 안에 말씀해 주세요. 1회 수정은 금액에 포함되어 있습니다. 면접 잘 보시길 바랍니다.`;
};

export const REVIEW_MESSAGE = (req) => `${target(req)} 면접은 잘 마치셨는지요. 결과와 상관없이, 준비 과정에서 도움이 된 점이나 아쉬운 점을 숨고 리뷰로 짧게 남겨 주시면 다음 학생에게 큰 도움이 됩니다. 어떤 문항이 가장 도움이 됐는지 한 줄만 적어 주셔도 충분합니다. 응원하겠습니다.`;

export const FAQ = [
  { q: "왜 이렇게 비싼가요?", a: () => `${CONFIG.soomgo.whyPrice} 합격을 보장하는 서비스는 아닙니다. 대신 평가하는 사람의 기준으로 본인 경험이 가장 잘 드러나는 답변을 만듭니다.` },
  { q: "더 저렴하게 안 되나요?", a: () => { const p0 = [...CONFIG.soomgo.plans].filter((p) => !p.entry).sort((a, b) => a.price - b.price)[0]; return `금액은 문항 수가 아니라 제 작업 시간으로 정했습니다. ${p0.name}(${won(p0.price)})은 학생이 보낸 경험을 제가 직접 읽고 문항마다 답변·꼬리질문·말하기 대본·총평을 만들고 한 번 더 고치는 데 약 ${p0.hours}시간이 드는 금액입니다. 직접 쓴 답변이 있으시면 그것만 고쳐 드리는 첨삭형(${won(CONFIG.soomgo.plans.find((p) => p.entry)?.price || 0)}, 5문항 이내 1회)도 있습니다.`; } },
  { q: "무료 샘플이나 맛보기를 먼저 볼 수 있나요?", a: () => "무료 샘플은 드리지 않습니다. 학생 본인의 경험이 없는 상태에서 만든 샘플은 누구에게나 맞는 일반론이 되어 판단에 도움이 되지 않기 때문입니다. 대신 작업 방식(질문 의도 → 본인 경험 → 차별화 답변 → 꼬리질문)과 전달물 구성은 채팅으로 자세히 설명드리고, 결제 후 자료를 받으면 바로 시작합니다." },
  { q: "실전형은 뭐가 다른가요?", a: () => { const pk = CONFIG.soomgo.plans.find((p) => p.includesZoom); return pk ? `${pk.name}(${won(pk.price)})은 서면 답변 노트에 30분 줌 모의면접을 더한 상품입니다. 답변을 받는 데서 끝나지 않고 실제로 말해 보고 바로 고치기 때문에 가장 많이 권해 드립니다. ${CONFIG.soomgo.launchOffer ? "첫 3분께는 서면 완성형 가격으로 진행하고 있으니 채팅으로 말씀해 주세요." : ""}` : "현재 패키지 상품은 없습니다."; } },
  { q: "문항이 몇 개까지 되나요?", a: () => "대학이 공개한 문항 전체를 기준으로 합니다. 보통 5~8문항이며, 공개 문항이 10개를 넘으면 미리 말씀드리고 범위를 함께 정하겠습니다." },
  { q: "합격할 수 있을까요? 합격 보장되나요?", a: () => "합격 여부는 대학의 평가로 결정되기 때문에 보장해 드릴 수는 없습니다. 대신 면접관이 각 질문에서 무엇을 보는지 정확히 짚고, 학생 본인의 경험이 가장 잘 드러나도록 답변을 다듬어 드립니다." },
  { q: "특별한 활동이 없는데 괜찮나요?", a: () => "괜찮습니다. 면접에서는 활동의 크기보다 평범한 경험을 얼마나 구체적으로 말하는지가 더 중요합니다. 조별과제, 수업 중 탐구, 친구와의 갈등 같은 일상 경험도 충분히 좋은 답변이 됩니다." },
  { q: "학생부 없이도 되나요?", a: () => "네, 됩니다. 공개 문항과 직접 적어 주신 경험만으로도 진행합니다. 학생부를 주시면 꼬리질문 대비를 더 촘촘하게 할 수 있고, 전체가 부담스러우면 답변에 쓰고 싶은 부분만 보내 주셔도 됩니다." },
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

// ═════════ 논문 컨설팅 모드(숨고 메인 상품, 2026-10-13) ═════════
const T = () => CONFIG.thesis;
const wonT = (n) => `${n.toLocaleString("ko-KR")}원`;

// 요청문이 논문인지 면접인지
export function detectMode(text) {
  const t = text || "";
  const thesis = (t.match(/논문|석사|박사|학위|프로포절|연구계획서|심사|통계|고찰|교정|윤문|SPSS|디펜스|대학원/g) || []).length;
  const interview = (t.match(/면접|입시|대입|수시|학종|학생부|고3|고등학|지원 ?동기|꼬리질문/g) || []).length;
  return thesis > interview ? "thesis" : interview > thesis ? "interview" : "unknown";
}

export function parseThesisRequest(text) {
  const t = text || "";
  const degree = /박사/.test(t) ? "박사" : /석사/.test(t) ? "석사" : /학사|졸업논문/.test(t) ? "학사" : "";
  const deep = new RegExp(T().deepFields), logic = new RegExp(T().logicFields);
  const fieldType = deep.test(t) ? "심층" : logic.test(t) ? "논리" : "확인";
  const field = (t.match(new RegExp(`(${T().deepFields}|${T().logicFields})[가-힣]{0,4}`)) || [])[0] || "";
  const stage = /프로포절|연구계획서|proposal/i.test(t) ? "프로포절" : /심사 ?(결과|의견|위원)|디펜스|defense|지적/i.test(t) ? "심사 대응"
    : /고찰|discussion|논의/i.test(t) ? "고찰" : /통계|분석|SPSS|결과 ?(해석|표)/i.test(t) ? "결과 해석" : /서론|선행연구|이론적 배경/.test(t) ? "서론·선행연구" : "";
  const dm = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  const wk = t.match(/(\d+)\s*주/); const mo = t.match(/(\d+)\s*(개월|달)/); const dd = t.match(/(\d+)\s*일 ?(후|안|이내|뒤|남)/);
  let daysLeft = null, deadline = "";
  if (dm) { const now = new Date(); let d = new Date(now.getFullYear(), +dm[1] - 1, +dm[2]); if (d < now - 86400000 * 60) d = new Date(now.getFullYear() + 1, +dm[1] - 1, +dm[2]); deadline = `${+dm[1]}월 ${+dm[2]}일`; daysLeft = Math.ceil((d - now) / 86400000); }
  else if (dd) { daysLeft = +dd[1]; deadline = `${dd[1]}일 뒤`; } else if (wk) { daysLeft = +wk[1] * 7; deadline = `${wk[1]}주 뒤`; } else if (mo) { daysLeft = +mo[1] * 30; deadline = `${mo[1]}개월 뒤`; }
  const pages = +((t.match(/(\d+)\s*(쪽|페이지|p\b|장)/i) || [])[1] || 0);
  const wants = /맞춤법|오탈자|교정|교열|윤문|문장 ?다듬/.test(t) ? "교정" : /통계|분석|SPSS|R\b/.test(t) ? "통계" : /영문|영어|번역/.test(t) ? "영문" : "";
  const ghost = /대필|대신 ?써|써 ?주세요|써주실|작성해 ?주|만들어 ?주|완성해 ?주/.test(t) && !/첨삭|지도|검토|봐 ?주/.test(t);
  const evade = /AI ?탐지|GPT ?탐지|카피킬러 ?우회|표절률 ?(낮춰|회피)|탐지 ?(회피|우회)/i.test(t);
  const guarantee = /통과 ?보장|무조건 ?통과|100%/.test(t);
  const structural = /논리|구조|고찰|해석|심사|지적|반려|보완|막혀|막힘|방향/.test(t);
  return { degree, field, fieldType, stage, deadline, daysLeft, pages, wants, ghost, evade, guarantee, structural };
}

export function triageThesis(text, req = parseThesisRequest(text)) {
  if (/인디자인|조판|편집 ?디자인|표지 ?디자인|단행본|자서전|교재|사업계획서|번역/.test(text || "") && !/논문|학위|학술/.test(text || "")) {
    return { verdict: "거절", reasons: ["조판·편집·단행본·번역 요청입니다. 학위논문·학술 원고가 아니므로 캐시를 쓰지 않습니다."] };
  }
  if (req.ghost) return { verdict: "거절", reasons: ["대필 요청으로 읽힙니다. 작성은 의뢰인이 한다는 원칙과 충돌합니다."] };
  if (req.evade) return { verdict: "거절", reasons: ["AI 탐지·표절 검사 회피 요청입니다. 받지 않습니다."] };
  if (req.guarantee) return { verdict: "거절", reasons: ["통과 보장 요구입니다. 보장할 수 없는 서비스라 받지 않습니다."] };
  const reasons = [], plus = [];
  if (req.wants === "영문") reasons.push("영문 교정·번역 요청입니다. 강점 분야가 아니므로 원고를 보고 가능 여부를 먼저 판단하세요.");
  if (req.wants === "교정" && !req.structural) reasons.push("단순 교정 요청이라 가격 경쟁이 예상됩니다. 의생명 분야면 용어·데이터 서술 정확성 검토를 차별점으로 넣고, 구조 문제가 보이면 정밀진단을 한 줄 제안하세요.");
  if (req.fieldType === "확인") reasons.push("분야가 요청에 없거나 강점 분야가 아닙니다. 원고를 보고 가능 여부를 먼저 말씀드리는 조건으로 보내세요.");
  if (req.daysLeft !== null && req.daysLeft <= 7) reasons.push(`마감이 ${req.deadline}입니다. 전 과정은 어렵고 정밀진단 또는 부분 컨설팅만 가능하다고 적으세요.`);
  if (req.fieldType === "심층") plus.push("의생명·보건 분야(강점)");
  if (req.fieldType === "논리") plus.push("연구 논리·방법론 검토 분야");
  if (req.degree) plus.push(`${req.degree} 학위논문 단계`);
  if (req.stage) plus.push(`${req.stage} 수요`);
  if (req.structural) plus.push("결과 해석·심사 대응 수요(고단가 리드)");
  if (req.daysLeft !== null && req.daysLeft > 14) plus.push(`마감까지 ${req.daysLeft}일(제작 여유)`);
  const verdict = reasons.length >= 2 && plus.length < 2 ? "보류" : "보냄";
  return { verdict, reasons, plus };
}

export function thesisQuote(req, opts = {}) {
  const P = T().plans; const diag = P.find((p) => p.key === "diag");
  const who = req.degree ? `${req.degree} 학위논문` : "학위논문";
  const fieldLine = req.fieldType === "심층" ? ` 특히 ${req.field || "의생명·보건"} 분야는 제가 실제 실험·임상 연구와 국제학술지 게재를 해 온 분야라, 데이터 해석과 고찰의 전문성까지 봐 드립니다.`
    : req.fieldType === "논리" ? ` ${req.field || "해당"} 분야는 연구 질문의 타당성, 변수 설정, 설문·통계 해석, 논리 전개를 중심으로 봅니다.`
    : " 분야는 원고를 먼저 보고 제가 책임지고 볼 수 있는 연구인지 솔직하게 말씀드리겠습니다.";
  const stageLine = req.stage === "프로포절" ? "프로포절 단계라면 연구 질문과 방법의 정합성부터 잡는 것이 가장 빠릅니다."
    : req.stage === "심사 대응" ? "심사 의견을 받으셨다면 지적 문장이 아니라 그 지적이 나온 구조적 원인을 찾는 것이 먼저입니다."
    : req.stage === "고찰" ? "고찰에서 막히셨다면 결과가 실제로 보여 주는 범위와 선행연구와의 연결점을 다시 잡아야 합니다."
    : req.stage === "결과 해석" ? "결과는 나왔는데 해석이 막힌 경우, 통계가 틀린 것이 아니라 연구목적과 결과가 다른 방향을 보고 있는 경우가 대부분입니다."
    : "논문이 막히는 지점은 대개 연구목적·방법·결과·해석·고찰 다섯 축 중 한 곳이 끊긴 자리입니다.";
  const urgent = req.daysLeft !== null && req.daysLeft <= 7 ? `\n마감이 ${req.deadline}이라 전 과정은 어렵고, 정밀진단 또는 막힌 구간만 보는 부분 컨설팅으로 가장 급한 곳부터 잡아 드리겠습니다.` : "";
  const editLine = req.wants === "교정" ? `\n교정·윤문은 분량과 상태를 보고 별도 견적을 드립니다${req.fieldType === "심층" ? ". 의생명 분야는 문장뿐 아니라 용어와 데이터 서술의 정확성까지 함께 봅니다" : ""}. 문장 문제가 아니라 구조 문제가 보이면 정밀진단을 먼저 권해 드리겠습니다.` : "";
  const plans = P.map((p) => `· ${p.name}${p.recommended ? "(먼저 권합니다)" : ""} ${wonT(p.price)}${p.from ? "부터" : ""}: ${p.desc}`).join("\n");
  return `${who} 심사와 지도를 맡고 있는 현직 대학교수(진단검사의학 박사)입니다. 요청하신 내용을 보고 견적 드립니다.${fieldLine}

${stageLine} 학위논문은 문장을 다듬는 윤문으로 통과하지 않습니다. 심사하는 사람의 눈으로 어디서 논리가 끊겼는지 찾으면 멈춰 있던 논문이 다시 움직입니다.${urgent}${editLine}

[진행 프로그램]
${plans}
· 부분 컨설팅: ${T().partial}

정밀진단을 먼저 권하는 이유는, 장기 컨설팅을 덜컥 결제하지 않고 지금 원고가 어디에 서 있는지부터 확인하는 것이 가장 비용이 적게 들기 때문입니다. 원고 접수 후 ${T().deliveryDays} 안에 상담 일정을 잡습니다.

[다음 단계] 원고를 완벽하게 만들어 오지 마시고 지금 상태 그대로 보내 주세요. 메시지로 네 가지만 알려 주시면 됩니다. 학위 과정, 전공과 세부 주제, 현재 단계, 지금 가장 해결하고 싶은 막힘. 자료를 보고 가장 시급한 내용과 현실적인 일정을 먼저 짚어 드리겠습니다.

작성은 의뢰인이 하며 대필은 하지 않습니다. 통과를 보장하지 않으며, 제 소속 대학 대학원생은 받지 않습니다.${opts.extra ? `\n\n${opts.extra}` : ""}`;
}

export const THESIS_MATERIALS_MESSAGE = () => `고용해 주셔서 감사합니다. 원고를 보기 전에 네 가지만 알려 주세요.

① 학위 과정: 석사 / 박사
② 전공 분야와 세부 주제:
③ 현재 단계: (예: 프로포절 준비 중, 분석 완료 후 고찰 진행 중, 본심사 1개월 전)
④ 지금 가장 해결하고 싶은 막힘:

그리고 가지고 계신 자료를 있는 그대로 보내 주세요. 연구계획서, 진행 중인 원고, 통계 결과표, 설문지, 실험 데이터, 지도교수님 메모, 심사위원 피드백 등 어떤 상태여도 괜찮습니다. 자료를 먼저 확인한 뒤 우선순위와 상담 일정을 말씀드리겠습니다. 원고와 데이터는 작업 후 삭제합니다.`;

export const THESIS_FOLLOWUP_MESSAGE = (req) => `안녕하세요. 지난번 ${req.degree ? req.degree + " " : ""}논문 견적 드렸던 교수입니다. 결정에 도움이 되실까 해서, 원고 중 가장 막힌 부분 2~3쪽을 보내 주시면 어디서 논리가 끊겼는지 짧게 먼저 짚어 드리겠습니다. 이미 다른 곳에서 진행 중이시면 답장 안 주셔도 됩니다.`;

export const THESIS_DELIVERY_MESSAGE = (req) => `정밀진단 리포트를 보내 드립니다. 상담에서 말씀드린 대로 ① 손대지 않아도 되는 부분 ② 심사를 위해 반드시 보완할 취약점 ③ 지도교수님 지적의 구조적 원인 ④ 우선순위와 다음 단계 순서로 정리했습니다.

리포트를 읽고 이해가 안 되는 항목이 있으면 채팅으로 물어봐 주세요. 리포트 범위 안의 질문은 추가 비용 없이 답해 드립니다. 다음 단계(부분 컨설팅 또는 전 과정)로 이어 가실지는 리포트를 보신 뒤 정하셔도 됩니다.`;

export const THESIS_REVIEW_MESSAGE = () => `상담과 리포트가 도움이 되셨는지요. 준비 과정에서 도움이 된 점이나 아쉬운 점을 숨고 리뷰로 짧게 남겨 주시면 다음 연구자에게 큰 도움이 됩니다. 어떤 부분이 가장 도움이 됐는지 한 줄만 적어 주셔도 충분합니다. 심사 잘 마치시길 바랍니다.`;

export const THESIS_FAQ = [
  { q: "대필도 되나요? 써 주시면 안 되나요?", a: () => "작성은 의뢰인이 하셔야 합니다. 대필은 하지 않습니다. 대신 지금 원고에서 어디가 끊겼는지, 무엇을 먼저 고쳐야 하는지를 심사위원의 기준으로 짚어 드리고, 고친 원고를 다시 봐 드립니다." },
  { q: "통계만 봐 주실 수 있나요?", a: () => "됩니다. 결과표가 연구 질문에 정면으로 답하고 있는지, 고찰에서 어디까지 책임 있게 해석할 수 있는지까지 함께 봅니다. 많은 경우 통계가 틀린 것이 아니라 연구목적과 결과가 다른 방향을 보고 있는 것이 문제입니다." },
  { q: "왜 정밀진단을 먼저 하라고 하시나요?", a: () => `${T().plans[0].name}(${wonT(T().plans[0].price)})은 원고를 먼저 보고 60분 상담과 1~2쪽 리포트로 지금 논문이 어디에 서 있는지 확인하는 단계입니다. 전 과정 컨설팅이 필요한지, 막힌 구간만 보면 되는지가 여기서 정해지므로 가장 비용이 적게 드는 시작입니다.` },
  { q: "어느 분야까지 되나요?", a: () => "의학·간호·보건·의생명·임상 데이터가 들어간 논문이 가장 강합니다. 교육·사회복지·심리·경영 등은 연구 논리와 방법론 중심으로 봅니다. 지엽적인 특수 이론이나 고도의 모델링은 원고를 먼저 보고 제가 책임지고 볼 수 있는지 솔직하게 말씀드립니다." },
  { q: "기간은 얼마나 걸리나요?", a: () => `정밀진단은 원고 접수 후 보통 ${T().deliveryDays} 안에 상담 일정을 잡습니다. 심사일이 가까우면 먼저 말씀해 주세요. 가능한 범위에서 맞춰 보겠습니다.` },
  { q: "지도교수님 의견과 다르면 어떻게 하나요?", a: () => "최종 판단은 항상 지도교수님입니다. 저는 지도교수님의 지적이 왜 나왔는지 구조적 원인을 찾고, 그 지적에 맞게 고치는 길을 짚어 드립니다. 지도교수님과 다른 방향을 권하지 않습니다." },
  { q: "통과할 수 있을까요?", a: () => "통과 여부는 심사위원회가 결정하므로 보장해 드릴 수 없습니다. 대신 심사위원이 어디서 멈추는지, 어떤 해석에서 질문이 나오는지를 미리 짚어 지적받기 전에 보완하도록 돕습니다." },
];
