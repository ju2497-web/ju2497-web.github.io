// 면접답변 제작 신청서: 고정 7개 필드 모델, 신청 코드 인코딩, 경험 → 문항 자동 배정,
// 짧은 경험 메모 → 상황·문제·예상과 다른 사실·행동·결과·배운 점 재구성.

import { QTYPES, COMPETENCIES } from "./framework.js";
import { detectType, evaluate, speakingScript, deptProfile, fitLength, coaching, happened, healthy } from "./engine.js";
import { clean, J, isSentence, past, learned } from "../interview-engine.js";

export const EXP_CATS = ["동아리", "탐구활동", "봉사", "조별과제", "갈등 경험", "리더십", "실패 경험", "진로 활동", "기타"];
export const STRENGTHS = ["책임감", "협업", "탐구력", "꼼꼼함", "경청", "끈기", "공감", "리더십", "성실함", "도전정신"];
export const CONCERNS = ["말이 길어짐", "특별한 활동이 없음", "전공 질문이 어려움", "지원동기가 약함", "긴장을 많이 함", "꼬리질문이 두려움"];
export const TIERS = {
  basic: { label: "간편형", desc: "공개문항 + 경험만으로 제작", needsRecord: false },
  precise: { label: "정밀형", desc: "학생부까지 반영해 제작", needsRecord: true },
  review: { label: "교수 검수형", desc: "정밀형 + 교수 직접 첨삭", needsRecord: true },
};

export function emptyApplication() {
  return {
    v: 1, id: `A${Date.now().toString(36).toUpperCase()}`, createdAt: new Date().toISOString(), tier: "basic",
    university: "", department: "", track: "",
    questions: [], questionSource: "",
    record: "",
    motive: "",
    experiences: [{ cat: "", text: "" }, { cat: "", text: "" }, { cat: "", text: "" }],
    strengths: [], strengthNote: "",
    concerns: [], concernNote: "",
    contact: { name: "", reach: "" }, agree: false,
  };
}

// ───────── 신청 코드(메신저로 붙여 보내기 쉬운 한 줄) ─────────
const PREFIX = "IVAPP1:";
export function encodeApplication(app) {
  const bytes = new TextEncoder().encode(JSON.stringify(app));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return PREFIX + btoa(bin);
}
export function decodeApplication(text) {
  const t = (text || "").trim();
  if (t.startsWith("{")) return JSON.parse(t);
  const i = t.indexOf(PREFIX);
  if (i < 0) throw new Error("신청 코드(IVAPP1:…) 또는 신청서 파일 내용을 붙여 넣어 주세요.");
  const code = t.slice(i + PREFIX.length).split(/\s/)[0];
  const bin = atob(code);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

export function checkApplication(app) {
  const miss = [];
  if (!clean(app.university) || !clean(app.department)) miss.push("지원 대학·학과");
  if (!app.questions.length) miss.push("공개 면접 문항");
  if (!clean(app.motive)) miss.push("학과 지원 이유");
  const exps = app.experiences.filter((e) => clean(e.text));
  if (exps.length < 1) miss.push("대표 경험(최소 1개)");
  if (!clean(app.contact.name) || !clean(app.contact.reach)) miss.push("이름·연락처");
  if (!app.agree) miss.push("개인정보 활용 동의");
  return { miss, expCount: exps.length };
}

// ───────── 경험 메모 분석 ─────────
const ROLE_RE = [
  ["discovery", /알게|알고 보니|알았|사실은|알아보니|들어 보니|물어보니|보니|이유가|때문이었|것 같|셨던|였던 것/],
  ["learned", /배움|배웠|깨달|느낌$|느꼈|교훈|중요하다는|중요함/],
  ["result", /결과|덕분|완성|마무리|성공|끝냄|끝냈|좋아짐|좋아졌|올랐|오름|향상|칭찬|해결됨|해결했|잘 됨|주심|주셨/],
  ["action", /나눔|나눴|제안|바꿈|바꿨|도와|설명|대화|정리|조정|맡음|맡았|맡김|시작|만들|기록|연습|찾아|물어|통일|기다림|기다렸|했음|함$|했다/],
  ["problem", /늦게|늦음|안 해|못 해|갈등|화냄|화냈|화가|화를|불만|싸움|싸웠|문제가|실수|떨어|낮게|낮음|틀림|실패|어려움|힘들/],
];

export function parseExperience(text) {
  const clauses = (text || "").split(/[.\n。]+/).map((s) => clean(s)).filter(Boolean);
  const roles = { situation: [], problem: [], discovery: [], action: [], result: [], learned: [] };
  clauses.forEach((c, i) => {
    const hit = ROLE_RE.find(([, re]) => re.test(c));
    const role = hit ? hit[0] : i === 0 ? "situation" : "action";
    if (i === 0 && role !== "discovery" && role !== "learned" && !roles.situation.length) roles.situation.push(c);
    else roles[role].push(c);
  });
  return { clauses, roles, title: shortTitle(clauses[0] || "") };
}
function shortTitle(s) {
  const m = s.match(/^(.{2,30}?(에서|때|중에|하면서))/);
  return clean(m ? m[1].replace(/(에서|때|중에|하면서)$/, "") : s.slice(0, 24));
}

// 경험 분류 → 잘 맞는 문항 유형
const CAT_FIT = {
  "갈등 경험": ["conflict", "emotion"], "조별과제": ["conflict", "emotion", "learning"], "리더십": ["conflict", "strengthweak"],
  "실패 경험": ["improve", "strengthweak"], "탐구활동": ["learning", "jobcomp", "motive"], "동아리": ["learning", "motive", "conflict"],
  "봉사": ["emotion", "motive", "jobcomp"], "진로 활동": ["motive", "career", "jobcomp"], "기타": [],
};
const TYPE_CUES = {
  conflict: /갈등|의견|다툼|싸|늦게|불만|역할/, emotion: /화|불편|속상|참|감정|어르신|짜증/, improve: /실패|떨어|낮|성적|다시|개선|원인/,
  learning: /탐구|실험|수업|과목|보고서|측정|조사/, motive: /계기|관심|꿈|병원|진로/, jobcomp: /관찰|확인|정확|안전|환자/,
  strengthweak: /장점|단점|성격/, career: /진로|목표/, ethics: /실수|정직|규칙/, general: /./,
};

function bigrams(s) {
  const t = (s || "").replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function overlap(a, b) { const A = bigrams(a), B = bigrams(b); let n = 0; for (const g of A) if (B.has(g)) n++; return n; }

function fitScore(exp, type, question) {
  const cat = (CAT_FIT[exp.cat] || []).indexOf(type);
  return (cat >= 0 ? 6 - cat * 2 : 0) + ((TYPE_CUES[type] || /$^/).test(exp.text) ? 3 : 0) + Math.min(overlap(exp.text, question), 6) * 0.5;
}

// 문항마다 가장 잘 맞는 경험을 배정하되, 같은 경험이 반복되지 않도록 분산
export function assignExperiences(app) {
  const exps = app.experiences.map((e, i) => ({ ...e, i })).filter((e) => clean(e.text));
  const used = new Map();
  return app.questions.map((q) => {
    const type = detectType(q);
    if (!exps.length || ["career", "ethics"].includes(type) && !exps.some((e) => fitScore(e, type, q) >= 3)) return { question: q, type, expIndex: -1 };
    const ranked = exps.map((e) => ({ e, s: fitScore(e, type, q) - (used.get(e.i) || 0) * 2.5 })).sort((a, b) => b.s - a.s);
    const pick = ranked[0].e;
    used.set(pick.i, (used.get(pick.i) || 0) + 1);
    return { question: q, type, expIndex: pick.i };
  });
}

// ───────── 재구성 ─────────
const OPEN = {
  conflict: "저는 갈등이 생기면 상대의 행동보다 그 이유를 먼저 확인하려고 합니다.",
  emotion: "저는 감정이 앞서는 순간에 한 번 멈추고 상황을 먼저 보려고 합니다.",
  improve: "저는 결과가 기대에 못 미쳤을 때, 노력의 양보다 방법을 바꿔 극복한 경험이 있습니다.",
  general: "",
};
const STRENGTH_COMP = { 꼼꼼함: "세심한 관찰과 정확한 확인", 책임감: "끝까지 책임지는 태도", 협업: "동료와 협력하는 능력", 경청: "환자의 말을 끝까지 듣는 경청", 공감: "환자의 불안에 공감하는 능력", 탐구력: "근거를 찾아 판단하는 탐구력", 끈기: "어려운 상황에서도 포기하지 않는 끈기", 성실함: "기본 절차를 매번 지키는 성실함", 리더십: "팀을 조율하는 리더십", 도전정신: "새로운 것을 배우려는 태도" };
const PERSONAL_CONCERN = { "말이 길어짐": "생각을 말할 때 말이 길어지는 점", "긴장을 많이 함": "처음 보는 사람 앞에서 긴장을 많이 하는 점" };

const DISCOVERY_LEAD = { conflict: "그런데 ", emotion: "순간 서운했지만, ", improve: "원인을 살펴보니 ", learning: "처음에는 ", general: "그런데 " };

function learnedFree(s) {
  s = clean(s);
  if (/(배움|배웠음)$/.test(s)) return s.replace(/(배움|배웠음)$/, "배웠습니다.");
  if (/깨달음$/.test(s)) return s.replace(/깨달음$/, "깨달았습니다.");
  if (/느낌$/.test(s)) return s.replace(/느낌$/, "느꼈습니다.");
  return learned(s);
}

function narrative(roles, opts = {}) {
  const r = roles;
  const out = [];
  if (r.situation.length && !opts.skipSituation) out.push({ t: happened(r.situation.join(", ")) });
  r.problem.forEach((p) => out.push({ t: happened(p) }));
  if (r.discovery.length) {
    const d = r.discovery.join(" ");
    const lead = /보니/.test(d) && opts.type === "improve" ? "" : DISCOVERY_LEAD[opts.type] || "그런데 ";
    out.push({ t: lead + happened(d).replace(/^(그런데|그래서)\s*/, "") });
  }
  const firstLead = opts.type === "learning" && !r.discovery.length ? "저는 " : "그래서 ";
  if (r.action.length) r.action.forEach((a, i) => out.push({ t: (i === 0 ? firstLead : "") + past(a).replace(/^(그래서)\s*/, "") }));
  else out.push({ t: `그래서 저는 ${ph("내가 한 행동")}.` });
  if (r.result.length) out.push({ t: `그 결과 ${happened(r.result.join(" "))}`, opt: true });
  out.push({ t: r.learned.length ? `이 경험으로 ${learnedFree(r.learned.join(" "))}` : `이 경험으로 ${ph("배운 점 한 문장")}.` });
  if (opts.lead) out.unshift({ t: opts.lead });
  return out;
}
const ph = (label) => `[✎ ${label}]`;
const roleJ = (role) => `${role}${J.이(role)}`;

function closing(type, c) {
  const h = healthy(c);
  return {
    conflict: { t: `${roleJ(c.role)} 되어서도 ${h ? "환자와 동료" : "함께하는 사람"}의 행동 뒤에 있는 사정을 먼저 헤아리겠습니다.`, opt: true },
    emotion: { t: `${roleJ(c.role)} 되어서도 ${h ? "환자와 보호자" : "상대"}의 날 선 말 뒤에 있는 불안을 먼저 보겠습니다.`, opt: true },
    improve: { t: `이 태도는 ${h ? "실수의 원인을 찾아 환자 안전을 지켜야 하는" : "문제의 원인을 찾아 개선해야 하는"} ${c.role}에게도 꼭 필요하다고 생각합니다.`, opt: true },
    learning: { t: `이 경험이 ${c.dept || "전공"}의 이론과 실습을 배우는 데 좋은 바탕이 될 것이라고 생각합니다.` },
  }[type] || { t: `이 경험을 ${c.dept || "전공"} 공부와 ${c.role}의 길로 이어가겠습니다.`, opt: true };
}

function buildParts(type, question, app, exp, c) {
  const p = exp ? parseExperience(exp.text) : null;
  const st = app.strengths[0] || clean(app.strengthNote);
  const motive = clean(app.motive);
  switch (type) {
    case "conflict": case "emotion": case "improve": case "general":
      return p ? [{ t: OPEN[type] }, ...narrative(p.roles, { type }), closing(type, c)].filter((x) => x.t) : [{ t: ph("이 문항에 쓸 경험을 배정하세요") + "." }];
    case "learning": {
      if (!p) return [{ t: `${c.dept || "전공"} 공부에 도움이 될 경험으로 ${ph("활동 이름")}${"을"} 꼽고 싶습니다.` }];
      const lead = `${c.dept || "전공"} 공부에 도움이 될 경험으로 ${p.title}${J.을(p.title)} 꼽고 싶습니다.`;
      const why = { t: `이 경험이 도움이 될 것이라고 생각하는 이유는 ${ph("전공 공부·실습에서 같은 원리가 쓰이는 장면")} 때문입니다.` };
      return [...narrative(p.roles, { lead, type, skipSituation: p.roles.situation.join("").startsWith(p.title) }), why];
    }
    case "motive": {
      const out = [{ t: motive ? `제가 ${c.dept || "이 학과"}에 지원한 이유는 ${isSentence(motive) ? `다음과 같습니다. ${motive}.` : `${motive.replace(/(기|서)$/, "$1")}${/(기|때문)$/.test(motive) ? " 때문입니다." : "입니다."}`}` : `제가 ${c.dept || "이 학과"}에 지원한 이유는 ${ph("지원 이유")}입니다.` }];
      if (p) out.push({ t: `이 생각은 ${p.title}${J.을(p.title)} 하면서 더 분명해졌습니다.` }, ...narrative(p.roles).filter((x) => !/^그 결과/.test(x.t)).slice(0, 3).map((x) => ({ ...x, opt: true })));
      out.push({ t: `${c.dept || "이 학과"}에서 전문성을 쌓아 ${ph("되고 싶은 모습")}${"이"} 되겠습니다.` });
      return out;
    }
    case "strengthweak": {
      const weak = app.concerns.map((x) => PERSONAL_CONCERN[x]).find(Boolean);
      const out = [{ t: `저의 가장 큰 장점은 ${st || ph("장점")}입니다.` }];
      if (p) out.push({ t: p.roles.action.length ? `실제로 저는 ${past(p.roles.action[0])}` : `${ph("장점이 드러난 실제 행동")}.` });
      out.push({ t: `반면 보완할 점은 ${weak || ph("보완할 점")}입니다.` });
      out.push({ t: `이를 고치기 위해 ${weak === PERSONAL_CONCERN["말이 길어짐"] ? "말하기 전에 핵심을 세 문장으로 정리하는 연습을 하고 있습니다." : ph("지금 하고 있는 노력") + "."}` });
      out.push({ t: `${roleJ(c.role)} 되는 과정에서는 ${ph("실습·학업에서 발전시킬 구체적 방법")}.` });
      return out;
    }
    case "jobcomp": {
      const comp = STRENGTH_COMP[app.strengths[0]] || ph("가장 중요한 역량 하나");
      const out = [{ t: `저는 ${c.role}에게 가장 중요한 역량이 ${comp}${/[\]]$/.test(comp) ? "" : batchim(comp) ? "이라고" : "라고"} 생각합니다.` }, { t: `그 이유는 ${ph("실제 업무 장면에서의 이유")} 때문입니다.` }];
      if (p) out.push({ t: p.roles.action.length ? `저는 ${p.title}에서도 ${past(p.roles.action[0])}` : `${ph("관련 습관·행동")}.` });
      out.push({ t: `이 습관을 ${c.dept || "전공"}에서 체계적인 역량으로 키우겠습니다.`, opt: true });
      return out;
    }
    default: {
      // career, ethics: 기본형 질문 틀(빈칸) 사용
      return [{ t: ph("이 문항은 경험보다 판단·계획을 묻습니다. AI 심층형 또는 직접 작성 권장") + "." }];
    }
  }
}
function batchim(w) { const ch = (w || "").trim().slice(-1).charCodeAt(0); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0; }

export function targetFor(app) { return app.concerns.includes("말이 길어짐") ? 45 : 50; }

export function concernTips(app) {
  const m = {
    "말이 길어짐": "말이 길어지는 편이라 목표를 45초로 잡았습니다. 첫 문장 결론 → 경험 → 배운 점, 세 덩어리만 기억하세요.",
    "특별한 활동이 없음": "특별한 활동보다 평범한 경험을 얼마나 구체적으로(누가·무엇을·어떻게) 말하는지가 점수를 가릅니다.",
    "전공 질문이 어려움": "전공 질문은 ‘정의 한 문장 → 고교에서 배운 예시 → 모르는 부분은 입학 후 공부하겠다’ 순서로 답하세요.",
    "지원동기가 약함": "지원동기는 계기 하나와 그 뒤 스스로 해 본 행동 하나만 있으면 충분합니다. 거창한 꿈보다 장면이 중요합니다.",
    "긴장을 많이 함": "긴장되면 첫 문장만 외워 두세요. 첫 문장이 나오면 나머지는 키워드로 이어집니다.",
    "꼬리질문이 두려움": "꼬리질문은 ‘더 구체적으로’를 묻는 경우가 대부분입니다. 답변에 쓴 경험의 숫자·장면을 한 번 더 떠올려 두세요.",
  };
  return app.concerns.map((c) => m[c]).filter(Boolean);
}

export function buildForQuestion(app, question, expIndex) {
  const type = detectType(question);
  const T = QTYPES[type];
  const dp = deptProfile(app.department);
  const c = { dept: clean(app.department), role: dp.role };
  const target = targetFor(app);
  const exp = expIndex >= 0 ? app.experiences[expIndex] : null;
  const { text: answer } = fitLength(buildParts(type, question, app, exp, c), target);
  const ev = evaluate(answer, question, app.department, target, type);
  return {
    question, type, typeLabel: T.label, competencies: T.comps.map((x) => COMPETENCIES[x]), intent: T.intent, looks: T.looks,
    expIndex, answer, score: ev.score, grade: ev.grade, issues: ev.issues, seconds: ev.seconds, target,
    followups: T.followups.map((f) => ({ q: f.q, answer: "", dir: f.dir })),
    script: speakingScript(answer, []),
    coaching: [...concernTips(app), ...coaching(type, ev.seconds, target)],
    mode: "basic",
  };
}

export function buildAll(app) {
  return assignExperiences(app).map((a) => buildForQuestion(app, a.question, a.expIndex));
}

// AI 심층형 요청용으로 신청서를 프롬프트 맥락으로 변환
export function applicationContext(app, expIndex) {
  const exps = app.experiences.filter((e) => clean(e.text));
  return {
    motiveNote: clean(app.motive),
    strengths: [...app.strengths, clean(app.strengthNote)].filter(Boolean).join(", "),
    concerns: [...app.concerns, clean(app.concernNote)].filter(Boolean).join(", "),
    record: app.tier === "basic" ? "" : clean(app.record),
    focusExperience: expIndex >= 0 ? `[${app.experiences[expIndex].cat || "경험"}] ${clean(app.experiences[expIndex].text)}` : "",
    otherExperiences: exps.filter((e, i) => app.experiences.indexOf(e) !== expIndex).map((e) => `[${e.cat || "경험"}] ${clean(e.text)}`).join("\n"),
  };
}
