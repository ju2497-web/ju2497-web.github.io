// AI 심층형 호출(학생 화면·교수 작업실 공통): 서버가 설정되어 있으면 서버로,
// 없으면 이 브라우저에 저장된 교수용 API 키로 직접 호출합니다.
import { CONFIG } from "./config.js";
import { buildRequest, MODEL } from "./prompt.js";
import { voiceLoop } from "./voice-loop.js";
import { evaluate, speakingScript } from "./engine.js";

const devKey = () => { try { return JSON.parse(localStorage.getItem("adm.ai.v1") || "{}").apiKey || ""; } catch { return ""; } };
export const canDeep = () => !!CONFIG.aiEndpoint || !!devKey();
export const needsCode = () => !!CONFIG.aiEndpoint;

export async function callDeep(payload, accessCode = "") {
  if (CONFIG.aiEndpoint) {
    const r = await fetch(CONFIG.aiEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, accessCode }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `서버 오류(${r.status})`);
    return data.result;
  }
  const { loadSdk } = await import("../ai.js");
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey: devKey(), dangerouslyAllowBrowser: true });
  const { system, user, schema, model } = buildRequest(payload);
  const msg = await client.beta.messages.create({
    model, max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  if (msg.stop_reason === "refusal") throw new Error("AI가 이 요청을 처리하지 않았습니다.");
  if (msg.stop_reason === "max_tokens") throw new Error("응답이 길어 중단되었습니다. 다시 시도해 주세요.");
  return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// AI 결과를 화면 공통 형식으로 변환(점수는 같은 채점기로 다시 매겨 기본형과 비교 가능하게)
export function fromAI(ai, basic, p) {
  const ev = evaluate(ai.final_answer, p.question, p.department, p.targetSec, basic.type);
  return {
    ...basic,
    mode: "deep",
    intent: ai.intent || basic.intent,
    competencies: ai.competencies?.length ? ai.competencies : basic.competencies,
    answer: ai.final_answer,
    score: ev.score, grade: ev.grade, issues: ev.issues, seconds: ev.seconds,
    fixes: [
      `AI 1차 답변 예상 점수 ${ai.score}점 → 감점 요인 수정 후 최종 답변으로 교체했습니다.`,
      ...(ai.deductions || []).map((d) => `수정함: ${d.issue} → ${d.fix}`),
      ...(ai.plain_pitfalls || []).map((x) => `피한 함정: ${x}`),
    ],
    extracted: ai.extracted_experience || [],
    followups: (ai.followups || []).map((f) => ({ q: f.question, answer: f.answer, dir: "" })),
    script: ai.script || speakingScript(ai.final_answer, []),
    coaching: ai.coaching?.length ? ai.coaching : basic.coaching,
  };
}

// 말로 하는 면접 코치: AI 면접관 루프(서버가 있으면 서버에서, 없으면 교수용 키로 브라우저에서)
export async function callVoice(payload, accessCode = "") {
  if (CONFIG.aiEndpoint) {
    const r = await fetch(CONFIG.aiEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "voice", payload, accessCode }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `서버 오류(${r.status})`);
    return data.result;
  }
  const { loadSdk } = await import("../ai.js");
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey: devKey(), dangerouslyAllowBrowser: true });
  const call = async (system, user, schema, effort) => {
    const msg = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema } },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (msg.stop_reason === "refusal") throw new Error("AI가 이 요청을 처리하지 않았습니다.");
    if (msg.stop_reason === "max_tokens") throw new Error("응답이 길어 중단되었습니다.");
    return JSON.parse(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  };
  return voiceLoop(call, payload);
}

// 사진 속 면접 질문 읽기(AI 서버가 있을 때만)
export const canOcr = () => !!CONFIG.aiEndpoint;
export async function callOcr(image, mediaType, accessCode = "") {
  const r = await fetch(CONFIG.aiEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "ocr", payload: { image, mediaType }, accessCode }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `서버 오류(${r.status})`);
  return data.result.questions || [];
}
