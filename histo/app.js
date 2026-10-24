// 진단조직학 기출 마스터: 챕터 학습 · 모의고사 · 오답노트. 서버 없이 동작하며 진도는 이 기기에만 저장됩니다.
import { CONFIG } from "./config.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = (n) => `${n.toLocaleString("ko-KR")}원`;
const KEY = { code: "histo.code", prog: "histo.progress", wrong: "histo.wrong" };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } },
};
let DATA = null, PROG = store.get(KEY.prog, {}), WRONG = store.get(KEY.wrong, {});

// ---------- 집계(선택)
function analytics() {
  if (CONFIG.goatcounter) { const s = document.createElement("script"); s.async = true; s.src = "https://gc.zgo.at/count.js"; s.dataset.goatcounter = `https://${CONFIG.goatcounter}.goatcounter.com/count`; document.head.append(s); }
  if (CONFIG.ga4) { const s = document.createElement("script"); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.ga4}`; document.head.append(s); window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; gtag("js", new Date()); gtag("config", CONFIG.ga4); }
}
function track(ev, label) { try { if (window.goatcounter?.count) window.goatcounter.count({ path: `histo/${ev}${label ? "/" + label : ""}`, title: `histo ${ev}`, event: true }); if (window.gtag && CONFIG.ga4) gtag("event", `histo_${ev}`, { label: label || "" }); } catch { /* 무시 */ } }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 1800); }

// ---------- 이용 코드(하드 페이월)
const normCode = (c) => (c || "").trim().toUpperCase().replace(/\s+/g, "");
async function sha256(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
async function hasAccess(code = store.get(KEY.code, "")) { const c = normCode(code); if (!c || !crypto.subtle) return false; try { return CONFIG.access.hashes.includes(await sha256(c)); } catch { return false; } }
const isFree = (ch) => CONFIG.freeChapters.includes(ch);
function paywall(onUnlock) {
  let dlg = $("#payDlg");
  if (!dlg) {
    document.body.insertAdjacentHTML("beforeend", `
    <dialog id="payDlg"><div class="form">
      <h2>이용 코드가 필요합니다</h2>
      <p class="hint">${esc(CONFIG.payNote)}</p>
      <div class="plans"><div class="plan"><b>이용권</b><span class="won">${won(CONFIG.price)}</span><br>${esc(CONFIG.period)} · 전 챕터 ${DATA.total}문항 · 사진 문항 · 해설과 필기·실기 연계 · 모의고사 · 오답노트</div></div>
      <div class="actions" id="payLinks"></div>
      <label>이용 코드 입력<input id="payCode" type="text" autocomplete="off" placeholder="HM-○○○○-○○○○"></label>
      <p id="payMsg" class="warn" hidden></p>
      <div class="actions"><button id="payOk" class="primary">코드 확인하고 계속하기</button><button id="payClose" class="ghost">닫기</button></div>
    </div></dialog>`);
    dlg = $("#payDlg");
    $("#payLinks").innerHTML = [["kmong", "크몽에서 결제"], ["smartstore", "스마트스토어에서 결제"]].filter(([k]) => CONFIG.payLinks[k]).map(([k, t]) => `<a class="btn primary" target="_blank" rel="noopener" href="${esc(CONFIG.payLinks[k])}">${t}</a>`).join("") || `<p class="hint">결제 안내는 프로필·채팅으로 드립니다.</p>`;
  }
  $("#payCode").value = store.get(KEY.code, ""); $("#payMsg").hidden = true;
  dlg.showModal();
  $("#payOk").onclick = async () => { const c = normCode($("#payCode").value); if (await hasAccess(c)) { store.set(KEY.code, c); dlg.close(); toast("이용 코드가 확인되었습니다"); track("unlock"); onUnlock && onUnlock(); } else { $("#payMsg").hidden = false; $("#payMsg").textContent = c ? "이용 코드가 맞지 않습니다. 결제 후 받으신 코드를 그대로 입력해 주세요." : "이용 코드를 입력해 주세요."; } };
  $("#payClose").onclick = () => dlg.close();
}

// ---------- 데이터
async function loadData() {
  const r = await fetch("data/questions.json"); const d = await r.json();
  d.byId = {}; d.all = [];
  for (const c of d.chapters) for (const q of c.questions) { d.byId[q.id] = q; d.all.push(q); }
  for (const q of d.appendix.questions) { d.byId[q.id] = q; d.all.push(q); }
  d.total = d.all.length;
  return d;
}
const kindName = (k) => ({ w: "필기", p: "실기", a: "판독" }[k]);
const tag = (q) => `${q.year}년 Q${q.qn}`;

// ---------- 진도
function chapterStats(qs) { let done = 0, right = 0; for (const q of qs) { const p = PROG[q.id]; if (p) { done++; if (p.ok) right++; } } return { done, right, n: qs.length }; }
function record(q, pick) {
  const ok = pick === q.answer;
  PROG[q.id] = { pick, ok, t: Date.now() }; store.set(KEY.prog, PROG);
  if (ok) { if (WRONG[q.id]) { WRONG[q.id] = Math.max(0, WRONG[q.id] - 1); if (!WRONG[q.id]) delete WRONG[q.id]; } } else WRONG[q.id] = (WRONG[q.id] || 0) + 1;
  store.set(KEY.wrong, WRONG);
  return ok;
}

// ---------- 화면
const app = $("#app");
function home() {
  location.hash = "";
  const all = chapterStats(DATA.all);
  const wrongN = Object.keys(WRONG).length;
  const chaps = DATA.chapters.map((c) => {
    const s = chapterStats(c.questions); const w = c.questions.filter((q) => q.kind === "w").length, p = c.questions.length - w;
    return `<button class="chap" data-ch="${c.n}"><span class="n">${String(c.n).padStart(2, "0")}</span><span class="t"><b>${esc(c.title)}</b><span>필기 ${w} · 실기 ${p} · ${esc(c.freq)}</span><span class="bar"><i style="width:${s.n ? Math.round(100 * s.done / s.n) : 0}%"></i></span></span><span class="lock">${isFree(c.n) ? "무료" : "🔒"}</span></button>`;
  }).join("");
  const a = DATA.appendix; const as = chapterStats(a.questions);
  app.innerHTML = `
    <section class="hero"><h1>${esc(CONFIG.serviceName)}</h1><p>${esc(CONFIG.subtitle)}</p>
      <div class="stats"><div class="stat"><b>${all.done}</b><span>푼 문항 / ${DATA.total}</span></div><div class="stat"><b>${all.done ? Math.round(100 * all.right / all.done) : 0}%</b><span>정답률</span></div><div class="stat"><b>${wrongN}</b><span>오답노트</span></div></div>
      <div class="modes"><button class="primary" id="btnMock">모의고사 ${CONFIG.mock.count}문항</button><button id="btnWrong" ${wrongN ? "" : "disabled"}>오답노트 다시 풀기</button><button id="btnRep">반복 출제 개념 ${DATA.repeated.length}</button><button id="btnReset" class="ghost">진도 초기화</button></div>
    </section>
    <section class="card"><h2>챕터 학습</h2><p class="hint">핵심정리를 읽고 필기 문항을 푼 뒤, 같은 개념을 사진으로 묻는 실기 문항을 이어서 풉니다. 고른 즉시 정답과 해설이 나옵니다.</p>
      <div class="chapters">${chaps}
        <button class="chap" data-ch="A"><span class="n">A</span><span class="t"><b>부록 ${esc(a.title)}</b><span>실기 ${a.questions.length}문항 · 장기 육안·상피·괴사</span><span class="bar"><i style="width:${as.n ? Math.round(100 * as.done / as.n) : 0}%"></i></span></span><span class="lock">${isFree("A") ? "무료" : "🔒"}</span></button>
      </div></section>
    <p class="foot">대학에서 조직검사학을 가르치는 현직 교수가 1983~2025년 기출을 검증해 만들었습니다. 입력한 답과 진도는 이 기기에만 저장됩니다.<br>원본 사진이 없는 문항은 같은 개념의 참고 사진으로 대신했고, 출처를 사진 아래에 적었습니다.</p>`;
  app.querySelectorAll(".chap").forEach((b) => b.onclick = () => openChapter(b.dataset.ch === "A" ? "A" : Number(b.dataset.ch)));
  $("#btnMock").onclick = () => gate(null, startMock);
  $("#btnWrong").onclick = () => startWrong();
  $("#btnRep").onclick = () => repeated();
  $("#btnReset").onclick = () => { if (confirm("푼 기록과 오답노트를 모두 지울까요?")) { PROG = {}; WRONG = {}; store.set(KEY.prog, PROG); store.set(KEY.wrong, WRONG); home(); } };
}
async function gate(ch, run) {
  if ((ch !== null && isFree(ch)) || await hasAccess()) run(); else { track("paywall", String(ch ?? "mock")); paywall(run); }
}
function chapterOf(ch) { return ch === "A" ? DATA.appendix : DATA.chapters.find((c) => c.n === ch); }
function openChapter(ch) {
  gate(ch, () => {
    const c = chapterOf(ch); const s = chapterStats(c.questions);
    const boxes = (c.boxes || []).map((b) => `<div class="box ${b.title.startsWith("핵심") ? "key" : "trap"}"><b class="h">${esc(b.title)}</b><ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
    app.innerHTML = `
      <section class="card"><h2>${ch === "A" ? "부록 A. " : `Chapter ${ch}. `}${esc(c.title)}</h2>
        ${c.freq ? `<p class="hint">출제빈도 ${esc(c.freq)}</p>` : ""}${c.core ? `<p><b>한 문장 핵심</b> ${esc(c.core)}</p>` : ""}${c.intro ? `<p class="hint">${esc(c.intro)}</p>` : ""}
        ${boxes}${c.pattern ? `<p class="hint" style="margin-top:10px"><b>출제패턴</b> ${esc(c.pattern)}</p>` : ""}
        <p class="prog">${s.done}/${s.n} 문항 풀었음 · 정답 ${s.right}</p>
        <div class="actions"><button class="primary" id="goAll">처음부터 풀기</button><button id="goRest" ${s.done < s.n ? "" : "disabled"}>안 푼 문항부터</button><button id="goW">필기만</button><button id="goP">실기만</button></div>
        <button class="wide ghost" id="goHome">← 홈</button></section>`;
    $("#goAll").onclick = () => runQuiz(c.questions, `${ch === "A" ? "부록 A" : `Ch ${ch}`} 학습`, "study");
    $("#goRest").onclick = () => runQuiz(c.questions.filter((q) => !PROG[q.id]), `${ch === "A" ? "부록 A" : `Ch ${ch}`} 안 푼 문항`, "study");
    $("#goW").onclick = () => runQuiz(c.questions.filter((q) => q.kind === "w"), `Ch ${ch} 필기`, "study");
    $("#goP").onclick = () => runQuiz(c.questions.filter((q) => q.kind !== "w"), `Ch ${ch} 실기`, "study");
    $("#goHome").onclick = home;
    track("chapter", String(ch));
  });
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startMock() {
  const n = CONFIG.mock.count; const w = shuffle(DATA.all.filter((q) => q.kind === "w")).slice(0, Math.round(n * 0.6)); const p = shuffle(DATA.all.filter((q) => q.kind !== "w")).slice(0, n - w.length);
  track("mock"); runQuiz(shuffle(w.concat(p)), `모의고사 ${n}문항`, "mock");
}
function startWrong() { const qs = Object.keys(WRONG).map((id) => DATA.byId[id]).filter(Boolean); if (!qs.length) return toast("오답노트가 비어 있습니다"); track("wrong"); runQuiz(shuffle(qs), "오답노트", "study"); }

function runQuiz(qs, title, mode) {
  if (!qs.length) return toast("풀 문항이 없습니다");
  let i = 0; const answers = []; const t0 = Date.now();
  const render = () => {
    const q = qs[i]; const picked = answers[i];
    const opts = q.options.map(([m, t]) => { let cls = "opt"; if (picked !== undefined) { if (m === q.answer) cls += " ok"; else if (m === picked) cls += " bad"; } return `<button class="${cls}" data-m="${m}" ${picked !== undefined ? "disabled" : ""}><span class="m">${m}</span><span>${esc(t)}</span></button>`; }).join("");
    const expl = picked === undefined ? "" : `
      <p class="verdict ${picked === q.answer ? "ok" : "bad"}">${picked === q.answer ? "정답입니다" : `오답입니다. 정답 ${esc(q.answerText)}`}</p>
      <div class="expl">${q.reading ? `<p><b class="l">사진 판독</b> ${esc(q.reading)}</p>` : ""}<p><b class="l">해설</b> ${esc(q.expl)}</p>${(q.links || []).map((l) => `<p><b class="l">${q.kind === "w" ? "실기·필기 연계" : "필기 연계"}</b> ${esc(l)}</p>`).join("")}${q.note ? `<p><b class="l">현대 실무 참고</b> ${esc(q.note)}</p>` : ""}</div>`;
    app.innerHTML = `
      <section class="card q">
        <div class="meta"><span><span class="tag">${kindName(q.kind)}</span> ${esc(tag(q))}${q.ref ? " · 참고 사진" : ""}</span><span>${i + 1} / ${qs.length}</span></div>
        <div class="stem">${esc(q.stem)}</div>
        ${q.img ? `<div class="photo"><img src="${esc(q.img)}" alt="문항 사진" loading="lazy"><div class="cap">${esc(q.caption || "")}</div></div>` : ""}
        <div class="opts">${opts}</div>${expl}
        <div class="nav"><button id="prev" ${i ? "" : "disabled"}>이전</button><button id="next" class="primary">${i + 1 < qs.length ? (picked === undefined ? "건너뛰기" : "다음") : "결과 보기"}</button></div>
        <p class="prog">${esc(title)} · 맞힘 ${answers.filter((a, k) => a === qs[k].answer).length} / 푼 ${answers.filter((a) => a !== undefined).length}</p>
        <button class="wide ghost" id="quit">그만하고 홈으로</button>
      </section>`;
    app.querySelectorAll(".opt").forEach((b) => b.onclick = () => { answers[i] = b.dataset.m; record(q, b.dataset.m); render(); window.scrollTo({ top: app.querySelector(".verdict")?.offsetTop - 120 || 0, behavior: "smooth" }); });
    $("#prev").onclick = () => { i--; render(); window.scrollTo(0, 0); };
    $("#next").onclick = () => { if (i + 1 < qs.length) { i++; render(); window.scrollTo(0, 0); } else result(); };
    $("#quit").onclick = home;
  };
  const result = () => {
    const done = answers.filter((a) => a !== undefined).length; const right = answers.filter((a, k) => a === qs[k].answer).length;
    const min = Math.round((Date.now() - t0) / 60000);
    const rows = qs.map((q, k) => `<tr><td>${k + 1}</td><td>${kindName(q.kind)} ${esc(tag(q))}</td><td>${answers[k] === undefined ? "–" : answers[k] === q.answer ? "○" : `× (${esc(q.answer)})`}</td></tr>`).join("");
    app.innerHTML = `<section class="card result"><h2>${esc(title)} 결과</h2><div class="big">${done ? Math.round(100 * right / done) : 0}점</div><p class="hint">${right} / ${qs.length} 정답 · ${done}문항 응답 · ${min}분${mode === "mock" ? " · 국가시험 합격 기준은 과목별 40%, 전 과목 평균 60% 이상입니다" : ""}</p>
      <div class="actions"><button class="primary" id="again">틀린 문항 다시 풀기</button><button id="home">홈으로</button></div>
      <table><tr><th>#</th><th>문항</th><th>결과</th></tr>${rows}</table></section>`;
    $("#again").onclick = () => { const w = qs.filter((q, k) => answers[k] !== q.answer); if (!w.length) return toast("틀린 문항이 없습니다"); runQuiz(w, `${title} 오답`, "study"); };
    $("#home").onclick = home;
    track("result", mode);
  };
  render(); window.scrollTo(0, 0);
}
function repeated() {
  app.innerHTML = `<section class="card rep"><h2>실기에서 반복 출제된 개념 ${DATA.repeated.length}가지</h2><p class="hint">같은 개념이 여러 해에 사진만 바꿔 다시 나왔습니다. 챕터를 공부하기 전에 이 표부터 외웁니다.</p>
    <table><tr><th>개념</th><th>실기 출제</th><th>필기 연계</th></tr>${DATA.repeated.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</table>
    <button class="wide ghost" id="goHome">← 홈</button></section>`;
  $("#goHome").onclick = home;
}

// ---------- 시작
(async function main() {
  analytics();
  try { DATA = await loadData(); } catch (e) { app.innerHTML = `<p class="warn">문항 데이터를 불러오지 못했습니다. 파일로 직접 열면 동작하지 않습니다. 웹 주소로 열어 주세요.</p>`; return; }
  $("#brand").textContent = CONFIG.serviceName;
  $("#btnHome").onclick = home;
  $("#btnCode").onclick = () => paywall(() => home());
  home();
})();
