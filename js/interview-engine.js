// 면접 답변 엔진: 문항 분리 → 유형 판별 → 학생 본인 재료로 답변 초안·키워드·꼬리질문 생성.

import { TYPES, TIPS, FOLLOWUPS } from "./interview-data.js";

const strip = (s) => (s || "").toLowerCase().replace(/\s+/g, "");
const clean = (s) => (s || "").trim().replace(/[.。\s]+$/, "");

// ───────── 한국어 조사·문장 끝 처리 ─────────
function batchim(word) {
  const w = (word || "").trim().replace(/[』」》)\]"'’”]+$/, "");
  const c = w.slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return false;
}
const J = {
  을: (w) => (batchim(w) ? "을" : "를"),
  이: (w) => (batchim(w) ? "이" : "가"),
  은: (w) => (batchim(w) ? "은" : "는"),
  과: (w) => (batchim(w) ? "과" : "와"),
  으로: (w) => (batchim(w) && !/ㄹ$|[을릴랄를술]$/.test(w) ? "으로" : "로"),
  이었: (w) => (batchim(w) ? "이었습니다" : "였습니다"),
  입: () => "입니다",
};

const SINO = /(작성|조사|분석|실험|발표|참여|진행|탐구|정리|제작|기획|운영|봉사|비교|측정|관찰|설계|해결|제안|개선|활동|공부|연구|토론|수행|배양|기록|참가|담당|발견|확인|계산|검토|구상|구현|개발|체험|견학|학습|노력|연습|도전|시도|협력|소통|설득|조율|결정|제출|준비|완성|마무리|성공|향상|합의|화해|질문|보고|설명|사과|대화|실천|극복|공유|변경|조정)$/;
const isSentence = (s) => /[다요]$/.test(s);

// 명사형 어미 "-(으)ㅁ"을 과거 서술로: 기다림→기다렸습니다, 맞춤→맞췄습니다, 받음→받았습니다, 있음→있었습니다
const CONTRACT = { 20: 6, 13: 14, 8: 9, 0: 0, 4: 4, 1: 1, 5: 5, 18: 4, 11: 10 };
function nomToPast(s) {
  const code = (ch) => ch.charCodeAt(0) - 0xac00;
  const last = s.slice(-1), c = code(last);
  if (c < 0 || c > 11171) return null;
  if (last === "음" && s.length >= 2) {
    const p = code(s.slice(-2, -1));
    if (p < 0 || p > 11171 || p % 28 === 0) return null;
    const vow = Math.floor((p % 588) / 28);
    return s.slice(0, -1) + (vow === 0 || vow === 8 ? "았" : "었") + "습니다.";
  }
  if (c % 28 !== 16) return null; // 받침 ㅁ
  const cho = Math.floor(c / 588), vow = Math.floor((c % 588) / 28);
  if (!(vow in CONTRACT)) return null;
  return s.slice(0, -1) + String.fromCharCode(0xac00 + cho * 588 + CONTRACT[vow] * 28 + 20) + "습니다.";
}

// 행동을 과거 서술로: "보고서를 작성" → "보고서를 작성했습니다."
function past(s) {
  s = clean(s);
  if (!s) return "";
  if (isSentence(s)) return s + ".";
  if (/(했음|하였음)$/.test(s)) return s.replace(/음$/, "습니다.");
  if (/함$/.test(s)) return s.replace(/함$/, "했습니다.");
  if (/됨$/.test(s)) return s.replace(/됨$/, "되었습니다.");
  if (SINO.test(s)) return s + "했습니다.";
  const n = nomToPast(s);
  if (n) return n;
  if (/고$/.test(s)) return s + " 있었습니다.";
  return s + J.이었(s) + ".";
}
// 진행 중인 노력: "핵심 문장을 연습" → "연습하고 있습니다."
function progressive(s) {
  s = clean(s);
  if (!s) return "";
  if (isSentence(s)) return s + ".";
  if (SINO.test(s)) return s + "하고 있습니다.";
  if (/고$/.test(s)) return s + " 있습니다.";
  if (/함$/.test(s)) return s.replace(/함$/, "하고 있습니다.");
  return s + J.입(s) + ".";
}
// 일반 서술: 문장이 아니면 "~입니다."
function present(s) {
  s = clean(s);
  if (!s) return "";
  if (isSentence(s)) return s + ".";
  if (/있음$/.test(s)) return s.replace(/음$/, "습니다.");
  if (/(했|았|었)음$/.test(s)) return s.replace(/음$/, "습니다.");
  if (/[던은한된운]$/.test(s)) return s + " 일이 있었습니다.";
  return s + "입니다.";
}
function learned(s) {
  s = clean(s);
  if (!s) return "";
  if (isSentence(s)) return s + ".";
  return `${s}${J.을(s)} 배웠습니다.`;
}

const ph = (label) => `[✎ ${label}]`;
const v = (s, label) => (clean(s) ? clean(s) : ph(label));

// ───────── 문항 분리 ─────────
const MARK = /^\s*(?:Q\s*\d+[.):]?|문항\s*\d+[.):]?|\d+\s*[.)번]|[①-⑳]|[-•·▪]|\(\d+\))\s*/i;

export function parseQuestions(raw) {
  const lines = (raw || "").split(/\n/).map((l) => l.replace(/\s+$/, ""));
  const marked = lines.some((l) => MARK.test(l) && l.replace(MARK, "").trim());
  const out = [];
  if (marked) {
    for (const l of lines) {
      if (!l.trim()) continue;
      if (MARK.test(l)) out.push(l.replace(MARK, "").trim());
      else if (out.length) out[out.length - 1] += "\n" + l.trim();
      else out.push(l.trim());
    }
  } else if (/\n\s*\n/.test(raw)) {
    raw.split(/\n\s*\n/).forEach((b) => b.trim() && out.push(b.trim()));
  } else {
    lines.forEach((l) => l.trim() && out.push(l.trim()));
  }
  return out.filter(Boolean);
}

// ───────── 유형 판별 ─────────
const PRIORITY = ["last", "motive", "ethics", "community", "strength", "book", "career", "issue", "activity", "academic"];

export function detectType(q) {
  const t = strip(q);
  let best = "general", bestScore = 0;
  for (const key of PRIORITY) {
    const score = TYPES[key].hints.filter((h) => t.includes(strip(h))).length;
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return best;
}

// ───────── 재료 선택 ─────────
function bigrams(s) {
  const t = strip(s).replace(/[^\p{L}\p{N}]/gu, "");
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function overlap(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let n = 0;
  for (const g of A) if (B.has(g)) n++;
  return n;
}
const filledActs = (p) => (p.acts || []).filter((a) => clean(a.name) || clean(a.did));

function pickAct(q, p, avoid) {
  const acts = filledActs(p);
  if (!acts.length) return null;
  const ranked = acts
    .map((a, i) => ({ a, i, s: overlap(q, `${a.name} ${a.did} ${a.learned}`) - (a === avoid ? 100 : 0) }))
    .sort((x, y) => y.s - x.s || x.i - y.i);
  return ranked[0].a;
}

const isHealth = (dept) => /(임상병리|간호|방사선|물리치료|작업치료|치위생|응급구조|보건|의예|의학|약학|바이오|생명|의료)/.test(dept || "");

function deptLink(dept) {
  return isHealth(dept)
    ? "보건의료 현장에서는 작은 차이가 환자의 진단과 치료로 이어지기 때문에, 이 경험이 입학 후 전공 공부와 실습의 단단한 바탕이 될 것이라고 생각합니다."
    : `이 경험은 ${dept ? `${dept}에서` : "전공에서"} 배우게 될 내용과 직접 연결되어, 입학 후 공부의 바탕이 될 것이라고 생각합니다.`;
}

function actSentences(a) {
  if (!a) return [`당시 저는 ${ph("내가 한 일(역할·방법)")}.`, `이 과정에서 ${ph("배운 점")}.`];
  return [
    clean(a.did) ? `당시 저는 ${past(a.did)}` : `당시 저는 ${ph("내가 한 일")}.`,
    clean(a.learned) ? `이 과정에서 ${learned(a.learned)}` : `이 과정에서 ${ph("배운 점")}.`,
  ];
}

// ───────── 유형별 답변 템플릿 ─────────
const BUILD = {
  motive(q, p) {
    const dept = v(p.dept, "지원 학과");
    const a = pickAct(q, p);
    const m = clean(p.motive);
    const reason = !m ? `${ph("지원 계기 한 문장")} 때문입니다.` : isSentence(m) ? `다음과 같습니다. ${m}.` : `${m} 때문입니다.`;
    return [
      `제가 ${dept}에 지원한 이유는 ${reason}`,
      a ? `이 관심은 ${clean(a.name)}${J.을(clean(a.name))} 하면서 더 구체적인 목표가 되었습니다.` : "",
      ...(a ? actSentences(a) : []),
      `${dept}에서 전문 지식과 실습 역량을 체계적으로 쌓아 ${goal(p)}`,
    ];
  },
  career(q, p) {
    const dept = v(p.dept, "지원 학과");
    const subj = clean(p.subject);
    const a = pickAct(q, p);
    return [
      `입학 후에는 ${subj ? `고등학교 때 흥미를 느낀 ${subj}${J.을(subj)} 바탕으로` : ""} ${dept}의 전공 기초를 먼저 탄탄히 다지겠습니다.`.replace(/\s+/g, " "),
      isHealth(p.dept)
        ? "고학년에는 실험·실습과 임상실습에서 정확한 검사 습관을 몸에 익히고, 관련 국가시험과 자격 준비도 계획적으로 하겠습니다."
        : "고학년에는 전공 심화 과목과 프로젝트로 실무 역량을 키우고, 관련 자격과 현장 경험도 계획적으로 준비하겠습니다.",
      `졸업 후에는 ${goal(p)}`,
      a ? `${clean(a.name)}에서 ${clean(a.learned) && clean(a.learned).length <= 25 ? `배운 ‘${clean(a.learned)}’${J.을(clean(a.learned))} 늘 기억하며` : "배운 점을 늘 기억하며"} 성장하겠습니다.` : "",
    ];
  },
  activity(q, p) {
    const a = pickAct(q, p);
    return [
      `제가 가장 의미 있게 생각하는 활동은 ${a ? clean(a.name) : ph("활동 이름")}입니다.`,
      ...actSentences(a),
      deptLink(p.dept),
    ];
  },
  strength(q, p) {
    const t = strip(q);
    const wantS = /장점|강점|성격|소개/.test(t) || !/단점|약점/.test(t);
    const wantW = /단점|약점|성격/.test(t) || !/장점|강점|소개/.test(t);
    const s = v(p.strength, "나의 장점");
    const w = v(p.weakness, "나의 단점");
    const out = [];
    if (wantS) {
      out.push(`저의 장점은 ${s}입니다.`);
      out.push(clean(p.strengthProof) ? present(p.strengthProof) : `${ph("장점이 드러난 실제 경험")}.`);
    }
    if (wantW) {
      out.push(`${wantS ? "반면 " : ""}저의 단점은 ${w}입니다.`);
      out.push(`이를 보완하기 위해 ${clean(p.fix) ? progressive(p.fix) : `${ph("지금 하고 있는 보완 노력")}.`}`);
    }
    out.push(wantS && wantW ? "장점은 더 키우고 단점은 꾸준히 고쳐 나가는 사람이 되겠습니다." : "");
    return out;
  },
  community(q, p) {
    return [
      clean(p.teamSit) ? present(p.teamSit) : `${ph("갈등·협력 상황")}.`,
      `그때 저는 ${clean(p.teamAct) ? past(p.teamAct) : `${ph("내가 먼저 한 행동")}.`}`,
      `그 결과 ${clean(p.teamResult) ? present(p.teamResult) : `${ph("결과")}.`}`,
      "이 경험을 통해 의견이 다를수록 상대의 입장을 먼저 듣고, 공동의 목표를 다시 확인하는 것이 중요하다는 것을 배웠습니다.",
      isHealth(p.dept) ? "의료 현장 역시 여러 직종이 협력해야 하는 곳이기에, 이 태도를 계속 지켜 나가겠습니다." : "대학에서의 팀 활동에서도 이 태도를 지켜 나가겠습니다.",
    ];
  },
  ethics(q, p) {
    const t = strip(q);
    let mid;
    if (/실수|오류|잘못/.test(t)) mid = "실수를 발견했다면 결과를 내보내기 전에 바로 멈추고, 담당 선배나 책임자에게 사실대로 알린 뒤 정해진 절차에 따라 재확인하겠습니다.";
    else if (/개인정보|비밀|정보/.test(t)) mid = "개인정보는 업무에 꼭 필요한 범위에서만 다루고, 어떤 이유로도 외부에 공유하지 않는 것을 원칙으로 하겠습니다.";
    else if (/동료|선배|친구|상사/.test(t)) mid = "상대의 행동이 원칙에 어긋난다면 먼저 직접 정중하게 이야기하고, 그래도 바뀌지 않으면 책임자에게 보고하겠습니다.";
    else mid = "혼자 판단하기 어려운 문제라면 규정과 지침을 먼저 확인하고, 책임자와 상의해 결정하겠습니다.";
    return [
      "저는 이 상황에서 정직과 안전을 가장 우선에 두고 판단하겠습니다.",
      mid,
      isHealth(p.dept)
        ? "검사 결과나 처치 하나가 환자의 진단과 치료 방향을 바꿀 수 있기 때문에, 조금 늦어지더라도 정확하고 정직하게 처리하는 것이 환자를 위한 길이라고 생각합니다."
        : "작은 원칙을 지키는 것이 결국 신뢰를 만든다고 생각하기 때문입니다.",
      "그리고 같은 일이 반복되지 않도록 원인을 기록하고 함께 공유하겠습니다.",
    ];
  },
  academic(q, p) {
    const t = strip(q);
    if (/설명|무엇|원리|차이|개념|정의/.test(t)) {
      return [
        `질문하신 내용의 핵심은 ${ph("개념을 한 문장으로 정의")}입니다.`,
        `예를 들어 ${ph("교과서·실험에서 본 예시")}.`,
        `이 개념은 ${v(p.dept, "지원 학과")}에서 ${ph("활용되는 분야")}와 연결된다고 알고 있으며, 입학 후 더 깊이 공부하고 싶습니다.`,
      ];
    }
    const subj = v(p.subject, "관심 과목");
    const a = pickAct(q, p);
    return [
      `제가 가장 흥미를 느낀 과목은 ${subj}입니다.`,
      a ? `특히 ${clean(a.name)}${J.을(clean(a.name))} 하면서 수업에서 배운 내용을 직접 확인해 볼 수 있었습니다.` : `${ph("과목과 관련해 스스로 더 공부한 경험")}.`,
      ...(a ? actSentences(a).slice(1) : []),
      `이렇게 쌓은 기초가 ${v(p.dept, "지원 학과")}의 전공 공부로 자연스럽게 이어질 것이라고 생각합니다.`,
    ];
  },
  book(q, p) {
    const b = v(p.book, "책 제목(저자)");
    return [
      `제가 인상 깊게 읽은 책은 ${b}입니다.`,
      `이 책이 기억에 남는 이유는 ${bookReason(p.bookWhy)}`,
      `읽고 난 뒤 ${ph("바뀐 생각이나 행동 한 가지")}.`,
      `이 경험은 ${v(p.dept, "지원 학과")}에서 공부하고 싶은 이유를 더 분명하게 해 주었습니다.`,
    ];
  },
  issue(q, p) {
    return [
      `최근 저는 ${ph("관심 있게 본 이슈(언제·어디서 봤는지)")}에 관심을 가지고 있습니다.`,
      `이 문제에 대해 저는 ${ph("나의 입장 한 문장")}고 생각합니다.`,
      `그 이유는 ${ph("근거 1~2가지")}이기 때문입니다.`,
      `${v(p.dept, "지원 학과")} 전공자로서 ${ph("이 문제 해결에 기여할 수 있는 일")}을 고민해 보고 싶습니다.`,
    ];
  },
  last(q, p) {
    const a = filledActs(p)[0];
    return [
      `오늘 면접을 준비하며 ${v(p.dept, "지원 학과")}에 대한 제 마음을 다시 확인할 수 있었습니다.`,
      `${a ? `${clean(a.name)}에서 시작된 관심을` : "제가 키워 온 관심을"} 이곳에서 전문성으로 키워 ${goal(p)}`,
      "기회를 주신다면 끝까지 성실하게 배우는 학생이 되겠습니다. 감사합니다.",
    ];
  },
  general(q, p) {
    const a = pickAct(q, p);
    return [
      `${ph("질문에 대한 결론 한 문장")}.`,
      a ? `그렇게 생각하는 이유는 ${clean(a.name)}의 경험 때문입니다.` : `그렇게 생각하는 이유는 ${ph("근거가 되는 경험")} 때문입니다.`,
      ...(a ? actSentences(a) : []),
      deptLink(p.dept),
    ];
  },
};

function bookReason(w) {
  const t = clean(w);
  if (!t) return `${ph("인상 깊었던 이유")}입니다.`;
  if (isSentence(t)) return t + ".";
  if (/기$/.test(t)) return t + " 때문입니다.";
  return t + "입니다.";
}

function goal(p) {
  const c = clean(p.career);
  if (!c) return `${ph("졸업 후 되고 싶은 모습")}이 되는 것이 목표입니다.`;
  if (isSentence(c)) return c + ".";
  return `${c}${J.이(c)} 되는 것이 목표입니다.`;
}

// ───────── 키워드·꼬리질문·점검 ─────────
function keywords(type, q, p) {
  const a = pickAct(q, p);
  const k = {
    motive: [p.motive && clean(p.motive).slice(0, 18) + (clean(p.motive).length > 18 ? "…" : ""), a?.name, p.career],
    career: [p.subject, "전공 기초 → 실습", p.career],
    activity: [a?.name, a?.did && "내 역할", a?.learned && "배운 점 → 전공 연결"],
    strength: [p.strength, p.weakness && `단점: ${clean(p.weakness)}`, p.fix && "보완 노력"],
    community: ["상황", "내가 먼저 한 행동", "결과·배운 점"],
    ethics: ["정직·안전 우선", "즉시 보고·재확인", "재발 방지"],
    academic: ["정의 한 문장", "예시", "전공 연결"],
    book: [p.book, "인상 깊은 이유", "바뀐 생각"],
    issue: ["이슈 요약", "나의 입장", "근거·전공 연결"],
    last: ["감사", "핵심 포부 1가지"],
    general: ["결론", "근거 경험", "전공 연결"],
  }[type];
  return (k || []).map((x) => clean(x)).filter(Boolean).map((x) => (x.length > 22 ? x.slice(0, 21) + "…" : x)).slice(0, 3);
}

function followups(type, q, p) {
  const a = pickAct(q, p);
  const map = {
    act: a ? clean(a.name) : "그 활동", dept: clean(p.dept) || "이 학과", strength: clean(p.strength) || "그 장점",
    weakness: clean(p.weakness) || "그 단점", book: clean(p.book) || "그 책", career: clean(p.career) || "그 직업",
  };
  return (FOLLOWUPS[type] || []).map((f) => f.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? ""));
}

const BLIND = [
  [/[가-힣]{1,10}(고등학교|고교|외고|과학고|자사고|중학교)/, "출신 학교명이 들어 있습니다(블라인드 면접에서는 말하지 않습니다)."],
  [/(아버지|어머니|부모님|아빠|엄마|삼촌|이모|고모)[^.\n]{0,20}(의사|교수|변호사|판사|검사로|공무원|사장|대표|원장|간호사|근무|일하)/, "가족의 직업·직장을 드러내는 표현이 있습니다(블라인드 위반 소지)."],
  [/(제 이름은|저는 [가-힣]{2,3}입니다)/, "본인 이름을 밝히는 표현이 있습니다(수험번호로만 소개합니다)."],
];

export function check(answer) {
  const warns = [];
  const n = (answer.match(/\[✎/g) || []).length;
  if (n) warns.push(`채워야 할 칸 ${n}곳([✎ …])이 남아 있습니다. ‘나의 재료’를 채우거나 직접 고쳐 쓰세요.`);
  for (const [re, msg] of BLIND) if (re.test(answer)) warns.push(msg);
  return warns;
}

export function speakSeconds(text) {
  const chars = (text || "").replace(/\s+/g, "").length;
  return Math.round(chars / 5); // 또박또박 말하기 기준 초당 약 5음절
}

export function buildAnswer(question, type, profile) {
  const parts = (BUILD[type] || BUILD.general)(question, profile).filter(Boolean);
  const answer = parts.join(" ").replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").trim();
  return {
    answer,
    keywords: keywords(type, question, profile),
    followups: followups(type, question, profile),
    tips: TIPS[type] || TIPS.general,
  };
}

// 면접 코치(coach.html)에서 재사용하는 문장 도우미
export { clean, J, isSentence, past, present, progressive, learned };
