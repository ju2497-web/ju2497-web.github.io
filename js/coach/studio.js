import { CONFIG } from "./config.js";
import { decodeApplication, assignExperiences, buildForQuestion, applicationContext, targetFor, TIERS } from "./application.js";
import { evaluate, speakingScript, secondsOf } from "./engine.js";
import { validatePayload } from "./prompt.js";
import { canDeep, needsCode, callDeep, fromAI } from "./ai-call.js";
import { parseChatReply } from "./soomgo.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "studio.apps.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
let store = load();
let cur = null; // { app, items, overall, reviewed }
const persist = () => { try { if (cur) store[cur.app.id] = cur; localStorage.setItem(KEY, JSON.stringify(store)); } catch { alert("브라우저 저장 공간이 부족합니다. 오래된 신청서를 삭제하세요."); } };

const applyUrl = () => new URL("apply.html", location.href).href;
const GUIDE = () => `안녕하세요. 대학 입시 면접 답변 제작을 위해 아래 신청서를 작성해 주세요(약 5분).
${applyUrl()}

신청서에서 받는 내용
① 지원 대학 / 학과 / 전형
② 대학에서 공개한 면접 문항 전체(캡처·파일은 메시지로 따로 보내셔도 됩니다)
③ 학교생활기록부(정밀형만, 전체가 부담스러우면 활용하고 싶은 부분만)
④ 지원 학과를 선택한 이유(완성된 문장이 아니어도 됩니다)
⑤ 꼭 활용하고 싶은 경험 3~5개
⑥ 나의 강점
⑦ 면접에서 걱정되는 부분이나 강조하고 싶은 점

문장을 잘 쓰실 필요가 없습니다. 있었던 일을 사실대로 간단하게 적어 주세요.
작성을 마치면 나오는 ‘신청 코드’를 복사해 이 대화창으로 보내 주시면 됩니다.

답변은 단순한 모범답안이 아니라 질문의 평가 의도 → 지원자 경험 → 차별화된 답변 → 예상 꼬리질문 → 답변 보완 순서로 제작합니다.
※ 허위 경험이나 사실과 다른 내용을 만들어 답변에 넣지 않습니다.`;

const SAMPLE = {
  v: 1, id: "SAMPLE1", tier: "precise", createdAt: new Date().toISOString(),
  university: "예시대학교", department: "간호학과", track: "학생부종합(면접)", questionSource: "교수 제공 자료(예시)",
  questions: [], record: "[생명과학Ⅰ 세특] 항상성 단원에서 운동 전후 맥박·호흡수 변화를 측정하는 탐구를 설계하고 측정 조건을 통일해 오차를 줄임.",
  motive: "할머니 입원 때 간호사가 작은 변화를 먼저 알아채고 의사에게 알리는 걸 보고 간호가 전문직이라고 느꼈기",
  experiences: [
    { cat: "조별과제", text: "생명과학 조별과제에서 한 친구가 계속 자료를 늦게 줌. 처음엔 화냈는데 나중에 동생을 돌보고 있다는 걸 알게 됨. 역할을 다시 나눔." },
    { cat: "봉사", text: "요양원 봉사에서 어르신이 식사 도와드리려 하자 화를 내심. 낯선 사람이라 불편하셨던 것 같음. 천천히 설명하고 기다림. 다음 주엔 먼저 인사해 주심" },
    { cat: "실패 경험", text: "2학년 1학기 화학 성적 떨어짐. 틀린 문제 보니 계산 실수가 대부분이었음. 오답을 유형별로 정리하고 매일 5문제씩 연습. 2학기에 성적 오름. 원인을 찾으면 고칠 수 있다는 걸 배움" },
    { cat: "탐구활동", text: "생명과학 시간 운동 전후 맥박 측정 탐구. 측정값이 들쭉날쭉해서 측정 시간과 자세를 통일함. 정해진 방법을 지켜야 정확하다는 걸 배움" },
  ],
  strengths: ["꼼꼼함", "경청"], strengthNote: "", concerns: ["말이 길어짐"], concernNote: "", contact: { name: "예시 학생", reach: "010-0000-0000" }, agree: true,
};

// ───────── 불러오기 ─────────
function open(app) {
  if (CONFIG.blockedUniversities.includes((app.university || "").trim())) {
    alert("이해충돌 방지 대상 대학의 신청서입니다. 제작을 진행하지 않습니다.");
    return;
  }
  if (store[app.id] && !confirm("이미 불러온 신청서입니다. 다시 불러오면 작업한 답변이 초기화됩니다. 계속할까요?")) { select(app.id); return; }
  const items = assignExperiences(app).map((a) => buildForQuestion(app, a.question, a.expIndex));
  cur = { app, items, overall: "", reviewed: false };
  persist(); renderList(); render();
}
function select(id) { cur = store[id] || null; renderList(); render(); }
$("#btnLoad").addEventListener("click", () => {
  const text = $("#codeIn").value;
  let app;
  try { app = decodeApplication(text); }
  catch { try { app = parseChatReply(text); } catch (e) { alert(`불러오기 실패: 신청 코드(IVAPP1:…)나 ①~⑦ 양식 답장을 붙여 넣어 주세요.`); return; } }
  open(app); $("#codeIn").value = "";
});
$("#fileIn").addEventListener("change", async (e) => {
  try { open(JSON.parse(await e.target.files[0].text())); } catch (err) { alert(`파일을 읽지 못했습니다: ${err.message}`); }
  e.target.value = "";
});
$("#btnSample").addEventListener("click", async () => {
  const s = structuredClone(SAMPLE);
  try { s.questions = (await (await fetch(CONFIG.questionBankUrl)).json()).sets[0].questions; } catch { s.questions = ["친구나 다른 사람과 의견 차이로 갈등을 겪었던 경험을 말씀해 주세요."]; }
  delete store[s.id]; open(s);
});
$("#btnGuide").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(GUIDE()); alert("안내문을 복사했습니다. 숨고·카카오톡에 붙여 넣으세요."); }
  catch { prompt("아래 안내문을 복사하세요", GUIDE()); }
});
function renderList() {
  const ids = Object.keys(store);
  $("#appList").innerHTML = ids.length ? ids.map((id) => {
    const a = store[id].app;
    return `<option value="${esc(id)}" ${cur?.app.id === id ? "selected" : ""}>${esc(a.contact?.name || id)} · ${esc(a.university)} ${esc(a.department)}${store[id].reviewed ? " ✓" : ""}</option>`;
  }).join("") : `<option value="">불러온 신청서 없음</option>`;
}
$("#appList").addEventListener("change", (e) => e.target.value && select(e.target.value));
$("#btnDelApp").addEventListener("click", () => {
  if (!cur || !confirm("이 신청서와 작업한 답변을 이 브라우저에서 삭제할까요?")) return;
  delete store[cur.app.id]; cur = null; persist(); renderList(); render();
});

// ───────── 렌더 ─────────
function render() {
  $("#work").hidden = !cur;
  if (!cur) return;
  const a = cur.app;
  $("#summary").innerHTML = `<h2>${esc(a.contact?.name || "")} <small>${esc(a.id)} · ${esc(TIERS[a.tier]?.label || a.tier)} · ${esc((a.submittedAt || a.createdAt || "").slice(0, 10))}</small></h2>
    <div class="grid">
      <div><b>지원</b>${esc(a.university)} / ${esc(a.department)} / ${esc(a.track || "-")}</div>
      <div><b>연락처</b>${esc(a.contact?.reach || "-")}</div>
      <div><b>지원 이유</b>${esc(a.motive || "-")}</div>
      <div><b>강점</b>${esc([...(a.strengths || []), a.strengthNote].filter(Boolean).join(", ") || "-")}</div>
      <div><b>특별 요청</b>${esc([...(a.concerns || []), a.concernNote].filter(Boolean).join(", ") || "-")} <span class="hint">(목표 ${targetFor(a)}초)</span></div>
      <div><b>학생부</b>${a.record ? `${a.record.length}자 발췌` : "없음"} · <b>문항 출처</b>${esc(a.questionSource || "-")}</div>
    </div>
    <ol class="exps">${a.experiences.map((e) => `<li>[${esc(e.cat || "경험")}] ${esc(e.text)}</li>`).join("")}</ol>`;
  const avg = Math.round(cur.items.reduce((s, x) => s + x.score, 0) / (cur.items.length || 1));
  $("#avg").textContent = `${cur.items.length}문항 · 평균 ${avg}점`;
  $("#items").innerHTML = cur.items.map((it, i) => itemHtml(it, i)).join("");
  $$("#items textarea[data-act=edit]").forEach(grow);
  $("#overall").value = cur.overall || "";
  $("#reviewed").checked = !!cur.reviewed;
  $("#btnDeepAll").hidden = !canDeep();
  $("#codeWrap").hidden = !needsCode();
}
function itemHtml(it, i) {
  const a = cur.app;
  const opts = [`<option value="-1">경험 배정 없음</option>`, ...a.experiences.map((e, k) => `<option value="${k}" ${it.expIndex === k ? "selected" : ""}>경험 ${k + 1} [${esc(e.cat || "경험")}] ${esc(e.text.slice(0, 26))}…</option>`)].join("");
  return `<article class="item" data-i="${i}">
    <header>
      <div class="gauge mini" style="--p:${it.score}"><b>${it.score}</b></div>
      <div><div class="qt">Q${i + 1}. ${esc(it.question)}</div>
        <div class="meta">${esc(it.typeLabel)} · ${esc(it.competencies.join(", "))} · ${it.mode === "deep" ? "AI 심층" : "기본형"} · 말하기 약 ${secondsOf(it.answer)}초/${it.target}초</div></div>
    </header>
    <div class="ctrl">
      <select data-act="exp" aria-label="배정 경험">${opts}</select>
      <button class="ghost small" data-act="basic">기본형 다시</button>
      ${canDeep() ? `<button class="primary small" data-act="deep">AI 심층</button>` : ""}
      <button class="ghost small" data-act="rescore">고친 답변 채점</button>
    </div>
    <textarea data-act="edit" rows="6">${esc(it.answer)}</textarea>
    <div class="two">
      <div><h4>감점 요인</h4><ol class="issues">${it.issues.slice(0, 3).map((x) => `<li><b>${esc(x.title)}${x.lost ? `<span class="lost">-${x.lost}</span>` : ""}</b><span>${esc(x.fix)}</span></li>`).join("") || "<li class='none'>큰 감점 요인 없음</li>"}</ol></div>
      <div><h4>예상 꼬리질문</h4><ul>${it.followups.map((f) => `<li><b>${esc(f.q)}</b>${f.answer ? `<br>${esc(f.answer)}` : f.dir ? `<br><span class="hint">${esc(f.dir)}</span>` : ""}</li>`).join("")}</ul></div>
    </div>
    <details><summary>질문 의도 · 말하기 대본 · 코칭${it.fixes?.length ? " · AI 수정 이력" : ""}</summary>
      <p><b>질문 의도</b> ${esc(it.intent)}</p>
      <pre class="script">${esc(it.script)}</pre>
      <ul>${it.coaching.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      ${it.fixes?.length ? `<ul class="hint">${it.fixes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    </details>
  </article>`;
}
function grow(t) { t.style.height = "auto"; t.style.height = Math.max(140, t.scrollHeight + 4) + "px"; }

// ───────── 문항별 작업 ─────────
const itemOf = (el) => +el.closest(".item").dataset.i;
$("#items").addEventListener("input", (e) => {
  if (e.target.dataset.act !== "edit") return;
  const it = cur.items[itemOf(e.target)];
  it.answer = e.target.value; it.edited = true; grow(e.target); persist();
});
$("#items").addEventListener("change", (e) => {
  if (e.target.dataset.act !== "exp") return;
  const i = itemOf(e.target);
  cur.items[i] = buildForQuestion(cur.app, cur.items[i].question, +e.target.value);
  persist(); render();
});
$("#items").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const i = itemOf(b), it = cur.items[i];
  if (b.dataset.act === "basic") {
    if (it.edited && !confirm("직접 고친 답변을 새 초안으로 바꿀까요?")) return;
    cur.items[i] = buildForQuestion(cur.app, it.question, it.expIndex); persist(); render();
  } else if (b.dataset.act === "rescore") {
    const ev = evaluate(it.answer, it.question, cur.app.department, it.target, it.type);
    Object.assign(it, { score: ev.score, grade: ev.grade, issues: ev.issues, script: speakingScript(it.answer, []) });
    persist(); render();
  } else if (b.dataset.act === "deep") {
    b.disabled = true; b.textContent = "AI 작성 중…";
    try { await deep(i); } catch (err) { alert(`Q${i + 1} AI 심층 실패: ${err.message}`); }
    persist(); render();
  }
});

async function deep(i) {
  const it = cur.items[i], a = cur.app;
  const p = {
    question: it.question, university: a.university, department: a.department, track: a.track, year: "",
    fields: {}, targetSec: it.target, type: it.type, basicAnswer: it.answer, draft: "",
    context: applicationContext(a, it.expIndex),
  };
  const problem = validatePayload(p);
  if (problem) throw new Error(problem);
  const ai = await callDeep(p, $("#accessCode").value.trim());
  cur.items[i] = { ...fromAI(ai, it, p), question: it.question, expIndex: it.expIndex, target: it.target };
}
$("#btnDeepAll").addEventListener("click", async (e) => {
  if (!confirm(`${cur.items.length}개 문항을 AI 심층형으로 생성합니다. 학생 신청서 내용이 AI 분석에 사용됩니다. 진행할까요?`)) return;
  const b = e.currentTarget; b.disabled = true;
  for (let i = 0; i < cur.items.length; i++) {
    b.textContent = `AI 생성 중 ${i + 1}/${cur.items.length}…`;
    try { await deep(i); persist(); render(); } catch (err) { alert(`Q${i + 1} 실패: ${err.message} (기본형 유지)`); }
  }
  b.disabled = false; b.textContent = "전체 AI 심층 생성";
});
$("#btnRegenAll").addEventListener("click", () => {
  if (cur.items.some((x) => x.edited || x.mode === "deep") && !confirm("직접 고치거나 AI로 만든 답변도 기본형으로 다시 만들까요?")) return;
  cur.items = assignExperiences(cur.app).map((x) => buildForQuestion(cur.app, x.question, x.expIndex));
  persist(); render();
});
$("#accessCode").addEventListener("change", () => { try { localStorage.setItem("coach.code", JSON.stringify($("#accessCode").value.trim())); } catch {} });
try { $("#accessCode").value = JSON.parse(localStorage.getItem("coach.code") || '""'); } catch {}

// ───────── 학생 전달 문서 ─────────
$("#overall").addEventListener("input", (e) => { cur.overall = e.target.value; persist(); });
$("#reviewed").addEventListener("change", (e) => { cur.reviewed = e.target.checked; persist(); renderList(); });

function docText() {
  const a = cur.app;
  const holes = cur.items.reduce((n, x) => n + (x.answer.match(/\[✎/g) || []).length, 0);
  return `면접 답변 노트 — ${a.contact?.name || ""}
${a.university} / ${a.department} / ${a.track || ""}
작성일: ${new Date().toLocaleDateString("ko-KR")}${cur.reviewed ? " · 교수 검수 완료" : ""}
${cur.overall ? `\n[교수 총평]\n${cur.overall}\n` : ""}${holes ? `\n※ [✎ …] 표시는 신청서에 없던 내용입니다. 본인의 실제 경험으로 채워 연습하세요.\n` : ""}
${cur.items.map((it, i) => `────────────────────────
Q${i + 1}. ${it.question}
(평가역량: ${it.competencies.join(", ")} · 목표 ${it.target}초)

■ 질문 의도
${it.intent}

■ 답변
${it.answer}

■ 말하기 대본  ( / 쉬기 · 【 】 강조)
${it.script}

■ 예상 꼬리질문
${it.followups.map((f, k) => `${k + 1}) ${f.q}${f.answer ? `\n   → ${f.answer}` : f.dir ? `\n   → 답변 방향: ${f.dir}` : ""}`).join("\n")}

■ 연습 포인트
${it.coaching.slice(0, 4).map((c) => `- ${c}`).join("\n")}`).join("\n\n")}

────────────────────────
※ 답변은 지원자 본인의 실제 경험을 바탕으로 구성했으며, 허위 내용은 넣지 않았습니다. 외우기보다 키워드로 말하는 연습을 권합니다.
※ 본 자료는 공개된 면접 문항을 활용한 면접 훈련 자료이며, 특정 대학의 평가와 관계가 없습니다.`;
}
$("#btnDoc").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([docText()], { type: "text/plain;charset=utf-8" }));
  a.download = `면접답변노트_${cur.app.contact?.name || cur.app.id}.txt`; a.click();
});
$("#btnDocCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(docText()); alert("복사했습니다."); } catch { alert("복사 실패: 문서 저장을 이용하세요."); } });
$("#btnPrint").addEventListener("click", () => { $("#printArea").textContent = docText(); window.print(); });

renderList();
const first = Object.keys(store)[0];
if (first) select(first);
