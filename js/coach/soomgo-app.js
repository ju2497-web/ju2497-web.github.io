import { CONFIG } from "./config.js";
import { textHasBlocked } from "./blocked.js";
import { parseRequest, triage, breakEven, quoteMessage, MATERIALS_MESSAGE, FOLLOWUP_MESSAGE, DELIVERY_MESSAGE, REVIEW_MESSAGE, FAQ,
  detectMode, parseThesisRequest, triageThesis, thesisQuote, THESIS_MATERIALS_MESSAGE, THESIS_FOLLOWUP_MESSAGE, THESIS_DELIVERY_MESSAGE, THESIS_REVIEW_MESSAGE, THESIS_FAQ } from "./soomgo.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LOG = "soomgo.log.v1";
const today = () => new Date().toISOString().slice(0, 10);
const readLog = () => { try { return JSON.parse(localStorage.getItem(LOG)) || {}; } catch { return {}; } };
const writeLog = (v) => { try { localStorage.setItem(LOG, JSON.stringify(v)); } catch {} };

function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1500); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast("복사했습니다"); } catch { prompt("복사하세요", text); } }

let req = null, mode = "interview", refuseNow = false;
function setMode(m) {
  mode = m;
  $("#ivFields").hidden = m !== "interview"; $("#thFields").hidden = m !== "thesis"; $("#codeRow").hidden = m !== "interview";
  $("#modeLabel").textContent = m === "thesis" ? "논문 컨설팅으로 판정했습니다. 아래 칸을 고치면 견적이 다시 조립됩니다." : "대입 면접으로 판정했습니다. 아래 칸을 고치면 견적이 다시 조립됩니다.";
  $("#delTitle").textContent = m === "thesis" ? "정밀진단 리포트 전달" : "답변 노트 전달 + 앱 이용 코드";
  $("#revTitle").textContent = m === "thesis" ? "상담 뒤 리뷰 요청(1회만)" : "면접 뒤 리뷰 요청(1회만)";
  renderFaq();
}
async function run() {
  const text = $("#req").value.trim();
  if (!text) { $("#req").focus(); return; }
  const chosen = $("#mode").value;
  const m = chosen === "auto" ? (detectMode(text) === "thesis" ? "thesis" : "interview") : chosen;
  setMode(m);
  let t;
  if (m === "thesis") {
    req = parseThesisRequest(text); t = triageThesis(text, req);
    $("#tDegree").value = req.degree; $("#tField").value = req.field; $("#tStage").value = req.stage; $("#tDeadline").value = req.deadline;
    const be = CONFIG.thesis.plans.filter((p) => !p.from).map((p) => `${p.name} ${p.price.toLocaleString()}원은 약 ${breakEven(p.price).rate}%`).join(", ");
    $("#cash").textContent = `견적 1건 약 ${CONFIG.soomgo.quoteCash.toLocaleString()}캐시(요청마다 다름). 견적 비용만 메우는 데 필요한 성사율은 ${be}입니다.`;
  } else {
    req = parseRequest(text); t = triage(text, req, await textHasBlocked(text));
    $("#fUniv").value = req.univ; $("#fDept").value = req.dept; $("#fTrack").value = req.track; $("#fDate").value = req.interview;
    const be = CONFIG.soomgo.plans.filter((p) => !p.entry).map((p) => `${p.name} ${p.price.toLocaleString()}원은 약 ${breakEven(p.price).rate}%`).join(", ");
    $("#cash").textContent = `견적 1건 약 ${CONFIG.soomgo.quoteCash.toLocaleString()}캐시(요청마다 다름). 견적 비용만 메우는 데 필요한 성사율은 ${be}입니다.`;
  }
  $("#out").hidden = false;
  const v = $("#verdict"); v.textContent = t.verdict; v.className = `vbadge ${t.verdict}`;
  $("#why").innerHTML = `<ul>${(t.plus || []).map((p) => `<li class="plus">${esc(p)}</li>`).join("")}${t.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
  refuseNow = t.verdict === "거절";
  refresh();
}
function refresh() {
  if (!req) return;
  if (mode === "thesis") {
    const r = { ...req, degree: $("#tDegree").value.trim(), field: $("#tField").value.trim(), stage: $("#tStage").value.trim(), deadline: $("#tDeadline").value.trim() };
    $("#quote").value = refuseNow ? "이 요청은 견적을 보내지 않는 것을 권합니다(대필·탐지 회피·통과 보장 요구)." : thesisQuote(r);
    $("#materials").value = THESIS_MATERIALS_MESSAGE();
    $("#followup").value = THESIS_FOLLOWUP_MESSAGE(r);
    $("#delivery").value = THESIS_DELIVERY_MESSAGE(r);
    $("#review").value = THESIS_REVIEW_MESSAGE();
  } else {
    const r = { ...req, univ: $("#fUniv").value.trim(), dept: $("#fDept").value.trim(), track: $("#fTrack").value.trim(), interview: $("#fDate").value.trim() };
    $("#quote").value = refuseNow
      ? "이 요청은 견적을 보내지 않는 것을 권합니다(허위 경험 요청 또는 이해충돌 대상)."
      : quoteMessage(r, { extra: req.wantsZoom ? "실전 연습을 원하신다고 하셔서, 답변 노트와 함께 줌 모의면접을 함께 진행하시는 것을 권해 드립니다." : "" });
    $("#materials").value = MATERIALS_MESSAGE();
    $("#followup").value = FOLLOWUP_MESSAGE(r);
    $("#delivery").value = DELIVERY_MESSAGE(r, $("#fCode").value.trim().toUpperCase());
    $("#review").value = REVIEW_MESSAGE(r);
  }
  $("#qLen").textContent = `${$("#quote").value.replace(/\s/g, "").length}자`;
}
$("#btnRun").addEventListener("click", run);
$("#btnClear").addEventListener("click", () => { $("#req").value = ""; $("#out").hidden = true; });
["#fUniv", "#fDept", "#fTrack", "#fDate", "#fCode", "#tDegree", "#tField", "#tStage", "#tDeadline"].forEach((s) => $(s).addEventListener("input", () => refresh()));
$("#quote").addEventListener("input", () => ($("#qLen").textContent = `${$("#quote").value.replace(/\s/g, "").length}자`));
document.addEventListener("click", (e) => { const b = e.target.closest("[data-copy]"); if (b) copy($(`#${b.dataset.copy}`).value); });

const faqList = () => (mode === "thesis" ? THESIS_FAQ : FAQ);
function renderFaq() {
  $("#faq").innerHTML = faqList().map((f, i) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a())}</p><button class="ghost small" data-faq="${i}">복사</button></details>`).join("");
}
$("#faq").addEventListener("click", (e) => { const b = e.target.closest("[data-faq]"); if (b) copy(faqList()[+b.dataset.faq].a()); });
renderFaq();

function bump(k) { const l = readLog(); const d = (l[today()] ||= { sent: 0, hired: 0 }); d[k]++; writeLog(l); stats(); toast(k === "sent" ? "견적 1건 기록" : "고용 1건 기록"); }
$("#btnSent").addEventListener("click", () => bump("sent"));
$("#btnHired").addEventListener("click", () => bump("hired"));
$("#btnResetLog").addEventListener("click", () => { if (confirm("성사율 기록을 지울까요?")) { writeLog({}); stats(); } });
function stats() {
  const l = readLog(), t = l[today()] || { sent: 0, hired: 0 };
  const all = Object.values(l).reduce((a, d) => ({ sent: a.sent + d.sent, hired: a.hired + d.hired }), { sent: 0, hired: 0 });
  const rate = all.sent ? Math.round((all.hired / all.sent) * 1000) / 10 : 0;
  $("#stats").innerHTML = `<span class="stat">오늘 견적 <b>${t.sent}</b> · 고용 <b>${t.hired}</b></span>
    <span class="stat">누적 견적 <b>${all.sent}</b> · 고용 <b>${all.hired}</b> · 성사율 <b>${rate}%</b></span>
    <span class="stat">누적 캐시 사용 약 <b>${(all.sent * CONFIG.soomgo.quoteCash).toLocaleString()}</b></span>`;
  const be = [...CONFIG.thesis.plans.filter((p) => !p.from), ...CONFIG.soomgo.plans.filter((p) => !p.entry)].map((p) => ({ p, r: breakEven(p.price).rate }));
  $("#beHint").textContent = all.sent >= 20
    ? `현재 성사율 ${rate}% 기준: ${be.map(({ p, r }) => `${p.name}은 ${rate >= r ? "견적 비용을 넘습니다" : `견적 비용보다 적습니다(필요 ${r}%)`}`).join(" / ")}.`
    : "견적을 20건 이상 기록하면 가격별 손익 판단을 보여 드립니다.";
}
stats();
