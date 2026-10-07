// AI 면접 코치 — AI 심층형 서버(Cloudflare Workers).
// API 키는 이 서버의 비밀 변수(ANTHROPIC_API_KEY)에만 있고, 학생 브라우저에는 노출되지 않습니다.
// 배포 방법은 server/README.md 참고.

import Anthropic from "@anthropic-ai/sdk";
import { buildRequest, validatePayload } from "../js/coach/prompt.js";

function cors(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(env, origin);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") return json({ error: "POST만 지원합니다." }, 405, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: "잘못된 요청 형식입니다." }, 400, headers); }

    // 베타 기간: 교수님이 학생에게 나눠 준 접근 코드로만 사용(쉼표로 여러 개)
    const codes = (env.ACCESS_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (codes.length && !codes.includes((body.accessCode || "").trim())) {
      return json({ error: "접근 코드가 올바르지 않습니다." }, 401, headers);
    }
    // 이해충돌 방지: 차단 대학은 서버에서도 거절
    const blocked = (env.BLOCKED_UNIVERSITIES || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (blocked.includes((body.payload?.university || "").trim())) {
      return json({ error: "이 대학 문항은 이 서비스에서 제공하지 않습니다." }, 403, headers);
    }

    const problem = validatePayload(body.payload);
    if (problem) return json({ error: problem }, 400, headers);

    const { system, user, schema, model } = buildRequest(body.payload);
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const msg = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema } },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      });
      if (msg.stop_reason === "refusal") return json({ error: "AI가 이 요청을 처리하지 않았습니다. 기본형 결과를 이용해 주세요." }, 422, headers);
      if (msg.stop_reason === "max_tokens") return json({ error: "응답이 너무 길어 중단되었습니다. 다시 시도해 주세요." }, 502, headers);
      const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      return json({ result: JSON.parse(text) }, 200, headers);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." }, 429, headers);
      if (err instanceof Anthropic.APIError) return json({ error: `AI 서버 오류(${err.status})` }, 502, headers);
      return json({ error: "AI 응답을 처리하지 못했습니다." }, 500, headers);
    }
  },
};
