import { CONFIG } from "./config.js";
import { QTYPES } from "./framework.js";
import { detectType, runBasic, secondsOf } from "./engine.js";
import { SPOKEN, formalize, scoreSpoken, improveAnswer } from "./voice-core.js";
import { canDeep, callVoice } from "./ai-call.js";
import { toDims } from "./voice-loop.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const TARGET = 50;
const FREE_QUESTIONS = 1;
const st = { q: "", dept: "", type: "general", history: [], startAt: 0, guided: null, followIdx: 0 };
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
st.dept = ls.get("voice.dept", "");
const used = () => ls.get("voice.used", []);

function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === id)); window.scrollTo({ top: 0 }); }

// ───────── 음성 ─────────
function speak(text) {
  return new Promise((res) => {
    if (!("speechSynthesis" in window) || !text) return res();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR"; u.onend = res; u.onerror = res;
      speechSynthesis.speak(u);
      setTimeout(res, Math.min(20000, text.length * 180));
    } catch { res(); }
  });
}
let rec = null, recKey = null;
function stopRec() { if (rec) { try { rec.stop(); } catch {} } }
function mic(key, { onStart, onStop } = {}) {
  const btn = document.querySelector(`[data-mic="${key}"]`), box = $(`#${key}`), state = document.querySelector(`[data-state="${key}"]`);
  if (rec && recKey === key) { stopRec(); return; }
  stopRec();
  if (!SR) { box.focus(); return; }
  try { speechSynthesis.cancel(); } catch {}
  const r = new SR();
  r.lang = "ko-KR"; r.interimResults = true; r.continuous = true;
  const base = box.value ? box.value.trim() + " " : "";
  let fin = "";
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t + " "; else interim += t; }
    box.value = (base + fin + interim).trim();
  };
  r.onend = () => { btn.classList.remove("rec"); rec = null; recKey = null; if (state) state.dataset.done = "1"; onStop?.(); };
  r.onerror = (e) => { if (state) state.textContent = e.error === "not-allowed" ? "마이크 권한을 허용해 주세요" : "다시 눌러 말해 주세요"; };
  rec = r; recKey = key; btn.classList.add("rec");
  if (state) state.textContent = "듣고 있어요… 다 말하면 다시 누르세요";
  r.start(); onStart?.();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mic]"); if (!b) return;
  const k = b.dataset.mic;
  if (k === "a") mic("a", { onStart: startTimer, onStop: () => { stopTimer(); setLabel("a", "다시 말하려면 누르세요"); } });
  else mic(k, { onStop: () => setLabel(k, "다시 말하려면 누르세요") });
});
const setLabel = (k, t) => { const s = document.querySelector(`[data-state="${k}"]`); if (s) s.textContent = t; };
if (!SR) { $(".nomic").hidden = false; document.querySelectorAll(".micstate").forEach((m) => (m.textContent = "아래에 입력하세요")); }

let tick = null;
function startTimer() {
  st.startAt = Date.now(); clearInterval(tick);
  tick = setInterval(() => {
    const s = Math.floor((Date.now() - st.startAt) / 1000);
    $("#timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    $("#timer").classList.toggle("over", s > TARGET + 5);
  }, 250);
}
function stopTimer() { clearInterval(tick); tick = null; st.spoken = st.startAt ? Math.round((Date.now() - st.startAt) / 1000) : 0; st.startAt = 0; }

// ───────── 1. 질문 ─────────
const ROLE2DEPT = [[/간호사/, "간호학과"], [/임상병리사/, "임상병리학과"], [/물리치료사/, "물리치료학과"], [/작업치료사/, "작업치료학과"], [/방사선사/, "방사선학과"], [/치과위생사/, "치위생학과"], [/응급구조사/, "응급구조학과"], [/교사|선생님/, "교육학과"], [/사회복지사/, "사회복지학과"]];
function setQuestion(q) {
  st.q = q; st.type = detectType(q); st.history = [];
  const auto = (ROLE2DEPT.find(([re]) => re.test(q)) || [])[1];
  if (auto) st.dept = auto;
  $("#dept").value = st.dept;
  ["#qShow", "#qShow2", "#qShow3"].forEach((s) => ($(s).textContent = `Q. ${q}`));
  $("#a").value = ""; $("#timer").textContent = "00:00"; st.spoken = 0;
  setLabel("a", "내 답변 말하기");
}
$("#go1").addEventListener("click", () => {
  stopRec();
  const q = $("#q").value.trim();
  if (q.length < 6) { speak("면접 질문을 먼저 말해 주세요."); $("#q").focus(); return; }
  setQuestion(q);
  show("s2");
  speak("이 질문에 본인은 어떻게 답하시겠어요?");
});
$("#dept").addEventListener("change", () => { st.dept = $("#dept").value.trim(); ls.set("voice.dept", st.dept); });

// ───────── 2. 채점 ─────────
$("#gradeBtn").addEventListener("click", () => {
  stopRec(); if (st.startAt) stopTimer();
  const t = $("#a").value.trim();
  if (t.replace(/\s/g, "").length < 15) { speak("답변을 조금 더 말해 주세요."); return; }
  const seconds = st.spoken >= 3 ? st.spoken : secondsOf(formalize(t));
  grade(t, seconds);
});

function grade(transcript, seconds) {
  const sc = scoreSpoken({ transcript, question: st.q, dept: st.dept, type: st.type, seconds, target: TARGET });
  const im = improveAnswer({ transcript, question: st.q, dept: st.dept, type: st.type, target: TARGET });
  st.history.push(sc.total);
  render({ total: sc.total, dims: sc.dims, problem: sc.problem, answer: im.answer, changes: im.changes, label: st.history.length > 1 ? "다시 말한 답변" : "현재 답변" });
  show("s3");
  markUsed();
  if (canDeep()) deep(transcript);
}

function render({ total, dims, problem, answer, changes, label }) {
  $("#scoreLbl").textContent = label;
  $("#score").textContent = total;
  $("#history").innerHTML = st.history.length > 1 ? st.history.map((v, i) => (i ? `<span>→</span><b>${v}</b>` : `<span>${v}</span>`)).join("") : "";
  $("#dims").innerHTML = Object.entries(dims).map(([k, v]) => `<div class="dim"><span>${esc(k)}</span><span class="bar"><i class="${v < 60 ? "low" : ""}" style="width:${Math.max(3, v)}%"></i></span><span class="v">${v}</span></div>`).join("");
  $("#problem").textContent = problem;
  $("#better").value = answer;
  $("#changes").innerHTML = (changes || []).map((c) => `<li>${esc(c)}</li>`).join("");
  $("#offer").hidden = !(st.history.length >= 2 || used().length >= FREE_QUESTIONS);
  $("#offerPrice").textContent = "5문항 4,900원";
  $("#offerNote").textContent = CONFIG.beta ? "지금은 베타 기간이라 무료로 계속하실 수 있습니다." : "결제 기능은 준비 중입니다.";
}

async function deep(transcript) {
  const s = $("#aiState");
  s.hidden = false; s.textContent = "AI 면접관이 다시 듣고 있어요… (최대 1~2분)";
  try {
    const r = await callVoice({ question: st.q, transcript, dept: st.dept, type: st.type }, ls.get("coach.code", ""));
    st.history[st.history.length - 1] = r.before.total;
    render({ total: r.before.total, dims: toDims(r.before.scores), problem: r.before.biggest_problem, answer: r.answer, changes: [...r.changes, `개선 답변 예상 점수 ${r.after.total}점 (면접관 평가 ${r.rounds}회 반복)`], label: st.history.length > 1 ? "다시 말한 답변" : "현재 답변" });
    s.textContent = "AI 면접관 평가로 바뀌었습니다.";
  } catch (err) {
    s.textContent = `AI 면접관 평가를 못 했어요(${err.message}). 기본 평가를 보여 드립니다.`;
  }
}

// ───────── 2b. 답변 만들어줘 ─────────
$("#makeBtn").addEventListener("click", () => {
  stopRec();
  st.guided = { steps: SPOKEN[st.type] || SPOKEN.general, i: 0, fields: {} };
  show("s2b"); ask();
});
function ask() {
  const g = st.guided, [, text] = g.steps[g.i];
  $("#dots").innerHTML = g.steps.map((_, k) => `<i class="${k <= g.i ? "on" : ""}"></i>`).join("");
  $("#ask").textContent = text; $("#g").value = "";
  setLabel("g", "있었던 일 그대로 말하기");
  speak(text);
}
function advance(save) {
  stopRec();
  const g = st.guided;
  g.fields[g.steps[g.i][0]] = save ? formalize($("#g").value) : "";
  if (g.i < g.steps.length - 1) { g.i++; ask(); return; }
  const r = runBasic({ question: st.q, dept: st.dept, fields: g.fields, targetSec: TARGET });
  render({ total: r.score, dims: dimsFromBasic(r), problem: r.issues[0] ? `${r.issues[0].title}. ${r.issues[0].fix}` : "큰 감점 요인이 없어요. 이제 직접 말해 보세요.", answer: r.answer, changes: ["말해 준 경험으로 답변을 만들었습니다. 이제 이 답변을 보고 직접 말해 보세요."], label: "만든 답변" });
  show("s3"); markUsed();
}
function dimsFromBasic(r) {
  const c = Object.fromEntries(r.cats.map((x) => [x.name, Math.round((100 * x.got) / x.max)]));
  return { "질문 적합성": c["질문 요구 충족"], "구체성": c["구체성(나의 행동)"], "차별성": Math.round((c["진정성(평범한 표현 없음)"] + c["성찰(배운 점)"]) / 2), "전공적합성": c["전공 연결"], "전달력": Math.round((c["말하기 시간"] + c["두괄식(첫 문장 결론)"]) / 2) };
}
$("#next").addEventListener("click", () => advance(true));
$("#skip").addEventListener("click", () => advance(false));

// ───────── 3. 결과 → 다시/다음 ─────────
$("#listen").addEventListener("click", () => speak($("#better").value));
$("#again").addEventListener("click", () => {
  $("#a").value = ""; $("#timer").textContent = "00:00"; st.spoken = 0; setLabel("a", "개선 답변을 떠올리며 다시 말하기");
  show("s2");
  speak("좋아요. 개선 답변을 떠올리면서 다시 말해 보세요.");
});
$("#nextQ").addEventListener("click", () => {
  if (!gate()) return;
  const fu = QTYPES[st.type].followups;
  const q = fu[st.followIdx % fu.length]?.q || "방금 말한 내용을 뒷받침하는 다른 경험이 있나요?";
  st.followIdx++;
  const keepType = st.type;
  setQuestion(q);
  if (st.type === "general") st.type = keepType;
  show("s2");
  speak(`다음 질문입니다. ${q}`);
});
$("#offerBtn").addEventListener("click", () => { if (CONFIG.beta) { $("#offer").hidden = true; $("#nextQ").click(); } });

function markUsed() { const u = used(); if (!u.includes(st.q)) { u.push(st.q); ls.set("voice.used", u); } }
function gate() {
  if (CONFIG.beta || used().length < FREE_QUESTIONS) return true;
  $("#offer").hidden = false; $("#offer").scrollIntoView({ behavior: "smooth" });
  return false;
}
