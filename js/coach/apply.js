import { CONFIG } from "./config.js";
import { emptyApplication, encodeApplication, checkApplication, EXP_CATS, STRENGTHS, CONCERNS, TIERS } from "./application.js";
import { parseQuestions } from "../interview-engine.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "apply.draft.v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(app)); } catch { /* 저장 불가 */ } };

let app = { ...emptyApplication(), ...(load() || {}) };
let bank = [];
const f = $("#f");

// ───────── 렌더 ─────────
function renderTiers() {
  $("#tiers").innerHTML = Object.entries(TIERS).map(([k, t]) => `<label class="tier ${app.tier === k ? "on" : ""}">
    <span><input type="radio" name="tier" value="${k}" ${app.tier === k ? "checked" : ""}> <b>${t.label}</b></span><span class="hint">${t.desc}</span></label>`).join("");
  $("#recordBox").hidden = !TIERS[app.tier].needsRecord;
}
function renderExps() {
  $("#exps").innerHTML = app.experiences.map((e, i) => `<div class="exp" data-i="${i}">
    <header><b>경험 ${i + 1}</b>${app.experiences.length > 1 ? `<button type="button" class="ghost rm" data-act="rm">삭제</button>` : ""}</header>
    <div class="cats">${EXP_CATS.map((c) => `<button type="button" data-cat="${esc(c)}" class="${e.cat === c ? "on" : ""}">${esc(c)}</button>`).join("")}</div>
    <textarea rows="3" data-f="text" placeholder="있었던 일을 짧게: 언제·어디서 / 무슨 일 / 내가 한 것 / 결과·느낀 점">${esc(e.text)}</textarea></div>`).join("");
  $("#addExp").hidden = app.experiences.length >= 5;
}
function renderPick(id, list, sel, ordered) {
  $(id).innerHTML = list.map((x) => {
    const i = sel.indexOf(x);
    return `<button type="button" data-v="${esc(x)}" class="${i >= 0 ? "on" : ""}">${esc(x)}${ordered && i >= 0 ? `<span class="ord">${i + 1}</span>` : ""}</button>`;
  }).join("");
}
function fillForm() {
  for (const k of ["university", "department", "track", "questionSource", "record", "motive", "strengthNote", "concernNote"]) f[k].value = app[k] || "";
  f.questionsRaw.value = app.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  f.name.value = app.contact.name; f.reach.value = app.contact.reach; f.agree.checked = !!app.agree;
  renderTiers(); renderExps();
  renderPick("#strengths", STRENGTHS, app.strengths, true);
  renderPick("#concerns", CONCERNS, app.concerns, false);
  updateProgress();
}

function updateProgress() {
  const { miss, expCount } = checkApplication(app);
  const total = 6, done = total - Math.min(miss.length, total);
  $("#bar").style.width = `${Math.round((done / total) * 100)}%`;
  $("#progressText").textContent = miss.length ? `남은 항목: ${miss.join(", ")}` : `모든 필수 항목을 채웠습니다.${expCount < 3 ? " 경험을 3개 이상 적으면 문항마다 더 잘 맞는 경험을 쓸 수 있습니다." : ""}`;
  $("#qCount").textContent = app.questions.length ? `${app.questions.length}개 문항으로 나눴습니다.` : "";
}

// ───────── 입력 ─────────
f.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.f === "text") app.experiences[+t.closest(".exp").dataset.i].text = t.value;
  else if (t.name === "questionsRaw") app.questions = parseQuestions(t.value);
  else if (t.name === "name" || t.name === "reach") app.contact[t.name] = t.value;
  else if (t.name === "agree") app.agree = t.checked;
  else if (t.name === "tier") { app.tier = t.value; renderTiers(); }
  else if (t.name in app) app[t.name] = t.value;
  if (t.name === "university" || t.name === "department") checkBank();
  persist(); updateProgress();
});
f.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const exp = b.closest(".exp");
  if (exp && b.dataset.cat) { const x = app.experiences[+exp.dataset.i]; x.cat = x.cat === b.dataset.cat ? "" : b.dataset.cat; renderExps(); }
  else if (exp && b.dataset.act === "rm") { app.experiences.splice(+exp.dataset.i, 1); renderExps(); }
  else if (b.closest("#strengths")) { toggle(app.strengths, b.dataset.v); renderPick("#strengths", STRENGTHS, app.strengths, true); }
  else if (b.closest("#concerns")) { toggle(app.concerns, b.dataset.v); renderPick("#concerns", CONCERNS, app.concerns, false); }
  else return;
  persist(); updateProgress();
});
function toggle(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
$("#addExp").addEventListener("click", () => { if (app.experiences.length < 5) { app.experiences.push({ cat: "", text: "" }); renderExps(); persist(); } });

// 공개문항 DB에서 같은 대학·학과를 찾으면 불러오기 제안
async function loadBank() {
  try { bank = (await (await fetch(CONFIG.questionBankUrl, { cache: "no-cache" })).json()).sets || []; } catch { bank = []; }
  bank = bank.filter((s) => !CONFIG.blockedUniversities.includes(s.university) && s.university !== "공통 유형");
  $("#univList").innerHTML = [...new Set(bank.map((s) => s.university))].map((u) => `<option value="${esc(u)}">`).join("");
  $("#deptList").innerHTML = [...new Set(bank.map((s) => s.department))].map((d) => `<option value="${esc(d)}">`).join("");
  checkBank();
}
function checkBank() {
  const u = (app.university || "").trim(), d = (app.department || "").trim();
  const blocked = CONFIG.blockedUniversities.includes(u);
  const hit = bank.filter((s) => s.university === u && s.department === d).sort((a, b) => (b.year || 0) - (a.year || 0))[0];
  const box = $("#bankHit");
  if (blocked) { box.hidden = false; box.textContent = "이해충돌 방지를 위해 이 대학 지원자의 면접 답변 제작은 진행하지 않습니다. 양해 부탁드립니다."; return; }
  if (!hit) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `${esc(hit.year)}년 ${esc(hit.track || "")} 공개 문항 ${hit.questions.length}개를 찾았습니다. <button type="button" id="useBank" class="primary small">이 문항 불러오기</button>`;
  $("#useBank").onclick = () => {
    app.questions = [...hit.questions]; app.track = app.track || hit.track || ""; app.questionSource = hit.source || "";
    fillForm(); persist();
  };
}

// ───────── 제출 ─────────
$("#btnSubmit").addEventListener("click", () => {
  const { miss } = checkApplication(app);
  if (CONFIG.blockedUniversities.includes((app.university || "").trim())) { alert("이 대학 지원자의 면접 답변 제작은 진행하지 않습니다."); return; }
  if (miss.length) {
    $("#missing").hidden = false;
    $("#missing").textContent = `아래 항목을 채워 주세요: ${miss.join(", ")}`;
    $("#missing").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  $("#missing").hidden = true;
  app.submittedAt = new Date().toISOString();
  app.experiences = app.experiences.filter((e) => e.text.trim());
  if (app.tier === "basic") app.record = "";
  persist();
  const code = encodeApplication(app);
  $("#code").value = `[면접답변 제작 신청] ${app.contact.name} / ${app.university} ${app.department}\n${code}`;
  $("#preview").textContent = previewText();
  const mail = $("#btnMail");
  mail.hidden = !CONFIG.reviewContact;
  if (CONFIG.reviewContact) mail.href = `mailto:${CONFIG.reviewContact}?subject=${encodeURIComponent(`[면접답변 제작 신청] ${app.contact.name}`)}&body=${encodeURIComponent($("#code").value.slice(0, 1800))}`;
  f.hidden = true; $("#done").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});
function previewText() {
  return `신청번호 ${app.id} · ${TIERS[app.tier].label}
지원: ${app.university} / ${app.department} / ${app.track || "-"}
공개문항 ${app.questions.length}개
${app.questions.map((q, i) => `  ${i + 1}. ${q}`).join("\n")}
지원 이유: ${app.motive}
대표 경험:
${app.experiences.map((e, i) => `  ${i + 1}. [${e.cat || "경험"}] ${e.text}`).join("\n")}
강점: ${[...app.strengths, app.strengthNote].filter(Boolean).join(", ") || "-"}
특별 요청: ${[...app.concerns, app.concernNote].filter(Boolean).join(", ") || "-"}${app.record ? `\n학생부 발췌: ${app.record.length}자` : ""}`;
}
$("#btnCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#code").value); $("#btnCopy").textContent = "복사했습니다"; } catch { $("#code").select(); document.execCommand("copy"); }
});
$("#btnFile").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(app, null, 2)], { type: "application/json" }));
  a.download = `면접신청서_${app.contact.name || app.id}.json`; a.click();
});
$("#btnEdit").addEventListener("click", () => { $("#done").hidden = true; f.hidden = false; if (!app.experiences.length) app.experiences.push({ cat: "", text: "" }); fillForm(); });
$("#btnReset").addEventListener("click", () => {
  if (!confirm("작성한 내용을 모두 지우고 처음부터 다시 쓸까요?")) return;
  app = emptyApplication(); persist(); fillForm(); checkBank();
});

fillForm();
loadBank();
