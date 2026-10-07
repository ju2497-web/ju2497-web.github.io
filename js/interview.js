import { TYPES, SAMPLE_QUESTIONS, EMPTY_PROFILE, EXAMPLE_PROFILE } from "./interview-data.js";
import { parseQuestions, detectType, buildAnswer, check, speakSeconds } from "./interview-engine.js";
import { loadSdk, DEFAULT_MODEL } from "./ai.js";

// ───────── 저장소 ─────────
const KEY = "iv.v1";
const AI_KEY = "adm.ai.v1"; // 입시 문의 앱과 같은 API 키 설정 공유
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const saved = load(KEY, {});
const state = {
  profile: { ...clone(EMPTY_PROFILE), ...(saved.profile || {}) },
  items: saved.items || [],       // {id, q, type, answer, keywords, followups, tips, edited, checks}
  source: saved.source || "",
  length: saved.length || 60,
  practice: 0,
};
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ profile: state.profile, items: state.items, source: state.source, length: state.length })); } catch { /* 저장 불가 */ }
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

// ───────── 탭 ─────────
function showTab(name) {
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((s) => s.classList.toggle("active", s.id === `tab-${name}`));
  if (name === "notes") renderNotes();
  if (name === "practice") renderPractice();
  if (name !== "practice") stopTimer();
}
$$(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) { e.preventDefault(); showTab(g.dataset.goto); }
});

// ───────── ② 나의 재료 ─────────
function renderProfile() {
  const p = state.profile;
  $("#acts").innerHTML = p.acts.map((a, i) => `<div class="act">
      <label>활동 ${i + 1} 이름<input data-act="${i}" data-f="name" value="${esc(a.name)}" placeholder="예) 생명과학 동아리 혈액형 판정 원리 탐구"></label>
      <label>내가 한 일(역할·방법)<input data-act="${i}" data-f="did" value="${esc(a.did)}" placeholder="예) 응집 반응 원리를 조사하고 판정 실험을 설계해 보고서를 작성"></label>
      <label>배운 점<input data-act="${i}" data-f="learned" value="${esc(a.learned)}" placeholder="예) 표준화된 절차가 중요하다는 것"></label>
    </div>`).join("");
  for (const el of $("#profileForm").elements) {
    if (el.name && el.name in p) el.value = p[el.name] ?? "";
  }
}
$("#profileForm").addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.act != null) state.profile.acts[+el.dataset.act][el.dataset.f] = el.value;
  else if (el.name) state.profile[el.name] = el.value;
  persist();
  $("#profileWarn").hidden = !profileEmpty();
});
const profileEmpty = () => {
  const p = state.profile;
  return !p.dept && !p.motive && !p.acts.some((a) => a.name || a.did);
};
$("#btnExample").addEventListener("click", () => {
  if (!profileEmpty() && !confirm("지금 적힌 재료를 예시로 바꿀까요?")) return;
  state.profile = clone(EXAMPLE_PROFILE);
  persist(); renderProfile();
  $("#profileWarn").hidden = true;
});
$("#btnRegen").addEventListener("click", () => {
  if (!state.items.length) { showTab("questions"); return; }
  const edited = state.items.filter((it) => it.edited).length;
  if (edited && !confirm(`직접 고친 답변 ${edited}개도 새 재료로 다시 만들까요?\n[취소]를 누르면 고친 답변은 그대로 둡니다.`)) {
    state.items.forEach((it) => !it.edited && regen(it));
  } else state.items.forEach(regen);
  persist(); showTab("notes");
});

// ───────── ① 면접 문항 ─────────
function makeItem(q) {
  const it = { id: uid(), q, type: detectType(q), edited: false, checks: null };
  regen(it);
  return it;
}
function regen(it) {
  Object.assign(it, buildAnswer(it.q, it.type, state.profile), { edited: false, ai: false });
}
function addQuestions(replace) {
  const qs = parseQuestions($("#qInput").value);
  if (!qs.length) { $("#qInput").focus(); return; }
  if (replace && state.items.length && !confirm(`기존 노트 ${state.items.length}문항을 지우고 새로 만들까요?`)) return;
  const items = qs.map(makeItem);
  state.items = replace ? items : [...state.items, ...items];
  state.source = $("#qSource").value.trim();
  state.length = +$("#qLength").value;
  persist();
  $("#qStat").textContent = `${qs.length}문항을 나눠 답변을 만들었습니다.`;
  showTab("notes");
}
$("#btnMake").addEventListener("click", () => addQuestions(true));
$("#btnAppend").addEventListener("click", () => addQuestions(false));
$("#btnSampleQ").addEventListener("click", () => { $("#qInput").value = SAMPLE_QUESTIONS; });
$("#qLength").addEventListener("change", () => { state.length = +$("#qLength").value; persist(); });

// ───────── ③ 답변 노트 ─────────
const typeOptions = (cur) => Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${t.label}</option>`).join("");

function metaHtml(it) {
  const sec = speakSeconds(it.answer);
  const target = state.length;
  const ratio = Math.min(sec / target, 1.4);
  const cls = sec < target * 0.6 ? "short" : sec > target * 1.15 ? "long" : "";
  const msg = cls === "short" ? "짧아요 · 구체적인 장면·숫자·배운 점을 한두 문장 더하세요" : cls === "long" ? "길어요 · 결론과 핵심 경험만 남기세요" : "적당해요";
  return `<span>말하기 약 ${sec}초 / 목표 ${target}초</span>
    <span class="meter ${cls}"><i style="width:${Math.round((ratio / 1.4) * 100)}%"></i></span><span>${msg}</span>
    ${it.ai ? "<span>· AI 다듬음</span>" : it.edited ? "<span>· 직접 수정함</span>" : ""}`;
}

function warnHtml(it) {
  const w = check(it.answer);
  return w.length ? `<div class="warn">${w.map(esc).join("<br>")}</div>` : "";
}

function renderNotes() {
  $("#noteCount").textContent = state.items.length || "";
  $("#notesEmpty").hidden = !!state.items.length;
  $("#noteSource").textContent = state.source;
  $("#notes").innerHTML = state.items.map((it, i) => `<article class="note" data-id="${it.id}">
    <header>
      <div><span class="qn">Q${i + 1}.</span><span class="qt">${esc(it.q)}</span></div>
      <div class="btns">
        <select class="type-select" data-act="type" aria-label="문항 유형">${typeOptions(it.type)}</select>
        <button class="ghost" data-act="regen">다시 만들기</button>
        <button class="ghost" data-act="ai">AI로 다듬기</button>
        <button class="ghost" data-act="practice">연습</button>
        <button class="ghost danger" data-act="del">삭제</button>
      </div>
    </header>
    <textarea rows="6" data-act="edit">${esc(it.answer)}</textarea>
    <div class="print-ans">${esc(it.answer)}</div>
    <div class="meta">${metaHtml(it)}</div>
    <div class="warnbox">${warnHtml(it)}</div>
    <div class="kwrow">${it.keywords.map((k) => `<span class="kw-chip">${esc(k)}</span>`).join("")}</div>
    <div class="cols">
      <div><h4>예상 꼬리질문</h4><ul>${it.followups.map((f) => `<li>${esc(f)}</li>`).join("") || "<li>—</li>"}</ul></div>
      <div><h4>평가 포인트</h4><ul>${it.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
    </div>
  </article>`).join("");
  $$(".note textarea").forEach(autoGrow);
}
function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.max(120, t.scrollHeight + 4) + "px"; }

const itemOf = (el) => state.items.find((x) => x.id === el.closest(".note").dataset.id);

$("#notes").addEventListener("input", (e) => {
  if (e.target.dataset.act !== "edit") return;
  const it = itemOf(e.target);
  it.answer = e.target.value; it.edited = true;
  autoGrow(e.target);
  const card = e.target.closest(".note");
  card.querySelector(".meta").innerHTML = metaHtml(it);
  card.querySelector(".warnbox").innerHTML = warnHtml(it);
  card.querySelector(".print-ans").textContent = it.answer;
  persist();
});
$("#notes").addEventListener("change", (e) => {
  if (e.target.dataset.act !== "type") return;
  const it = itemOf(e.target);
  it.type = e.target.value;
  if (!it.edited || confirm("유형에 맞게 답변을 다시 만들까요? (직접 고친 내용은 사라집니다)")) regen(it);
  persist(); renderNotes();
});
$("#notes").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const it = itemOf(btn);
  const act = btn.dataset.act;
  if (act === "regen") {
    if (it.edited && !confirm("직접 고친 답변을 새로 만든 초안으로 바꿀까요?")) return;
    regen(it); persist(); renderNotes();
  } else if (act === "del") {
    if (!confirm("이 문항을 삭제할까요?")) return;
    state.items = state.items.filter((x) => x !== it); persist(); renderNotes();
  } else if (act === "practice") {
    state.practice = state.items.indexOf(it); showTab("practice");
  } else if (act === "ai") {
    await polishWithAI([it], btn);
  }
});

// ───────── AI 다듬기 (선택) ─────────
function aiSettings() { return load(AI_KEY, { apiKey: "", model: "" }); }

function profileText(p) {
  const acts = p.acts.filter((a) => a.name || a.did)
    .map((a, i) => `  활동${i + 1}: ${a.name} / 내가 한 일: ${a.did} / 배운 점: ${a.learned}`).join("\n");
  return [
    `지원 학과: ${p.dept}`, `지원 계기: ${p.motive}`, `졸업 후 목표: ${p.career}`, `흥미 과목: ${p.subject}`,
    `대표 활동:\n${acts || "  (없음)"}`, `장점: ${p.strength} (근거: ${p.strengthProof})`, `단점: ${p.weakness} (보완: ${p.fix})`,
    `갈등·협력: 상황 ${p.teamSit} / 행동 ${p.teamAct} / 결과 ${p.teamResult}`, `책: ${p.book} (이유: ${p.bookWhy})`,
  ].join("\n");
}

const SYSTEM = `당신은 대학 입시 면접을 지도하는 교수입니다. 수험생이 실제로 소리 내어 말할 1인칭 면접 답변을 한국어로 다듬습니다.
원칙
- 수험생이 제공한 '나의 재료'에 있는 경험만 사용합니다. 재료에 없는 활동·수치·수상·일화는 절대 만들어 내지 않습니다. 필요한데 재료가 없으면 그 자리를 [✎ 무엇을 채울지]로 남깁니다.
- 첫 문장에 결론을 말하는 두괄식, 말하기 좋은 짧은 문장, 존댓말(~습니다)로 씁니다.
- 출신 학교명, 가족의 직업, 본인 이름 등 블라인드 면접에서 금지된 정보는 넣지 않습니다.
- 과장된 미사여구와 상투적 표현('어릴 때부터 꿈이었습니다' 등)은 피하고, 그 학생만의 구체적인 장면이 드러나게 합니다.
- 결과물은 답변 본문만 출력합니다. 제목, 따옴표, 설명, 마크다운을 붙이지 않습니다.`;

async function polishWithAI(items, btn) {
  const ai = aiSettings();
  if (!ai.apiKey) {
    alert("AI 다듬기를 쓰려면 ‘입시 문의 자동답변’ 앱의 [설정 → AI 다듬기]에 Claude API 키를 먼저 저장하세요. (같은 브라우저에서 공유됩니다)");
    return;
  }
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const Anthropic = await loadSdk();
    const client = new Anthropic({ apiKey: ai.apiKey, dangerouslyAllowBrowser: true });
    for (const [n, it] of items.entries()) {
      btn.textContent = items.length > 1 ? `AI 작성 중 ${n + 1}/${items.length}…` : "AI 작성 중…";
      const chars = Math.round(state.length * 5);
      const stream = client.beta.messages.stream({
        model: ai.model || DEFAULT_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `면접 문항: ${it.q}
문항 유형: ${TYPES[it.type].label}
목표 길이: 말하기 약 ${state.length}초(공백 제외 약 ${chars}자)

나의 재료:
${profileText(state.profile)}

현재 초안(사실은 유지하고 문장을 자연스럽게, 목표 길이에 맞게 다듬을 것):
${it.answer}` }],
      });
      const ta = $(`.note[data-id="${it.id}"] textarea`);
      let acc = "";
      stream.on("text", (d) => { acc += d; if (ta) { ta.value = acc; autoGrow(ta); } });
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") throw new Error("모델이 이 문항의 답변을 거절했습니다.");
      it.answer = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      it.ai = true; it.edited = true;
      persist();
    }
  } catch (err) {
    console.error(err);
    const s = err?.status;
    alert(`AI 다듬기 실패: ${s === 401 ? "API 키가 올바르지 않습니다." : s === 429 ? "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요." : err?.message || "알 수 없는 오류"}\n기존 답변은 그대로 유지됩니다.`);
  } finally {
    btn.disabled = false; btn.textContent = label;
    renderNotes();
  }
}
$("#btnAIAll").addEventListener("click", (e) => state.items.length && polishWithAI(state.items, e.currentTarget));

// ───────── 내보내기 ─────────
function notesText() {
  const head = `면접 대비 노트${state.source ? ` — ${state.source}` : ""}\n작성일: ${new Date().toLocaleDateString("ko-KR")}\n`;
  return head + state.items.map((it, i) => [
    `\n[Q${i + 1}] (${TYPES[it.type].label}) ${it.q}`,
    `\n${it.answer}`,
    `\n· 키워드: ${it.keywords.join(" / ")}`,
    it.followups.length ? `· 꼬리질문:\n${it.followups.map((f) => `  - ${f}`).join("\n")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n────────────\n");
}
$("#btnCopyAll").addEventListener("click", async () => {
  if (!state.items.length) return;
  try { await navigator.clipboard.writeText(notesText()); alert("전체 노트를 복사했습니다."); } catch { alert("복사에 실패했습니다. 텍스트 저장을 이용하세요."); }
});
$("#btnDownload").addEventListener("click", () => {
  if (!state.items.length) return;
  const blob = new Blob([notesText()], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `면접대비노트_${new Date().toISOString().slice(0, 10)}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#btnPrint").addEventListener("click", () => { renderNotes(); window.print(); });
$("#btnClearNotes").addEventListener("click", () => {
  if (!state.items.length || !confirm("답변 노트를 모두 지울까요? (나의 재료는 유지됩니다)")) return;
  state.items = []; persist(); renderNotes();
});

// ───────── ④ 실전 연습 ─────────
let timer = null, startAt = 0;
function stopTimer() { if (timer) { clearInterval(timer); timer = null; $("#pStart").textContent = "▶ 답변 시작"; } }
function fmt(s) { return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

function renderPractice() {
  const n = state.items.length;
  if (!n) {
    $("#pQuestion").textContent = "연습할 문항이 없습니다. ① 면접 문항에서 문항을 넣어 주세요.";
    $("#pPos").textContent = ""; $("#pType").textContent = "";
    return;
  }
  state.practice = Math.min(Math.max(state.practice, 0), n - 1);
  const it = state.items[state.practice];
  $("#pPos").textContent = `${state.practice + 1} / ${n}`;
  $("#pType").textContent = TYPES[it.type].label;
  $("#pQuestion").textContent = it.q;
  $("#pKw").innerHTML = it.keywords.map((k) => `<span class="kw-chip">${esc(k)}</span>`).join("");
  $("#pAns").textContent = it.answer;
  $("#pKw").hidden = true; $("#pAns").hidden = true; $("#pFollowQ").hidden = true;
  $("#pLimit").value = String(state.length);
  $("#pTimer").textContent = "00:00"; $("#pTimer").classList.remove("over");
  $("#pBar").style.width = "0"; $("#pBar").classList.remove("over");
  const ch = it.checks || [];
  $$("#pChecks input").forEach((c, i) => (c.checked = !!ch[i]));
  $("#pCheckStat").textContent = it.checks ? `저장된 체크 ${ch.filter(Boolean).length}/5` : "";
  stopTimer();
}
function move(d) { state.practice = (state.practice + d + state.items.length) % state.items.length; renderPractice(); }
$("#pPrev").addEventListener("click", () => state.items.length && move(-1));
$("#pNext").addEventListener("click", () => state.items.length && move(1));
$("#pShuffle").addEventListener("click", () => {
  if (state.items.length < 2) return;
  let r; do { r = Math.floor(Math.random() * state.items.length); } while (r === state.practice);
  state.practice = r; renderPractice();
});
function speak(text) {
  if (!("speechSynthesis" in window)) { alert("이 브라우저는 음성 읽기를 지원하지 않습니다."); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR"; u.rate = 0.95;
  speechSynthesis.speak(u);
}
$("#pSpeak").addEventListener("click", () => state.items.length && speak($("#pQuestion").textContent));
$("#pStart").addEventListener("click", () => {
  if (!state.items.length) return;
  if (timer) { stopTimer(); return; }
  const limit = +$("#pLimit").value;
  startAt = Date.now();
  $("#pStart").textContent = "■ 멈추기";
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - startAt) / 1000);
    $("#pTimer").textContent = fmt(s);
    const over = s > limit;
    $("#pTimer").classList.toggle("over", over);
    $("#pBar").classList.toggle("over", over);
    $("#pBar").style.width = `${Math.min(100, (s / limit) * 100)}%`;
  }, 250);
});
$("#pShowKw").addEventListener("click", () => ($("#pKw").hidden = !$("#pKw").hidden));
$("#pShowAns").addEventListener("click", () => ($("#pAns").hidden = !$("#pAns").hidden));
$("#pFollow").addEventListener("click", () => {
  const it = state.items[state.practice];
  if (!it) return;
  const list = it.followups.length ? it.followups : ["방금 말한 내용을 뒷받침하는 구체적인 경험이 있나요?"];
  const q = list[Math.floor(Math.random() * list.length)];
  $("#pFollowQ").hidden = false;
  $("#pFollowQ").textContent = `꼬리질문: ${q}`;
  speak(q);
});
$("#pSaveCheck").addEventListener("click", () => {
  const it = state.items[state.practice];
  if (!it) return;
  it.checks = $$("#pChecks input").map((c) => c.checked);
  persist();
  $("#pCheckStat").textContent = `저장됨 · ${it.checks.filter(Boolean).length}/5`;
});
document.addEventListener("keydown", (e) => {
  if (!$("#tab-practice").classList.contains("active") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowRight") move(1);
  if (e.key === "ArrowLeft") move(-1);
  if (e.key === " ") { e.preventDefault(); $("#pStart").click(); }
});

// ───────── 시작 ─────────
renderProfile();
$("#qSource").value = state.source;
$("#qLength").value = String(state.length);
$("#profileWarn").hidden = !profileEmpty();
$("#noteCount").textContent = state.items.length || "";
if (state.items.length) showTab("notes");
