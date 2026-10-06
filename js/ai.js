// 선택 기능: Claude API로 답변 초안을 다듬습니다.
// API 키는 이 브라우저(localStorage)에만 저장되며 Anthropic API로만 전송됩니다.

import { fill } from "./engine.js";

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm";
export const DEFAULT_MODEL = "claude-opus-5-5";

const CHANNEL_GUIDE = {
  email: "이메일 답변. 첫 줄에 '제목: ...'을 쓰고 빈 줄 뒤에 인사말·본문·맺음말·서명(담당 부서와 연락처)을 갖춘 공식 이메일로 작성.",
  board: "홈페이지 입학 Q&A 게시판 답변. '안녕하세요, (대학명) 입학처입니다.'로 시작하고 3~6문단 이내로 작성.",
  kakao: "카카오톡 채널/문자 답변. 핵심만 5~8문장 이내로 짧게, 줄바꿈으로 읽기 쉽게 작성.",
  phone: "전화 상담 스크립트. '상담원:' 대사 형식으로, 말하듯 짧은 문장으로 작성.",
};

let sdkPromise;
function loadSdk() {
  sdkPromise ??= import(SDK_URL).then((m) => m.default ?? m.Anthropic);
  return sdkPromise;
}

function buildSystem(settings, kb) {
  const facts = Object.entries(settings)
    .map(([k, v]) => `- ${k}: ${v?.toString().trim() || "(미정 — 답변에 쓰지 말고 '모집요강 확인'으로 안내)"}`)
    .join("\n");
  const kbText = kb
    .map((e) => `### [${e.track}] ${e.title}\n예시 질문: ${e.question}\n승인된 답변:\n${fill(e.answer, settings)}`)
    .join("\n\n");
  return `당신은 ${settings.대학명 || "대학"} 입학처의 입시 상담 답변 작성자입니다. 수험생·학부모가 보낸 수시·정시 입시 문의에 대해, 담당자가 검토 후 그대로 발송할 수 있는 한국어 답변을 작성합니다.

원칙
- 아래 '대학 기본 정보'와 '승인된 답변 지식베이스'에 있는 내용만 근거로 답합니다. 날짜·인원·점수·비율·합격 가능성처럼 근거에 없는 사실은 만들어 내지 말고, "모집요강에서 확인" 또는 "담당자 확인 후 회신"으로 안내합니다.
- 개별 성적으로 합격 가능성을 판정하지 않습니다.
- "[설정 필요: ...]"나 "(미정 ...)" 표시가 있는 값은 답변에 쓰지 않습니다.
- 문의에 질문이 여러 개면 빠짐없이 각각 답합니다.
- 질문자가 학부모로 보이면 '학부모님', 학생이면 '수험생님'으로 부릅니다.
- 존댓말을 사용하고, 마크다운 기호(#, **, 표)는 쓰지 않습니다. 결과물은 발송할 답변 본문만 출력합니다.
- 마지막에 최종 기준은 해당 학년도 모집요강을 따른다는 안내를 한 줄 넣습니다.

대학 기본 정보
${facts}

승인된 답변 지식베이스
${kbText}`;
}

export async function aiAnswer({ apiKey, model, inquiry, settings, kb, channel, tone, asker, draft, onText }) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const user = `문의 내용:
"""
${inquiry}
"""

작성 형식: ${CHANNEL_GUIDE[channel]}
어조: ${tone === "friendly" ? "따뜻하고 친근하지만 예의 바른 어조" : "정중하고 공식적인 어조"}
추정 질문자: ${asker}
${draft ? `\n참고용 규칙 기반 초안(사실 관계는 이 초안과 지식베이스를 따르되 문장은 자연스럽게 다듬을 것):\n"""\n${draft}\n"""` : ""}`;

  const stream = client.beta.messages.stream({
    model: model || DEFAULT_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [{ type: "text", text: buildSystem(settings, kb), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  stream.on("text", (delta) => onText?.(delta));
  const msg = await stream.finalMessage();

  if (msg.stop_reason === "refusal") {
    throw new Error("모델이 이 요청에 대한 답변을 거절했습니다. 규칙 기반 답변을 사용해 주세요.");
  }
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}
