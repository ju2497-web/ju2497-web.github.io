// AI 면접관 루프: 평가 → 재작성 → 재평가 → (85점 미만이면) 재작성. 서버(worker.js)와 브라우저가 같은 코드를 씁니다.
// call(system, user, schema, effort) 는 JSON 객체를 돌려주는 함수(호출 측이 API를 감쌉니다).

import { QTYPES, COMPETENCIES, CLICHES, DEPT_PROFILES } from "./framework.js";

export const PASS_SCORE = 85;
export const MAX_ROUNDS = 2;
const DIMS = ["질문 적합성", "구체성", "차별성", "전공적합성", "전달력"];

export const EVAL_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["scores", "total", "biggest_problem", "critique"],
  properties: {
    scores: {
      type: "object", additionalProperties: false, required: ["fit", "specificity", "distinct", "major", "delivery"],
      properties: { fit: { type: "integer" }, specificity: { type: "integer" }, distinct: { type: "integer" }, major: { type: "integer" }, delivery: { type: "integer" } },
    },
    total: { type: "integer" },
    biggest_problem: { type: "string", description: "면접관 입장에서 가장 큰 문제 한 문장(학생에게 그대로 보여 줌)" },
    critique: { type: "array", items: { type: "string" }, description: "재작성할 때 고칠 점 2~4개" },
  },
};
export const REWRITE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["answer", "changes"],
  properties: {
    answer: { type: "string", description: "45~55초 분량 최종 답변(말하기용, 존댓말)" },
    changes: { type: "array", items: { type: "string" }, description: "무엇을 왜 바꿨는지 1~3개, 학생이 이해할 말로" },
  },
};

const roleOf = (dept) => (DEPT_PROFILES.find((p) => p.re.test(dept || "")) || {}).role || `${dept || "지원 분야"} 전문가`;

export const EVAL_SYSTEM = `당신은 대학 입학 면접관입니다. 수험생의 면접 답변을 실제 면접장에서 듣는다고 생각하고 냉정하게 채점합니다. 후하게 주지 않습니다.
채점 항목(각 0~100): fit 질문 적합성(질문이 요구한 것에 답했는가, 첫 문장에 결론), specificity 구체성(‘내가’ 한 행동·횟수·방법), distinct 차별성(다른 지원자와 구별되는 본인 경험과 배운 점, 진부한 표현이 없는가), major 전공적합성(지원 학과·직업과의 연결), delivery 전달력(45~55초 분량, 말하기 좋은 짧은 문장, 군말).
total은 다섯 항목의 평균에 가깝게 매기되, 출신 학교명·가족 직업·본인 이름 등 블라인드 위반이 있으면 크게 깎습니다.
진부한 표현 예: ${CLICHES.map((c) => c[1]).join(" / ")}.
biggest_problem은 학생에게 바로 보여 줄 한 문장입니다. 예) "첫 20초가 너무 일반적입니다. 면접관이 기억할 만한 본인 경험이 뒤에 묻혀 있습니다."`;

export const REWRITE_SYSTEM = `당신은 대학 면접을 지도하는 교수입니다. 학생이 말한 답변을 면접관이 더 잘 기억하도록 다시 구성합니다.
원칙: 학생이 말한 경험과 사실만 씁니다. 없는 활동·수치·일화를 만들지 않습니다. 꼭 필요한데 없으면 [✎ 채울 내용]으로 남깁니다. 출신 학교명·가족 직업·이름은 넣지 않습니다.
구성: 첫 문장 결론 → 이유 → 본인 경험(구체적 행동) → 배운 점 → 지원 학과·직업 연결. 진부한 표현은 그 학생의 경험 문장으로 바꿉니다. 45~55초(공백 제외 약 225~275자), 짧은 문장, 존댓말. 마크다운 금지.`;

function context({ question, dept, type }) {
  const T = QTYPES[type] || QTYPES.general;
  return `면접 질문: ${question}
지원 학과: ${dept || "(미입력)"} / 지원 직업: ${roleOf(dept)}
문항 유형: ${T.label} / 평가역량: ${T.comps.map((c) => COMPETENCIES[c]).join(", ")}
질문 의도: ${T.intent}
면접관이 보는 것: ${T.looks.join(" / ")}`;
}

export function toDims(scores) {
  return { "질문 적합성": scores.fit, "구체성": scores.specificity, "차별성": scores.distinct, "전공적합성": scores.major, "전달력": scores.delivery };
}

export async function voiceLoop(call, input) {
  const ctx = context(input);
  const evalOf = (text, label) => call(EVAL_SYSTEM, `${ctx}\n\n[${label}]\n${text}`, EVAL_SCHEMA, "low");
  const before = await evalOf(input.transcript, "학생이 말한 답변(음성 인식 결과라 문장부호가 없을 수 있음)");
  let critique = before.critique, prev = "", answer = "", changes = [], after = before, rounds = 0;
  while (rounds < MAX_ROUNDS) {
    const rw = await call(REWRITE_SYSTEM, `${ctx}

[학생이 말한 원래 답변]
${input.transcript}
${prev ? `\n[직전 재작성본]\n${prev}\n` : ""}
[면접관 비판 — 반드시 고칠 것]
${critique.map((c) => `- ${c}`).join("\n")}`, REWRITE_SCHEMA, "medium");
    answer = rw.answer; changes = rw.changes; rounds++;
    after = await evalOf(answer, "재작성한 답변");
    if (after.total >= PASS_SCORE) break;
    prev = answer; critique = after.critique;
  }
  return { before, answer, changes, after, rounds };
}

export function validateVoice(p) {
  if (!p || typeof p.question !== "string" || !p.question.trim()) return "면접 질문이 비어 있습니다.";
  if (p.question.length > 1000) return "면접 질문이 너무 깁니다.";
  if (typeof p.transcript !== "string" || p.transcript.trim().length < 10) return "답변이 너무 짧습니다.";
  if (p.transcript.length > 3000) return "답변이 너무 깁니다(3,000자 이하).";
  if (p.dept && (typeof p.dept !== "string" || p.dept.length > 50)) return "학과 이름이 올바르지 않습니다.";
  return null;
}
export { DIMS };
