import { CONFIG } from "./config.js";
import { parseRequest, triage, breakEven, quoteMessage, MATERIALS_MESSAGE, FOLLOWUP_MESSAGE, FAQ } from "./soomgo.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LOG = "soomgo.log.v1";
const today = () => new Date().toISOString().slice(0, 10);
const readLog = () => { try { return JSON.parse(localStorage.getItem(LOG)) || {}; } catch { return {}; } };
const writeLog = (v) => { try { localStorage.setItem(LOG, JSON.stringify(v)); } catch {} };

function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1500); }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast("복사했습니다"); } catch { prompt("복사하세요", text); } }

let req = null;
function run() {
  const text = $("#req").value.trim();
  if (!text) { $("#req").focus(); return; }
  req = parseRequest(text);
  const t = triage(text, req);
  $("#out").hidden = false;
  const v = $("#verdict"); v.textContent = t.verdict; v.className = `vbadge ${t.verdict}`;
  $("#why").innerHTML = `<ul>${(t.plus || []).map((p) => `<li class="plus">${esc(p)}</li>`).join("")}${t.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
  $("#fUniv").value = req.univ; $("#fDept").value = req.dept; $("#fTrack").value = req.track; $("#fDate").value = req.interview;
  const be = CONFIG.soomgo.plans.map((p) => `${p.name} ${p.price.toLocaleString()}원은 약 ${breakEven(p.price).rate}%`).join(", ");
  $("#cash").textContent = `견적 1건 ${CONFIG.soomgo.quoteCash.toLocaleString()}원. 견적 비용만 메우는 데 필요한 성사율은 ${be}입니다.`;
  refresh(t.verdict === "거절");
}
function refresh(refuse) {
  if (!req) return;
  const r = { ...req, univ: $("#fUniv").value.trim(), dept: $("#fDept").value.trim(), track: $("#fTrack").value.trim(), interview: $("#fDate").value.trim() };
  $("#quote").value = refuse
    ? "이 요청은 견적을 보내지 않는 것을 권합니다(허위 경험 요청 또는 이해충돌 대상)."
    : quoteMessage(r, { extra: req.wantsZoom ? "실전 연습을 원하신다고 하셔서, 답변 노트와 함께 줌 모의면접을 함께 진행하시는 것을 권해 드립니다." : "" });
  $("#qLen").textContent = `${$("#quote").value.replace(/\s/g, "").length}자`;
  $("#materials").value = MATERIALS_MESSAGE();
  $("#followup").value = FOLLOWUP_MESSAGE(r);
}
$("#btnRun").addEventListener("click", run);
$("#btnClear").addEventListener("click", () => { $("#req").value = ""; $("#out").hidden = true; });
["#fUniv", "#fDept", "#fTrack", "#fDate"].forEach((s) => $(s).addEventListener("input", () => refresh(false)));
$("#quote").addEventListener("input", () => ($("#qLen").textContent = `${$("#quote").value.replace(/\s/g, "").length}자`));
document.addEventListener("click", (e) => { const b = e.target.closest("[data-copy]"); if (b) copy($(`#${b.dataset.copy}`).value); });

$("#faq").innerHTML = FAQ.map((f, i) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a())}</p><button class="ghost small" data-faq="${i}">복사</button></details>`).join("");
$("#faq").addEventListener("click", (e) => { const b = e.target.closest("[data-faq]"); if (b) copy(FAQ[+b.dataset.faq].a()); });

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
    <span class="stat">누적 견적 비용 약 <b>${(all.sent * CONFIG.soomgo.quoteCash).toLocaleString()}원</b></span>`;
  const be = CONFIG.soomgo.plans.map((p) => ({ p, r: breakEven(p.price).rate }));
  $("#beHint").textContent = all.sent >= 20
    ? `현재 성사율 ${rate}% 기준: ${be.map(({ p, r }) => `${p.name}은 ${rate >= r ? "견적 비용을 넘습니다" : `견적 비용보다 적습니다(필요 ${r}%)`}`).join(" / ")}.`
    : "견적을 20건 이상 기록하면 가격별 손익 판단을 보여 드립니다.";
}
stats();
