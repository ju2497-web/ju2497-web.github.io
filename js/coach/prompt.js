// AI 심층형 요청 생성기. 브라우저(교수 테스트용 직접 호출)와 서버(server/worker.js)가 같은 파일을 씁니다.
// 교수 평가 프레임(framework.js)을 프롬프트에 그대로 주입해, 범용 챗봇과 다른 결과를 만듭니다.

import { QTYPES, COMPETENCIES, CLICHES, DEPT_PROFILES } from "./framework.js";

export const MODEL = "claude-opus-5-5";

export const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "competencies", "extracted_experience", "plain_pitfalls", "draft_answer", "score", "deductions", "final_answer", "followups", "script", "coaching"],
  properties: {
    intent: { type: "string", description: "① 질문 의도(면접관이 이 문항으로 확인하려는 것) 2문장 이내" },
    competencies: { type: "array", items: { type: "string" }, description: "② 평가역량 이름 1~3개" },
    extracted_experience: { type: "array", items: { type: "string" }, description: "③ 학생 입력에서 추출한 핵심 경험 요소(상황·행동·결과·배운 점)" },
    plain_pitfalls: { type: "array", items: { type: "string" }, description: "④ 이 문항에서 지원자 대부분이 하는 평범한 답변의 함정 2~3개" },
    draft_answer: { type: "string", description: "⑤ 1차 답변" },
    score: { type: "integer", description: "⑥ 1차 답변의 예상 점수(0~100)" },
    deductions: {
      type: "array",
      description: "⑥⑦ 1차 답변의 감점 요인과 수정 방법(최대 3개, 감점 큰 순)",
      items: {
        type: "object", additionalProperties: false, required: ["issue", "fix", "points"],
        properties: { issue: { type: "string" }, fix: { type: "string" }, points: { type: "integer" } },
      },
    },
    final_answer: { type: "string", description: "⑦ 감점 요인을 수정한 최종 답변" },
    followups: {
      type: "array",
      description: "⑧⑨ 예상 꼬리질문 3개와 학생 경험에 근거한 답변",
      items: {
        type: "object", additionalProperties: false, required: ["question", "answer"],
        properties: { question: { type: "string" }, answer: { type: "string" } },
      },
    },
    script: { type: "string", description: "⑩ 말하기용 최종 대본: 문장마다 줄바꿈, 쉬는 곳에 ' / ', 강조 단어는 【 】" },
    coaching: { type: "array", items: { type: "string" }, description: "말하기 코칭 3~5개(속도·강조·표정·시선 등)" },
  },
};

function roleOf(dept) {
  return (DEPT_PROFILES.find((p) => p.re.test(dept || "")) || {}).role || `${dept || "지원 분야"} 전문가`;
}

export const SYSTEM_PROMPT = `당신은 대학 입학 면접 평가 경력이 풍부한 교수입니다. 공개된 대학 면접 문항으로 수험생을 훈련시키는 교육 서비스에서, 수험생 본인의 경험만으로 개인화된 면접 답변을 만들고 면접관 관점에서 채점·수정합니다.

작업 순서(반드시 이 순서로 생각하고 결과 필드를 채웁니다)
① 질문 의도 분석 ② 평가역량 분석 ③ 학생 경험 추출 ④ 평범한 답변의 함정 확인 ⑤ 목표 시간에 맞춘 1차 답변 ⑥ 교수 면접관 관점 예상 점수 ⑦ 감점 요인 수정 후 최종 답변 ⑧ 예상 꼬리질문 3개 ⑨ 꼬리질문 답변 ⑩ 말하기용 최종 대본

절대 원칙
- 학생이 입력한 경험만 사용합니다. 입력에 없는 활동·수치·수상·대화·일화를 만들어 내지 않습니다. 꼭 필요한데 입력이 없으면 그 자리를 [✎ 채울 내용]으로 남깁니다.
- 블라인드 면접 원칙: 출신 학교명, 가족의 직업·직장, 본인 이름을 넣지 않습니다. 학생 입력에 있으면 빼고 감점 요인으로 알려 줍니다.
- 1인칭, 존댓말(~습니다), 말하기 좋은 짧은 문장, 첫 문장에 결론(두괄식).
- 문항이 요구한 하위 질문(예: 해결 방법 + 상대 입장 이해 노력)을 빠짐없이 답합니다.
- 마크다운 기호를 쓰지 않습니다(대본의 ' / '와 【 】만 예외).

채점 기준(100점): 질문 요구 충족 20, 두괄식 10, 구체성(‘내가’ 한 행동·횟수·방법) 20, 성찰(배운 점) 15, 전공·직업 연결 15, 진정성(평범한 표현 없음) 10, 말하기 시간 10. 블라인드 위반은 건당 -15.
평범한 표현(감점 대상): ${CLICHES.map((c) => c[1]).join(" / ")}.
최종 답변은 감점 요인을 고친 뒤의 답변이며, 1차 점수보다 낮아지면 안 됩니다. 점수는 후하게 주지 말고 실제 면접관처럼 냉정하게 매깁니다.`;

export function buildRequest({ question, university, department, track, year, fields = {}, targetSec = 50, type, basicAnswer = "", draft = "", context = null }) {
  const T = QTYPES[type] || QTYPES.general;
  const chars = Math.round(targetSec * 5);
  const exp = context
    ? `이 문항에 배정된 경험(학생의 짧은 사실 메모): ${context.focusExperience || "(배정 없음)"}
그 밖의 경험:
${context.otherExperiences || "(없음)"}
학과 지원 이유 메모: ${context.motiveNote || "(없음)"}
본인이 생각하는 강점: ${context.strengths || "(없음)"}
걱정·강조 요청: ${context.concerns || "(없음)"}${context.record ? `\n학교생활기록부 발췌(정밀형):\n${context.record}` : ""}

재구성 지침: 경험 메모는 문장이 아닌 사실 메모입니다. 상황 → 갈등·문제 → 예상과 다른 사실의 발견 → 행동 변화 → 결과 → 배운 점 순서로 재구성하고, 메모에 없는 결과·배운 점은 지어내지 말고 [✎ …]로 남깁니다. 배정된 경험이 문항에 맞지 않으면 그 밖의 경험 중 더 맞는 것을 쓰고 extracted_experience 첫 줄에 어떤 경험을 썼는지 적습니다. 걱정 사항(예: 말이 길어짐)은 coaching에 반영합니다.`
    : T.fields.map((f) => `- ${f.label}: ${(fields[f.k] || "").trim() || "(입력 없음)"}`).join("\n");
  const user = `면접 문항: ${question}
대학/학과/전형/연도: ${[university, department, track, year].filter(Boolean).join(" / ") || "(미지정)"}
지원 직업: ${roleOf(department)}
목표 말하기 시간: ${targetSec}초 (공백 제외 약 ${chars - 25}~${chars + 25}자)

[교수 평가 프레임 — 이 문항 유형: ${T.label}]
평가역량: ${T.comps.map((c) => COMPETENCIES[c]).join(", ")}
질문 의도: ${T.intent}
면접관이 보는 것: ${T.looks.join(" / ")}
이 유형의 평범한 답변 예시(이렇게 쓰면 감점): ${T.plain || "(없음)"}

[학생이 입력한 경험]
${exp}
${draft.trim() ? `\n[학생이 직접 써 둔 답변 — 진단 대상]\n${draft.trim()}\n` : ""}
[참고: 규칙 기반 1차 초안 — 사실 관계는 학생 입력을 따를 것]
${basicAnswer || "(없음)"}`;
  return { system: SYSTEM_PROMPT, user, schema: RESULT_SCHEMA, model: MODEL };
}

// 입력 크기 검증(서버·브라우저 공통). 잘라 내지 않고 거절합니다.
export function validatePayload(p) {
  if (!p || typeof p.question !== "string" || !p.question.trim()) return "면접 문항이 비어 있습니다.";
  if (p.question.length > 1500) return "면접 문항이 너무 깁니다(1,500자 이하).";
  const f = p.fields || {};
  for (const [k, val] of Object.entries(f)) {
    if (typeof val !== "string") return `입력 형식 오류: ${k}`;
    if (val.length > 800) return "경험 입력 한 칸은 800자 이하로 적어 주세요.";
  }
  if ((p.draft || "").length > 3000) return "직접 쓴 답변은 3,000자 이하로 적어 주세요.";
  if (p.context) {
    const c = p.context;
    if ((c.record || "").length > 8000) return "학생부 발췌는 8,000자 이하로 붙여 넣어 주세요.";
    for (const k of ["focusExperience", "otherExperiences", "motiveNote", "strengths", "concerns"]) {
      if (typeof (c[k] ?? "") !== "string" || (c[k] || "").length > 4000) return `신청서 항목이 너무 깁니다: ${k}`;
    }
  }
  const t = Number(p.targetSec);
  if (!(t >= 30 && t <= 120)) return "목표 시간은 30~120초 사이여야 합니다.";
  return null;
}
