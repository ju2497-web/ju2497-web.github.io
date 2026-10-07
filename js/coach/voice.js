import { CONFIG } from "./config.js";
import { QTYPES, COMPETENCIES } from "./framework.js";
import { detectType, runBasic, deptProfile, secondsOf } from "./engine.js";
import { SPOKEN, formalize, practiceFeedback, followupFeedback } from "./voice-core.js";
import { canDeep, callDeep, fromAI } from "./ai-call.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const TARGET = 50;
const st = { q: "", dept: "", type: "general", steps: [], i: 0, fields: {}, result: null, practiceStart: 0, fu: "" };
try { st.dept = localStorage.getItem("voice.dept") || ""; } catch {}

function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === id)); window.scrollTo({ top: 0 }); }

// ───────── 음성 ─────────
function speak(text) {
  return new Promise((res) => {
    if (!("speechSynthesis" in window) || !text) return res();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR"; u.rate = 1; u.onend = res; u.onerror = res;
      speechSynthesis.speak(u);
      setTimeout(res, Math.min(15000, text.length * 180)); // 일부 브라우저는 onend가 오지 않음
    } catch { res(); }
  });
}
let rec = null, recKey = null;
function stopRec() { if (rec) { try { rec.stop(); } catch {} } }
function toggleMic(key, { onStart, onStop } = {}) {
  const btn = document.querySelector(`[data-mic="${key}"]`);
  const box = $(`#${key}`);
  const state = document.querySelector(`[data-state="${key}"]`);
  if (rec && recKey === key) { stopRec(); return; }
  stopRec();
  if (!SR) { box.focus(); return; }
  speechSynthesis?.cancel();
  const r = new SR();
  r.lang = "ko-KR"; r.interimResults = true; r.continuous = true;
  const base = box.value ? box.value.trim() + " " : "";
  let finalText = "";
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + " "; else interim += t;
    }
    box.value = (base + finalText + interim).trim();
  };
  r.onend = () => { btn.classList.remove("rec"); if (state) state.textContent = "눌러서 다시 말하기"; rec = null; recKey = null; onStop?.(); };
  r.onerror = (e) => { if (state) state.textContent = e.error === "not-allowed" ? "마이크 권한을 허용해 주세요" : "다시 눌러 말해 주세요"; };
  rec = r; recKey = key;
  btn.classList.add("rec"); if (state) state.textContent = "듣고 있어요… 다 말하면 다시 누르세요";
  r.start(); onStart?.();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mic]");
  if (!b) return;
  const k = b.dataset.mic;
  if (k === "p") toggleMic("p", { onStart: startTimer, onStop: () => { stopTimer(); gradePractice(); } });
  else toggleMic(k);
});
if (!SR) { document.querySelector(".nomic").hidden = false; document.querySelectorAll(".micstate").forEach((m) => (m.textContent = "아래에 입력하세요")); }

// ───────── 1. 질문 ─────────
$("#dept").value = st.dept;
fetch(CONFIG.questionBankUrl).then((r) => r.json()).then((d) => {
  const sets = (d.sets || []).filter((s) => !CONFIG.blockedUniversities.includes(s.university));
  $("#bank").innerHTML += sets.map((s) => `<optgroup label="${esc(`${s.university} ${s.department} ${s.year || ""}`)}">${s.questions.map((q) => `<option data-dept="${esc(s.department)}">${esc(q)}</option>`).join("")}</optgroup>`).join("");
}).catch(() => {});
$("#bank").addEventListener("change", (e) => {
  const o = e.target.selectedOptions[0];
  if (!o?.value) return;
  $("#q").value = o.value;
  if (o.dataset.dept && !/모든/.test(o.dataset.dept)) $("#dept").value = o.dataset.dept;
});
$("#go1").addEventListener("click", () => {
  stopRec();
  st.q = $("#q").value.trim();
  if (st.q.length < 6) { speak("면접 질문을 먼저 말해 주세요."); $("#q").focus(); return; }
  st.dept = $("#dept").value.trim();
  try { localStorage.setItem("voice.dept", st.dept); } catch {}
  st.type = detectType(st.q);
  const T = QTYPES[st.type];
  st.steps = SPOKEN[st.type] || SPOKEN.general;
  st.i = 0; st.fields = {};
  $("#typeChips").innerHTML = `<span class="chip type">${esc(T.label)}</span>${T.comps.map((c) => `<span class="chip comp">${esc(COMPETENCIES[c])}</span>`).join("")}`;
  $("#intent").textContent = `면접관은 이 질문에서 ${T.looks.slice(0, 2).join(", ")}을(를) 봅니다.`;
  show("s2"); ask();
});

// ───────── 2. 되묻기 ─────────
function ask() {
  const [, text] = st.steps[st.i];
  $("#dots").innerHTML = st.steps.map((_, k) => `<i class="${k <= st.i ? "on" : ""}"></i>`).join("");
  $("#ask").textContent = text;
  $("#a").value = st.fields[st.steps[st.i][0]] || "";
  speak(text);
}
$("#reAsk").addEventListener("click", () => speak($("#ask").textContent));
function advance(save) {
  stopRec();
  const [k] = st.steps[st.i];
  st.fields[k] = save ? formalize($("#a").value) : "";
  if (st.i < st.steps.length - 1) { st.i++; ask(); } else build();
}
$("#next").addEventListener("click", () => advance(true));
$("#skip").addEventListener("click", () => advance(false));

// ───────── 3. 결과 ─────────
function build() {
  st.result = runBasic({ question: st.q, dept: st.dept, fields: st.fields, targetSec: TARGET });
  renderResult();
  show("s3");
}
const STOP = /^(저는|제가|저도|친구|친구가|친구와|친구는|따로|계속|먼저|같이|함께|좀|다시|처음엔|처음에|나중에|그때|정말|너무|많이|조금|그래서|그리고|이유|경험|생각)$/;
const VERBISH = /(서|고|는데|니다|다|요|게|며|지|어|아|던|은|는|한|된|면|도록|려고)$/;
function keywords() {
  const out = [];
  for (const [k] of st.steps) {
    const words = (st.fields[k] || "").replace(/[.,]/g, " ").split(/\s+/)
      .map((w) => w.replace(/(에서|으로|에게|이랑|하고|까지|부터|을|를|이|가|은|는|와|과|의|에|로|도)$/, ""))
      .filter((w) => w.length >= 2 && !STOP.test(w) && !VERBISH.test(w) && !/(하|되|있|없|했|됐|싶)$/.test(w));
    if (words[0] && !out.includes(words[0])) out.push(words[0]);
  }
  return out.slice(0, 3);
}
function renderResult() {
  const r = st.result;
  $("#score").textContent = r.score;
  $("#gauge").style.setProperty("--p", r.score);
  $("#grade").textContent = r.grade;
  $("#top").textContent = r.issues[0] ? `보완하면 좋은 점: ${r.issues[0].title}. ${r.issues[0].fix}` : "큰 감점 요인이 없어요.";
  $("#answer").value = r.answer;
  $("#kw").innerHTML = keywords().map((k) => `<span class="kw-chip">${esc(k)}</span>`).join("");
  $("#deep").hidden = !canDeep();
}
$("#listen").addEventListener("click", () => speak($("#answer").value));
$("#deep").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = "AI 다듬는 중…";
  const p = { question: st.q, university: "", department: st.dept, track: "", year: "", fields: st.fields, targetSec: TARGET, type: st.type, basicAnswer: st.result.answer, draft: "" };
  try { st.result = fromAI(await callDeep(p, (() => { try { return JSON.parse(localStorage.getItem("coach.code") || '""'); } catch { return ""; } })()), st.result, p); renderResult(); }
  catch (err) { alert(`AI 다듬기 실패: ${err.message}`); }
  b.disabled = false; b.textContent = "AI로 더 다듬기";
});

// ───────── 4. 말하기 연습 ─────────
let tick = null;
function startTimer() {
  st.practiceStart = Date.now();
  clearInterval(tick);
  tick = setInterval(() => {
    const s = Math.floor((Date.now() - st.practiceStart) / 1000);
    $("#timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    $("#timer").classList.toggle("over", s > TARGET + 5);
  }, 250);
}
function stopTimer() { clearInterval(tick); tick = null; }
const elapsed = () => (st.practiceStart ? Math.round((Date.now() - st.practiceStart) / 1000) : secondsOf($("#p").value));

$("#toPractice").addEventListener("click", async () => {
  st.result.answer = $("#answer").value;
  $("#tgt").textContent = TARGET;
  $("#pq").textContent = st.q;
  $("#kw2").innerHTML = $("#kw").innerHTML;
  $("#p").value = ""; $("#fb").hidden = true; $("#fuBox").hidden = true; $("#endBox").hidden = true; $("#timer").textContent = "00:00";
  st.practiceStart = 0;
  show("s4");
  await speak(`질문 드리겠습니다. ${st.q}`);
});
function gradePractice() {
  const spoken = st.practiceStart ? Math.round((Date.now() - st.practiceStart) / 1000) : 0;
  const sec = spoken >= 3 ? spoken : secondsOf($("#p").value); // 직접 입력한 경우 글자 수로 추정
  const fb = practiceFeedback({ transcript: $("#p").value, seconds: sec, target: TARGET, keywords: keywords() });
  $("#fb").hidden = false;
  $("#fb").innerHTML = `<b>말하기 ${fb.score}점</b><ul>${fb.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  const list = st.result.followups;
  st.fu = list[Math.floor(Math.random() * list.length)]?.q || "방금 말한 내용을 뒷받침하는 다른 경험이 있나요?";
  $("#fuQ").textContent = st.fu;
  $("#fuBox").hidden = false;
  $("#f").value = "";
  speak(`좋습니다. 하나 더 여쭤볼게요. ${st.fu}`).then(() => { st.fuStart = Date.now(); });
}
$("#grade1").addEventListener("click", () => { stopRec(); stopTimer(); gradePractice(); });
$("#grade2").addEventListener("click", () => {
  stopRec();
  const sec = st.fuStart ? Math.round((Date.now() - st.fuStart) / 1000) : secondsOf($("#f").value);
  const tips = followupFeedback({ transcript: $("#f").value, seconds: Math.min(sec, secondsOf($("#f").value) + 15) });
  $("#fb2").hidden = false;
  $("#fb2").innerHTML = `<ul>${tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  $("#endBox").hidden = false;
});
$("#retry").addEventListener("click", () => { $("#toPractice").click(); });
$("#again").addEventListener("click", () => { $("#q").value = ""; $("#bank").value = ""; show("s1"); });
