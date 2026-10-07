import { CONFIG } from "./config.js";
import { QTYPES } from "./framework.js";
import { detectType, secondsOf } from "./engine.js";
import { formalize, scoreSpoken, improveAnswer, diagnose, mergeAnswer, summaryLines, expectedScore } from "./voice-core.js";
import { canDeep, callVoice, canOcr, callOcr } from "./ai-call.js";
import { loadAnchors, findAnchor, placement } from "./anchors.js";

let ANCHORS = [];
loadAnchors().then((a) => (ANCHORS = a));

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const TARGET = 50, FREE_QUESTIONS = 1;
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const st = { q: "", dept: ls.get("voice.dept", ""), type: "general", transcript: "", history: [], diag: null, improved: null, expected: 0, spoken: 0, startAt: 0, followIdx: 0 };
const code = () => ls.get("coach.code", "");
const used = () => ls.get("voice.used", []);

function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === id)); window.scrollTo({ top: 0 }); }

// ───────── 음성 ─────────
function speak(text) {
  return new Promise((res) => {
    if (!("speechSynthesis" in window) || !text) return res();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = "ko-KR"; u.onend = res; u.onerror = res;
      speechSynthesis.speak(u); setTimeout(res, Math.min(20000, text.length * 180));
    } catch { res(); }
  });
}
let rec = null, recKey = null;
const stopRec = () => { if (rec) { try { rec.stop(); } catch {} } };
const label = (k, t) => { const s = document.querySelector(`[data-state="${k}"]`); if (s) s.textContent = t; };
function mic(key, { onStart, onStop } = {}) {
  const btn = document.querySelector(`[data-mic="${key}"]`), box = $(`#${key}`);
  if (rec && recKey === key) { stopRec(); return; }
  stopRec();
  if (!SR) { box.focus(); return; }
  try { speechSynthesis.cancel(); } catch {}
  const r = new SR(); r.lang = "ko-KR"; r.interimResults = true; r.continuous = true;
  const base = box.value ? box.value.trim() + " " : "";
  let fin = "";
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t + " "; else interim += t; }
    box.value = (base + fin + interim).trim();
  };
  r.onend = () => { btn.classList.remove("rec"); rec = null; recKey = null; label(key, "다시 말하려면 누르세요"); onStop?.(); };
  r.onerror = (e) => label(key, e.error === "not-allowed" ? "마이크 권한을 허용해 주세요" : "다시 눌러 말해 주세요");
  rec = r; recKey = key; btn.classList.add("rec"); label(key, "듣고 있어요… 다 말하면 다시 누르세요");
  r.start(); onStart?.();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mic]"); if (!b) return;
  if (b.dataset.mic === "a") mic("a", { onStart: startTimer, onStop: stopTimer }); else mic(b.dataset.mic);
});
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
function stopTimer() { clearInterval(tick); tick = null; if (st.startAt) st.spoken = Math.round((Date.now() - st.startAt) / 1000); st.startAt = 0; }

// ───────── ① 질문 ─────────
const ROLE2DEPT = [[/간호사/, "간호학과"], [/임상병리사/, "임상병리학과"], [/물리치료사/, "물리치료학과"], [/작업치료사/, "작업치료학과"], [/방사선사/, "방사선학과"], [/치과위생사/, "치위생학과"], [/응급구조사/, "응급구조학과"], [/교사|선생님/, "교육학과"], [/사회복지사/, "사회복지학과"]];
function setQuestion(q, keepType) {
  st.q = q; st.type = detectType(q); if (keepType && st.type === "general") st.type = keepType;
  st.history = []; st.transcript = ""; st.spoken = 0;
  const auto = (ROLE2DEPT.find(([re]) => re.test(q)) || [])[1];
  if (auto) st.dept = auto;
  $("#dept").value = st.dept;
  ["#qShow", "#qShow3", "#qShow4"].forEach((s) => ($(s).textContent = `Q. ${q}`));
  resetAnswer("이 질문에 지금 답해 보세요.", "잘하려고 하지 않아도 됩니다.");
}
function resetAnswer(title, sub) {
  $("#s2title").textContent = title; $("#s2sub").textContent = sub;
  $("#a").value = ""; $("#timer").textContent = "00:00"; st.spoken = 0; label("a", "답변 시작");
}
$("#go1").addEventListener("click", () => {
  stopRec();
  const q = $("#q").value.trim();
  if (q.length < 6) { speak("면접 질문을 먼저 말해 주세요."); $("#q").focus(); return; }
  setQuestion(q); show("s2");
  speak("이 질문에 지금 답해 보세요. 잘하려고 하지 않아도 됩니다.");
});
$("#dept").addEventListener("change", () => { st.dept = $("#dept").value.trim(); ls.set("voice.dept", st.dept); });

// 사진으로 넣기(AI 서버가 있을 때만)
$("#photoBtn").hidden = !canOcr();
$("#photo").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  $("#photoPick").innerHTML = `<p class="hint">사진 속 질문을 읽고 있어요…</p>`;
  try {
    const { data, type } = await shrink(file);
    const qs = await callOcr(data, type, code());
    if (!qs.length) throw new Error("질문을 찾지 못했어요");
    if (qs.length === 1) { $("#q").value = qs[0]; $("#photoPick").innerHTML = ""; }
    else $("#photoPick").innerHTML = `<p class="hint">연습할 질문을 고르세요</p>` + qs.map((q, i) => `<button class="ghost" data-pick="${i}">${esc(q)}</button>`).join("");
    $("#photoPick").onclick = (ev) => { const b = ev.target.closest("[data-pick]"); if (b) { $("#q").value = qs[+b.dataset.pick]; $("#photoPick").innerHTML = ""; } };
  } catch (err) { $("#photoPick").innerHTML = `<p class="hint">${esc(err.message)}. 직접 입력해 주세요.</p>`; }
  e.target.value = "";
});
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res({ data: c.toDataURL("image/jpeg", 0.85).split(",")[1], type: "image/jpeg" });
    };
    img.onerror = () => rej(new Error("사진을 열 수 없어요"));
    img.src = URL.createObjectURL(file);
  });
}

// ───────── ② → ③ 면접관 분석 ─────────
$("#gradeBtn").addEventListener("click", () => {
  stopRec(); if (st.startAt) stopTimer();
  const t = $("#a").value.trim();
  if (t.replace(/\s/g, "").length < 15) { speak("조금만 더 말해 주세요."); return; }
  st.transcript = t;
  const seconds = st.spoken >= 3 ? st.spoken : secondsOf(formalize(t));
  const sc = scoreSpoken({ transcript: t, question: st.q, dept: st.dept, type: st.type, seconds, target: TARGET });
  st.history.push(sc.total);
  st.score = sc;
  renderAnalysis(sc);
  st.diag = diagnose({ score: sc, formal: sc.formal, question: st.q, type: st.type, dept: st.dept, target: TARGET });
  renderStep();
  show("s3"); markUsed();
  speak(`${sc.total}점입니다. ${st.diag.say} ${st.diag.ask || ""}`);
});

function renderAnalysis(sc) {
  const s = summaryLines(sc, st.dept);
  $("#score").textContent = sc.total;
  $("#history").innerHTML = st.history.length > 1 ? st.history.map((v, i) => (i ? `<span>→</span><b>${v}</b>` : `<span>${v}</span>`)).join("") : "";
  $("#head").textContent = s.head;
  $("#lines").innerHTML = s.lines.map((l) => `<li class="${l.ok ? "ok" : "no"}">${esc(l.t)}</li>`).join("");
  $("#dims").innerHTML = Object.entries(sc.dims).map(([k, v]) => `<div class="dim"><span>${esc(k)}</span><span class="bar"><i class="${v < 60 ? "low" : ""}" style="width:${Math.max(3, v)}%"></i></span><span class="v">${v}</span></div>`).join("");
  $("#firstFix").textContent = s.first ? `가장 먼저 고칠 것: ${s.first}` : "";
  renderAnchor(sc.total);
}

// 같은 질문의 교수 채점 기준점(평범·보통·우수)과 내 위치
function renderAnchor(score) {
  const a = findAnchor(ANCHORS, st.q);
  $("#anchorBox").hidden = !a;
  if (!a) return;
  $("#anchorBadge").textContent = a.reviewed ? "교수 확정" : "교수 확정 전 초안";
  $("#anchorBadge").className = `badge-s ${a.reviewed ? "ok" : ""}`;
  $("#anchorPlace").textContent = placement(score, a.levels);
  const near = [...a.levels].sort((x, y) => Math.abs(x.score - score) - Math.abs(y.score - score))[0];
  $("#anchorLevels").innerHTML = a.levels.map((l) => `<details class="${l === near ? "mine" : ""}"><summary><span>${esc(l.level)}</span><b>${l.score}점</b></summary>
    <p class="cm">교수 한 줄평: ${esc(l.comment)}</p><p class="ans">${esc(l.answer)}</p></details>`).join("");
}

function renderStep() {
  const d = st.diag;
  $("#say").textContent = d.say;
  $("#aiState").hidden = true;
  if (d.ask && !d.retry) {
    $("#askBox").hidden = false; $("#buildBox").hidden = true;
    $("#ask2").textContent = d.ask;
    ["[data-mic=x]", "#x", "[data-state=x]", "#noIdea"].forEach((s) => ($(s).hidden = false));
    $("#x").value = ""; label("x", "말하기"); $("#addBtn").textContent = "추가하기";
  } else if (d.retry) {
    $("#askBox").hidden = false; $("#buildBox").hidden = true;
    $("#ask2").textContent = d.ask;
    ["[data-mic=x]", "#x", "[data-state=x]", "#noIdea"].forEach((s) => ($(s).hidden = true));
    $("#addBtn").textContent = "다시 답하기";
  } else {
    $("#askBox").hidden = true;
    prepareBuild(d.say);
  }
}

// ④ 부족한 것 하나 추가 → 개선 예상
$("#addBtn").addEventListener("click", () => {
  stopRec();
  if (st.diag.retry) { resetAnswer("질문에 맞춰 다시 답해 보세요.", st.diag.say); show("s2"); return; }
  const add = $("#x").value.trim();
  if (add.replace(/\s/g, "").length < 6) { speak("조금만 더 말해 주세요. 없으면 없어요를 눌러 주세요."); return; }
  st.transcript = mergeAnswer(st.transcript, add, st.diag.field);
  $("#askBox").hidden = true;
  prepareBuild("좋아요. 이 내용을 넣으면 훨씬 강해집니다.");
});
$("#noIdea").addEventListener("click", () => {
  stopRec();
  $("#askBox").hidden = true;
  prepareBuild(st.diag.kind === "experience"
    ? "괜찮아요. 큰 활동이 아니어도 됩니다. 수업, 조별과제, 동아리, 봉사 중 작은 일이라도 떠오르면 채워 보세요. 우선 그 자리를 비워 둔 답변을 만들어 드릴게요."
    : "괜찮아요. 우선 지금 내용으로 답변을 다듬어 드릴게요.");
});

function prepareBuild(say) {
  st.improved = improveAnswer({ transcript: st.transcript, question: st.q, dept: st.dept, type: st.type, target: TARGET });
  const ex = expectedScore({ answer: st.improved.answer, question: st.q, dept: st.dept, type: st.type, target: TARGET });
  st.expected = Math.max(ex.total, st.history[st.history.length - 1]);
  $("#buildBox").hidden = false;
  $("#buildSay").textContent = say;
  $("#expNow").textContent = st.history[st.history.length - 1];
  $("#expNext").textContent = st.expected;
}

// ⑤ 개선 답변
$("#buildBtn").addEventListener("click", async () => {
  renderBetter(st.improved.answer, st.improved.changes);
  show("s4");
  if (canDeep()) {
    const s = $("#aiState"); s.hidden = false;
    $("#changes").insertAdjacentHTML("afterbegin", `<li id="aiWait">AI 면접관이 다시 다듬고 있어요… (최대 1~2분)</li>`);
    try {
      const r = await callVoice({ question: st.q, transcript: st.transcript, dept: st.dept, type: st.type }, code());
      st.expected = r.after.total;
      renderBetter(r.answer, [...r.changes, `AI 면접관 예상 점수 ${r.after.total}점 (평가 ${r.rounds}회 반복)`]);
    } catch (err) { $("#aiWait")?.remove(); $("#changes").insertAdjacentHTML("beforeend", `<li>AI 다듬기를 못 했어요(${esc(err.message)}). 기본 개선 답변입니다.</li>`); }
  }
});
function renderBetter(answer, changes) {
  $("#better").value = answer;
  $("#changes").innerHTML = (changes || []).map((c) => `<li>${esc(c)}</li>`).join("");
  $("#offer").hidden = false;
  $("#survey").hidden = ls.get("voice.surveyed", false);
  $("#offerGain").textContent = `첫 답변 ${st.history[0]}점 → 개선 답변 ${st.expected}점`;
  $("#offerNote").textContent = CONFIG.beta ? "지금은 베타 기간이라 무료로 계속하실 수 있습니다." : "결제 기능은 준비 중입니다.";
}
$("#listen").addEventListener("click", () => speak($("#better").value.replace(/\[✎[^\]]*\]\.?/g, "")));
$("#again").addEventListener("click", () => {
  resetAnswer("이 답변을 떠올리며 다시 말해 보세요.", "외우지 말고 내 말로. 다시 말하면 점수가 기록됩니다.");
  show("s2"); speak("좋아요. 이제 다시 말해 보세요.");
});
$("#nextQ").addEventListener("click", () => {
  if (!gate()) return;
  const fu = QTYPES[st.type].followups;
  const q = fu[st.followIdx++ % fu.length]?.q || "방금 말한 내용을 뒷받침하는 다른 경험이 있나요?";
  setQuestion(q, st.type); show("s2");
  speak(`다음 질문입니다. ${q}`);
});
$("#offerBtn").addEventListener("click", () => { if (CONFIG.beta) $("#nextQ").click(); });

// ───────── 학생 검증 설문 ─────────
const survey = {};
document.querySelectorAll(".opts4").forEach((g) => g.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]"); if (!b) return;
  g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  survey[g.dataset.q] = b.dataset.v;
}));
$("#surveyBtn").addEventListener("click", () => {
  if (!survey.q1 || !survey.q2) { speak("두 질문에 답해 주세요."); return; }
  const rec = { at: new Date().toISOString(), question: st.q, q1: survey.q1, q2: survey.q2, q3: $("#q3").value.trim(), first: st.history[0], best: Math.max(...st.history, st.expected || 0) };
  const all = ls.get("voice.feedback", []); all.push(rec); ls.set("voice.feedback", all);
  if (CONFIG.feedbackUrl) {
    const url = CONFIG.feedbackUrl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(rec[k] ?? ""));
    window.open(url, "_blank", "noopener");
  }
  $("#surveyBtn").hidden = true; $("#surveyDone").hidden = false;
  ls.set("voice.surveyed", true);
});

function markUsed() { const u = used(); if (!u.includes(st.q)) { u.push(st.q); ls.set("voice.used", u); } }
function gate() {
  if (CONFIG.beta || used().length < FREE_QUESTIONS) return true;
  $("#offer").scrollIntoView({ behavior: "smooth" });
  return false;
}
