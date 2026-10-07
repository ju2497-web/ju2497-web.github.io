import { CONFIG } from "./config.js";
import { QTYPES, COMPETENCIES } from "./framework.js";
import { runBasic, evaluate, detectType, speakingScript, secondsOf } from "./engine.js";
import { validatePayload } from "./prompt.js";
import { canDeep, needsCode, callDeep, fromAI } from "./ai-call.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = (n) => `${n.toLocaleString("ko-KR")}원`;
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } };

const K = { exp: "coach.exp.v1", vault: "coach.vault.v1", prefs: "coach.prefs.v1", local: "coach.qbank.local", code: "coach.code" };
const state = {
  sets: [],
  exp: load(K.exp, {}),          // 문항별 경험 입력 {questionText: {field: value}}
  vault: load(K.vault, []),
  prefs: load(K.prefs, { dept: "", target: 50 }),
  result: null,
};

function toast(msg) {
  const t = $("#toast"); t.textContent = msg;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.textContent = ""), 1800);
}

// ───────── 문항 DB ─────────
async function loadBank() {
  let sets = [];
  try {
    const r = await fetch(CONFIG.questionBankUrl, { cache: "no-cache" });
    if (r.ok) sets = (await r.json()).sets || [];
  } catch { /* 오프라인 등 */ }
  const local = load(K.local, []);
  const map = new Map(sets.map((s) => [s.id, s]));
  local.forEach((s) => map.set(s.id, s));
  state.sets = [...map.values()];
}

const uniq = (a) => [...new Set(a)];
const isBlocked = (u) => CONFIG.blockedUniversities.includes((u || "").trim());

function fillSelect(sel, items, keep) {
  sel.innerHTML = items.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");
  if (keep && items.some((x) => x.value === keep)) sel.value = keep;
}
function renderUniv() {
  fillSelect($("#selUniv"), uniq(state.sets.map((s) => s.university)).map((u) => ({ value: u, label: u })), state.prefs.univ);
  renderDept();
}
function renderDept() {
  const u = $("#selUniv").value;
  fillSelect($("#selDept"), uniq(state.sets.filter((s) => s.university === u).map((s) => s.department)).map((d) => ({ value: d, label: d })), state.prefs.deptSel);
  renderSets();
}
function renderSets() {
  const u = $("#selUniv").value, d = $("#selDept").value;
  fillSelect($("#selSet"), state.sets.filter((s) => s.university === u && s.department === d)
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .map((s) => ({ value: s.id, label: `${s.track || "전형 미지정"} · ${s.year || ""}` })), state.prefs.set);
  renderQuestions();
}
const currentSet = () => state.sets.find((s) => s.id === $("#selSet").value);

function renderQuestions() {
  const set = currentSet();
  const blocked = set && isBlocked(set.university);
  $("#blockedNote").hidden = !blocked;
  $("#blockedNote").textContent = blocked ? "이해충돌 방지를 위해 이 대학 문항은 이 서비스에서 제공하지 않습니다." : "";
  $("#qList").innerHTML = blocked || !set ? "" : set.questions.map((q, i) => {
    const t = QTYPES[detectType(q)];
    return `<label class="qitem"><input type="radio" name="q" value="${i}" ${i === (state.prefs.qi ?? 0) ? "checked" : ""}>
      <span>${esc(q)}<span class="qtag">${esc(t.label)} · ${t.comps.map((c) => COMPETENCIES[c]).join(", ")}</span></span></label>`;
  }).join("");
  $("#sourceNote").textContent = set ? `출처: ${set.source || "미기재"}${set.sourceUrl ? ` (${set.sourceUrl})` : ""}` : "문항 DB를 불러오지 못했습니다. 아래에 직접 입력하세요.";
  if (set && !blocked && set.department && !/모든/.test(set.department)) $("#dept").value = set.department;
  markQ();
  renderExpForm();
}
function markQ() { $$(".qitem").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked)); }

function currentQuestion() {
  const custom = $("#qCustom").value.trim();
  if ($("#customQ").open && custom) return custom;
  const set = currentSet();
  const r = $("input[name=q]:checked");
  return set && r && !isBlocked(set.university) ? set.questions[+r.value] : custom;
}

// ───────── 경험 입력 ─────────
function renderExpForm() {
  const q = currentQuestion();
  if (!q) { $("#typeInfo").innerHTML = "문항을 고르면 이 문항에 맞는 경험 질문이 나타납니다."; $("#expForm").innerHTML = ""; return; }
  const type = detectType(q), T = QTYPES[type];
  const vals = state.exp[q] || {};
  $("#typeInfo").innerHTML = `<div class="chips"><span class="chip type">${esc(T.label)}</span>${T.comps.map((c) => `<span class="chip comp">${esc(COMPETENCIES[c])}</span>`).join("")}</div>
    <b>질문 의도</b> ${esc(T.intent)}`;
  $("#expForm").innerHTML = T.fields.map((f) => `<label>${esc(f.label)}
    <textarea name="${f.k}" rows="2" placeholder="${esc(f.ph ? `예) ${f.ph}` : "")}">${esc(vals[f.k] || "")}</textarea></label>`).join("");
  $("#btnFillEx").hidden = !T.fields.some((f) => f.ph);
}
function readFields() {
  const out = {};
  $$("#expForm textarea").forEach((t) => (out[t.name] = t.value.trim()));
  return out;
}
$("#expForm").addEventListener("input", () => {
  const q = currentQuestion();
  if (!q) return;
  state.exp[q] = readFields(); save(K.exp, state.exp);
});
$("#btnFillEx").addEventListener("click", () => {
  const q = currentQuestion();
  if (!q) return;
  const T = QTYPES[detectType(q)];
  if (Object.values(readFields()).some(Boolean) && !confirm("입력한 내용을 예시로 바꿀까요?")) return;
  $$("#expForm textarea").forEach((t) => (t.value = T.fields.find((f) => f.k === t.name)?.ph || ""));
  state.exp[q] = readFields(); save(K.exp, state.exp);
});

["#selUniv", "#selDept", "#selSet"].forEach((s, i) => $(s).addEventListener("change", () => {
  state.prefs.univ = $("#selUniv").value; state.prefs.deptSel = $("#selDept").value; state.prefs.set = $("#selSet").value; state.prefs.qi = 0;
  save(K.prefs, state.prefs);
  [renderDept, renderSets, renderQuestions][i]();
}));
$("#qList").addEventListener("change", (e) => {
  if (e.target.name !== "q") return;
  state.prefs.qi = +e.target.value; save(K.prefs, state.prefs);
  $("#customQ").open = false;
  markQ(); renderExpForm();
});
$("#qCustom").addEventListener("input", () => renderExpForm());
$("#customQ").addEventListener("toggle", () => renderExpForm());
$("#dept").addEventListener("change", () => { state.prefs.dept = $("#dept").value.trim(); save(K.prefs, state.prefs); });
$("#target").addEventListener("change", () => { state.prefs.target = +$("#target").value; save(K.prefs, state.prefs); });

// ───────── 결과 ─────────
function payload() {
  const set = currentSet();
  const q = currentQuestion();
  const custom = $("#customQ").open && $("#qCustom").value.trim();
  return {
    question: q,
    university: custom ? "" : set?.university || "",
    department: $("#dept").value.trim(),
    track: custom ? "" : set?.track || "",
    year: custom ? "" : set?.year || "",
    fields: readFields(),
    targetSec: +$("#target").value,
    type: detectType(q || ""),
    draft: $("#draft").value.trim(),
  };
}

$("#btnMake").addEventListener("click", () => {
  const p = payload();
  if (!p.question) { alert("면접 문항을 먼저 고르거나 입력해 주세요."); return; }
  const r = runBasic({ question: p.question, dept: p.department, fields: p.fields, targetSec: p.targetSec, draft: p.draft });
  state.result = { ...r, question: p.question, meta: p };
  render();
});

function render() {
  const r = state.result;
  $("#result").hidden = false;
  $("#resMode").textContent = r.mode === "deep" ? "AI 심층형 · 교수 평가 프레임 10단계" : "기본형 · 교수 평가 프레임";
  setScore(r.score, r.grade);
  $("#compChips").innerHTML = `<span class="chip type">${esc(r.typeLabel)}</span>` + r.competencies.map((c) => `<span class="chip comp">${esc(c)}</span>`).join("");
  $("#intent").textContent = r.intent;

  const cmp = [];
  if (r.plain) cmp.push(`<div class="bad"><div class="lbl">평범한 답변 <b>${r.plain.score}점</b></div><p>${esc(r.plain.text)}</p></div>`);
  if (r.draft) cmp.push(`<div class="bad"><div class="lbl">내가 써 둔 답변 <b>${r.draft.score}점</b></div><p>${esc(r.draft.issues.slice(0, 2).map((i) => i.title).join(" · ") || "감점 요인 적음")}</p></div>`);
  cmp.push(`<div class="good"><div class="lbl">차별화된 내 답변 <b>${r.score}점</b></div><p>${r.mode === "deep" ? "교수 평가 프레임 10단계로 다듬은 답변" : "내 경험으로 만든 답변"}</p></div>`);
  $("#compare").innerHTML = cmp.join("");

  renderIssues(r.issues);
  $("#answer").value = r.answer;
  autoGrow($("#answer"));
  $("#secInfo").textContent = `말하기 약 ${secondsOf(r.answer)}초 / 목표 ${r.meta.targetSec}초`;
  $("#fixes").innerHTML = (r.fixes || []).map((x) => `<li>${esc(x)}</li>`).join("");
  $("#followups").innerHTML = r.followups.map((f, i) => `<div class="fu"><div class="q">Q${i + 1}. ${esc(f.q)}</div>
    ${f.answer ? `<div class="a">${esc(f.answer)}</div>` : ""}${f.dir ? `<div class="d">답변 방향: ${esc(f.dir)}</div>` : ""}</div>`).join("");
  $("#script").textContent = r.script;
  $("#coaching").innerHTML = r.coaching.map((c) => `<li>${esc(c)}</li>`).join("");
  $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
}
function setScore(s, g) {
  $("#score").textContent = s;
  $("#gauge").style.setProperty("--p", s);
  $("#grade").textContent = g;
}
function renderIssues(list) {
  const top = (list || []).slice(0, 3);
  $("#issues").innerHTML = top.length
    ? top.map((i) => `<li><b>${esc(i.title)}${i.lost ? `<span class="lost">-${i.lost}</span>` : ""}</b><span>${esc(i.fix)}</span></li>`).join("")
    : `<li class="none">큰 감점 요인이 없습니다. 이제 키워드만 보고 말하는 연습을 하세요.</li>`;
}
function autoGrow(t) { t.style.height = "auto"; t.style.height = Math.max(160, t.scrollHeight + 4) + "px"; }
$("#answer").addEventListener("input", (e) => { autoGrow(e.target); $("#secInfo").textContent = `말하기 약 ${secondsOf(e.target.value)}초 / 목표 ${state.result.meta.targetSec}초`; });
$("#btnRescore").addEventListener("click", () => {
  const r = state.result; if (!r) return;
  const ev = evaluate($("#answer").value, r.question, r.meta.department, r.meta.targetSec, r.type);
  r.answer = $("#answer").value; r.score = ev.score; r.grade = ev.grade; r.issues = ev.issues;
  setScore(ev.score, ev.grade); renderIssues(ev.issues);
  $("#script").textContent = r.script = speakingScript(r.answer, []);
  $("#compare .good b").textContent = `${ev.score}점`;
  toast("다시 채점했습니다.");
});
$("#btnCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#answer").value); toast("복사했습니다."); } catch { $("#answer").select(); document.execCommand("copy"); toast("복사했습니다."); }
});

// ───────── AI 심층형 ─────────
function setupDeep() {
  $("#btnDeep").hidden = !canDeep();
  $("#codeWrap").hidden = !needsCode();
  $("#accessCode").value = load(K.code, "");
}
$("#accessCode").addEventListener("change", () => save(K.code, $("#accessCode").value.trim()));

$("#btnDeep").addEventListener("click", async () => {
  const p = payload();
  if (!p.question) { alert("면접 문항을 먼저 고르거나 입력해 주세요."); return; }
  const problem = validatePayload(p);
  if (problem) { alert(problem); return; }
  if (!confirm("AI 심층 분석을 위해 문항과 입력한 경험이 분석 서버로 전송됩니다. 진행할까요?")) return;
  const basic = runBasic({ question: p.question, dept: p.department, fields: p.fields, targetSec: p.targetSec, draft: p.draft });
  p.basicAnswer = basic.answer;
  const btn = $("#btnDeep"); const label = btn.textContent;
  btn.disabled = true; btn.textContent = "AI 분석 중… (최대 1~2분)";
  try {
    const ai = await callDeep(p, $("#accessCode").value.trim());
    state.result = { ...fromAI(ai, basic, p), question: p.question, meta: p };
    render();
  } catch (err) {
    console.error(err);
    alert(`AI 심층 분석 실패: ${err.message || err}\n기본형 결과를 대신 보여 드립니다.`);
    state.result = { ...basic, question: p.question, meta: p };
    render();
  } finally { btn.disabled = false; btn.textContent = label; }
});

// ───────── 연습 ─────────
let timer = null;
$("#btnSpeak").addEventListener("click", () => {
  if (!state.result || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(state.result.question); u.lang = "ko-KR"; u.rate = 0.95;
  speechSynthesis.speak(u);
});
$("#btnTimer").addEventListener("click", () => {
  if (timer) { clearInterval(timer); timer = null; $("#btnTimer").textContent = "⏱ 연습 시작"; return; }
  const start = Date.now(), limit = state.result?.meta.targetSec || 50;
  $("#btnTimer").textContent = "■ 멈추기";
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    $("#timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    $("#timer").classList.toggle("over", s > limit + 5);
  }, 250);
});

// ───────── 보관함 ─────────
$("#btnSave").addEventListener("click", () => {
  const r = state.result; if (!r) return;
  const item = {
    id: Date.now().toString(36), at: new Date().toISOString(), question: r.question,
    university: r.meta.university, department: r.meta.department, track: r.meta.track, year: r.meta.year,
    type: r.typeLabel, mode: r.mode, score: r.score, answer: $("#answer").value,
    followups: r.followups.map((f) => f.q),
  };
  const i = state.vault.findIndex((v) => v.question === item.question);
  if (i >= 0) state.vault[i] = item; else state.vault.push(item);
  save(K.vault, state.vault); renderVault(); toast("보관함에 저장했습니다.");
});
function renderVault() {
  $("#vaultCount").textContent = state.vault.length ? `${state.vault.length}개` : "";
  $("#vault").innerHTML = state.vault.map((v) => `<div class="vitem" data-id="${v.id}">
      <div><div class="vq">${esc(v.question)}</div>
      <div class="vm">${esc([v.university, v.department].filter(Boolean).join(" · "))} · ${esc(v.type)} · ${v.score}점 · ${v.mode === "deep" ? "AI 심층" : "기본형"}</div></div>
      <div class="btns"><button class="ghost" data-act="del">삭제</button></div></div>`).join("")
    || `<p class="hint">답변을 만든 뒤 [보관함에 저장]을 누르면 여기에 모입니다. 교수 검수 신청 시 보관함 답변이 함께 전달됩니다.</p>`;
  refreshReview();
}
$("#vault").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act=del]"); if (!b) return;
  state.vault = state.vault.filter((v) => v.id !== b.closest(".vitem").dataset.id); save(K.vault, state.vault); renderVault();
});
$("#btnVaultClear").addEventListener("click", () => {
  if (!state.vault.length || !confirm("보관함을 비울까요?")) return;
  state.vault = []; save(K.vault, state.vault); renderVault();
});
function vaultText() {
  return state.vault.map((v, i) => `[${i + 1}] ${v.question}\n(${[v.university, v.department, v.track, v.year].filter(Boolean).join(" / ")} · ${v.type} · 예상 ${v.score}점)\n\n${v.answer}\n\n예상 꼬리질문:\n${v.followups.map((f) => `- ${f}`).join("\n")}`).join("\n\n──────────\n\n");
}
$("#btnExport").addEventListener("click", () => {
  if (!state.vault.length) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([vaultText()], { type: "text/plain;charset=utf-8" }));
  a.download = `내_면접답변_${new Date().toISOString().slice(0, 10)}.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ───────── 교수 최종검수 ─────────
function refreshReview() {
  const blocked = state.vault.some((v) => isBlocked(v.university));
  $("#reviewCard").classList.toggle("off", blocked);
  $("#btnReview").disabled = blocked || !state.vault.length;
  $("#reviewPrice").textContent = CONFIG.beta ? `+${won(CONFIG.prices.review)} (베타 기간 무료)` : `+${won(CONFIG.prices.review)}`;
  $("#btnReview").title = blocked ? "이해충돌 방지 대상 대학 문항이 보관함에 있어 검수를 신청할 수 없습니다." : !state.vault.length ? "보관함에 답변을 먼저 저장하세요." : "";
}
$("#btnReview").addEventListener("click", () => { $("#rvCount").textContent = state.vault.length; $("#reviewDlg").showModal(); });
$("#reviewDlg").addEventListener("close", () => {
  if ($("#reviewDlg").returnValue !== "ok") return;
  const f = $("#reviewForm");
  const text = `[교수 최종검수 신청]
신청자: ${f.name.value}
연락처: ${f.contact.value}
면접 예정일: ${f.date.value || "미정"}
요청 사항: ${f.memo.value || "없음"}
신청 답변 수: ${state.vault.length}개
신청일: ${new Date().toLocaleString("ko-KR")}

${vaultText()}`;
  $("#rdText").value = text;
  const mail = $("#rdMail");
  if (CONFIG.reviewContact) {
    mail.hidden = false;
    mail.href = `mailto:${CONFIG.reviewContact}?subject=${encodeURIComponent(`[면접 검수 신청] ${f.name.value}`)}&body=${encodeURIComponent(text.slice(0, 1800))}`;
    $("#rdMsg").textContent = "[이메일로 보내기]를 누르거나, 내용이 길면 신청서를 복사해 붙여 넣어 보내 주세요.";
  } else {
    mail.hidden = true;
    $("#rdMsg").textContent = "신청서를 복사해 안내받은 연락처(문자·카카오톡·이메일)로 보내 주세요.";
  }
  $("#reviewDone").showModal();
});
$("#rdCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#rdText").value); $("#rdCopy").textContent = "복사됨"; } catch { $("#rdText").select(); document.execCommand("copy"); } });
$("#rdClose").addEventListener("click", () => $("#reviewDone").close());

function renderPlans() {
  const p = CONFIG.prices;
  const price = (n) => (CONFIG.beta ? `<s>${won(n)}</s>무료` : won(n));
  $("#plans").innerHTML = `
    <div class="plan"><b>기본형</b><span class="won">${price(p.basic)}</span><br>교수 평가 프레임 분석 · 예상 점수 · 답변 · 꼬리질문 · 대본</div>
    <div class="plan"><b>AI 심층형</b><span class="won">${price(p.deep)}</span><br>10단계 AI 분석 · 꼬리질문 모범 답변 · 감점 수정 이력</div>
    <div class="plan"><b>교수 검수형</b><span class="won">${price(p.deep + p.review)}</span><br>AI 심층형 + 교수 직접 첨삭</div>`;
}

// ───────── 시작 ─────────
(async function init() {
  $("#svcName").textContent = CONFIG.serviceName;
  document.title = CONFIG.serviceName;
  $("#betaBanner").hidden = !CONFIG.beta;
  $("#dept").value = state.prefs.dept || "";
  $("#target").value = String(state.prefs.target || 50);
  await loadBank();
  renderUniv();
  if (state.prefs.dept && !$("#dept").value) $("#dept").value = state.prefs.dept;
  setupDeep(); renderVault(); renderPlans();
})();
