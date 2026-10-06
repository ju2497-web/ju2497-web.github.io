import { DEFAULT_KB, DEFAULT_SETTINGS, SETTING_LABELS, SAMPLE_INQUIRIES, EXAMPLE_STRENGTHS, MEMO_EXAMPLES } from "./kb.js";
import { analyze, compose, detectAsker } from "./engine.js";
import { aiAnswer, DEFAULT_MODEL } from "./ai.js";

// ───────── 저장소 (localStorage, 실패해도 동작) ─────────
const KEYS = { kb: "adm.kb.v1", settings: "adm.settings.v1", history: "adm.history.v1", ai: "adm.ai.v1" };
const load = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } };
const clone = (o) => JSON.parse(JSON.stringify(o));

const state = {
  kb: load(KEYS.kb, clone(DEFAULT_KB)),
  settings: { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) },
  history: load(KEYS.history, []),
  ai: load(KEYS.ai, { apiKey: "", model: "" }),
  selected: [],          // 현재 답변에 포함된 KB id
  analysis: null,
  lastMode: "rule",
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, ms = 1800) {
  const t = $("#toast");
  t.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.textContent = ""), ms);
}

function download(name, text, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

// ───────── 탭 ─────────
function showTab(name) {
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach((s) => s.classList.toggle("active", s.id === `tab-${name}`));
  if (name === "kb") renderKb();
  if (name === "history") renderHistory();
}
$$(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) { e.preventDefault(); showTab(g.dataset.goto); }
});

function refreshHeader() {
  $("#uniName").textContent = state.settings.대학명 || "○○대학교";
  const core = ["입학처전화", "수시원서접수", "정시원서접수", "입학처홈페이지"];
  $("#setupBanner").hidden = core.every((k) => state.settings[k]?.trim());
}

// ───────── 답변 작성 ─────────
SAMPLE_INQUIRIES.forEach((q) => {
  const c = document.createElement("button");
  c.className = "chip";
  c.type = "button";
  c.textContent = q;
  c.title = q;
  c.addEventListener("click", () => { $("#inquiry").value = q; generate(); });
  $("#samples").append(c);
});

MEMO_EXAMPLES.forEach((m) => {
  const c = document.createElement("button");
  c.className = "chip"; c.type = "button"; c.textContent = `예시: ${m.label}`;
  c.addEventListener("click", () => { $("#notes").value = m.memo; if (state.analysis) assemble(); });
  $("#memoExamples").append(c);
});

const kbById = (id) => state.kb.find((e) => e.id === id);

function currentAsker(text) {
  const v = $("#asker").value;
  return v === "auto" ? detectAsker(text) : v;
}

function generate() {
  const text = $("#inquiry").value.trim();
  if (!text) { $("#inquiry").focus(); return; }
  state.analysis = analyze(text, state.kb);
  state.selected = state.analysis.matches.map((m) => m.entry.id);
  renderAnalysis();
  assemble();
}

function renderAnalysis() {
  const a = state.analysis;
  if (!a) return;
  $("#analysis").hidden = false;
  $("#bTrack").textContent = `전형: ${a.track}`;
  $("#bAsker").textContent = `질문자: ${currentAsker($("#inquiry").value)}${$("#asker").value === "auto" ? " (자동)" : ""}`;

  const scoreOf = (id) => a.ranked.find((r) => r.entry.id === id);
  const ids = [...new Set([...a.matches.map((m) => m.entry.id), ...state.selected])];
  const list = $("#matchList");
  list.innerHTML = "";
  if (!ids.length) {
    list.innerHTML = `<li class="empty">일치하는 항목이 없습니다. 아래에서 직접 항목을 추가하거나, 지식베이스에 새 답변을 등록해 주세요. (현재는 ‘담당자 확인 후 회신’ 안내문이 생성됩니다)</li>`;
  }
  for (const id of ids) {
    const e = kbById(id);
    if (!e) continue;
    const r = scoreOf(id);
    const li = document.createElement("li");
    li.innerHTML = `<input type="checkbox" ${state.selected.includes(id) ? "checked" : ""} aria-label="${esc(e.title)} 포함">
      <div><span class="tag ${esc(e.track)}">${esc(e.track)}</span><b>${esc(e.title)}</b>
      <div class="kw">${r?.hits.length ? "일치 키워드: " + esc(r.hits.join(", ")) : "직접 추가한 항목"}</div></div>
      <span class="score">${r ? r.score.toFixed(1) : "–"}</span>`;
    li.querySelector("input").addEventListener("change", (ev) => {
      state.selected = ev.target.checked ? [...state.selected, id] : state.selected.filter((x) => x !== id);
      assemble();
    });
    list.append(li);
  }

  const sel = $("#addEntry");
  sel.innerHTML = `<option value="">+ 다른 항목 추가…</option>` +
    state.kb.filter((e) => !ids.includes(e.id))
      .map((e) => `<option value="${esc(e.id)}">[${esc(e.track)}] ${esc(e.title)}</option>`).join("");
}

$("#addEntry").addEventListener("change", (e) => {
  const id = e.target.value;
  if (!id) return;
  state.selected.push(id);
  renderAnalysis();
  assemble();
});

function assemble() {
  const text = $("#inquiry").value.trim();
  const channel = $("#channel").value;
  const res = compose({
    inquiry: text,
    entries: state.selected.map(kbById).filter(Boolean),
    settings: state.settings,
    channel,
    tone: $("#tone").value,
    asker: currentAsker(text),
    name: $("#askerName").value.trim(),
    notes: $("#notes").value,
    empathy: $("#optEmpathy").checked,
    differentiate: $("#optDiff").checked,
  });
  const sit = $("#bSituation");
  sit.hidden = !res.situation || !$("#optEmpathy").checked;
  sit.textContent = `상황: ${res.situation}`;
  sit.className = "badge sit";
  $("#subject").hidden = channel !== "email";
  $("#subject").value = res.subject;
  $("#output").value = res.text;
  state.lastMode = "rule";
  $("#modeLabel").textContent = "규칙 기반";
  showWarnings(res.missing);
}

function showWarnings(missing) {
  const w = $("#warnings");
  if (missing.length) {
    w.hidden = false;
    w.innerHTML = `발송 전 확인: <b>${missing.map(esc).join(", ")}</b> 값을 확인해 주세요. <a href="#" data-goto="settings">설정에서 입력</a>하거나 답변에서 직접 수정하세요.`;
  } else w.hidden = true;
}

$("#btnGenerate").addEventListener("click", generate);
$("#inquiry").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) generate();
});
let notesTimer;
$("#notes").addEventListener("input", () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => { if (state.analysis) assemble(); }, 250);
});
["#channel", "#tone", "#asker", "#askerName", "#optEmpathy", "#optDiff"].forEach((s) =>
  $(s).addEventListener("change", () => { if (state.analysis) { renderAnalysis(); assemble(); } }));
$("#btnClear").addEventListener("click", () => {
  $("#inquiry").value = ""; $("#notes").value = ""; $("#output").value = ""; $("#subject").value = "";
  $("#analysis").hidden = true; $("#warnings").hidden = true; state.analysis = null; state.selected = [];
  $("#modeLabel").textContent = "";
});

$("#btnAI").addEventListener("click", async () => {
  const text = $("#inquiry").value.trim();
  if (!text) { $("#inquiry").focus(); return; }
  if (!state.ai.apiKey) {
    toast("설정 탭에서 Claude API 키를 먼저 입력하세요.", 2600);
    showTab("settings"); $("#apiKey").focus();
    return;
  }
  if (!state.analysis) generate();
  const draft = [$("#subject").hidden ? "" : `제목: ${$("#subject").value}`, $("#output").value].filter(Boolean).join("\n\n");
  const btn = $("#btnAI");
  btn.disabled = true; btn.textContent = "AI 작성 중…";
  $("#output").value = "";
  $("#modeLabel").textContent = "AI 작성 중";
  try {
    let acc = "";
    const final = await aiAnswer({
      apiKey: state.ai.apiKey,
      model: state.ai.model || DEFAULT_MODEL,
      inquiry: text,
      settings: state.settings,
      kb: state.kb,
      channel: $("#channel").value,
      tone: $("#tone").value,
      asker: currentAsker(text),
      draft,
      notes: $("#notes").value.trim(),
      empathy: $("#optEmpathy").checked,
      differentiate: $("#optDiff").checked,
      onText: (d) => { acc += d; $("#output").value = acc; },
    });
    let body = final;
    const m = body.match(/^제목\s*:\s*(.+)\n+/);
    if (m && $("#channel").value === "email") { $("#subject").value = m[1].trim(); body = body.slice(m[0].length); }
    $("#output").value = body;
    state.lastMode = "ai";
    $("#modeLabel").textContent = "AI 다듬기 · 사실 관계를 검토 후 발송하세요";
  } catch (err) {
    console.error(err);
    const status = err?.status;
    const msg = status === 401 ? "API 키가 올바르지 않습니다." :
      status === 429 ? "요청 한도를 초과했습니다. 잠시 후 다시 시도하세요." :
      err?.message || "AI 호출에 실패했습니다.";
    toast(`AI 실패: ${msg} 규칙 기반 답변으로 되돌립니다.`, 4000);
    assemble();
  } finally {
    btn.disabled = false; btn.textContent = "AI로 다듬기";
  }
});

$("#btnCopy").addEventListener("click", async () => {
  const sub = $("#subject").hidden ? "" : $("#subject").value;
  const text = (sub ? `제목: ${sub}\n\n` : "") + $("#output").value;
  if (!$("#output").value.trim()) return;
  try { await navigator.clipboard.writeText(text); toast("복사했습니다."); }
  catch { $("#output").select(); document.execCommand("copy"); toast("복사했습니다."); }
});

$("#btnSave").addEventListener("click", () => {
  const answer = $("#output").value.trim();
  if (!answer) return;
  state.history.unshift({
    at: new Date().toISOString(),
    inquiry: $("#inquiry").value.trim(),
    track: state.analysis?.track || "",
    channel: $("#channel").selectedOptions[0].textContent,
    mode: state.lastMode === "ai" ? "AI" : "규칙",
    entries: state.selected.map((id) => kbById(id)?.title).filter(Boolean),
    subject: $("#subject").hidden ? "" : $("#subject").value,
    answer,
  });
  state.history = state.history.slice(0, 500);
  save(KEYS.history, state.history);
  toast("기록에 저장했습니다.");
});

// ───────── 일괄 처리 ─────────
let batchRows = [];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

$("#batchFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const text = (await f.text()).replace(/^﻿/, "");
  let rows = parseCsv(text).map((r) => r[0].trim()).filter(Boolean);
  if (rows[0] && /문의|질문|inquiry|question/i.test(rows[0]) && rows[0].length < 20) rows = rows.slice(1);
  $("#batchInput").value = rows.map((r) => (r.includes("\n") ? `${r}\n---` : r)).join("\n");
});

function splitBatch(raw) {
  if (/^\s*---\s*$/m.test(raw)) {
    return raw.split(/^\s*---\s*$/m).flatMap((blk) => {
      const t = blk.trim();
      return t ? [t] : [];
    });
  }
  return raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
}

$("#btnBatch").addEventListener("click", () => {
  const items = splitBatch($("#batchInput").value);
  if (!items.length) return;
  const channel = $("#batchChannel").value, tone = $("#batchTone").value;
  batchRows = items.map((q) => {
    const a = analyze(q, state.kb);
    const res = compose({ inquiry: q, entries: a.matches.map((m) => m.entry), settings: state.settings, channel, tone, asker: a.asker });
    return { q, track: a.track, asker: a.asker, titles: a.matches.map((m) => m.entry.title), subject: res.subject, answer: res.text };
  });
  const tb = $("#batchTable tbody");
  tb.innerHTML = batchRows.map((r, i) => `<tr><td>${i + 1}</td><td class="q">${esc(r.q)}</td>
    <td>${esc(r.track)}<br><span class="hint">${esc(r.asker)}</span></td>
    <td>${r.titles.length ? r.titles.map(esc).join("<br>") : '<span class="hint">미매칭 · 담당자 확인</span>'}</td>
    <td class="ans">${esc(r.answer)}</td></tr>`).join("");
  $("#batchTable").hidden = false;
  $("#btnBatchCsv").disabled = false;
  const unmatched = batchRows.filter((r) => !r.titles.length).length;
  $("#batchStat").textContent = `${batchRows.length}건 생성 · 자동 매칭 ${batchRows.length - unmatched}건 · 담당자 확인 필요 ${unmatched}건`;
});

$("#btnBatchCsv").addEventListener("click", () => {
  const rows = [["번호", "문의", "전형분류", "질문자", "매칭항목", "제목", "답변"],
    ...batchRows.map((r, i) => [i + 1, r.q, r.track, r.asker, r.titles.join(" / "), r.subject, r.answer])];
  download(`입시문의_일괄답변_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), "text/csv");
});

// ───────── 지식베이스 ─────────
let editingId = null;

function renderKb() {
  const q = $("#kbSearch").value.trim().toLowerCase();
  const f = $("#kbFilter").value;
  const items = state.kb.filter((e) =>
    (!f || e.track === f) &&
    (!q || [e.title, e.question, e.answer, (e.keywords || []).join(",")].join(" ").toLowerCase().includes(q)));
  $("#kbCount").textContent = `${items.length} / ${state.kb.length}개`;
  $("#kbList").innerHTML = items.map((e) => `<article class="kb-item" data-id="${esc(e.id)}">
      <header><div><span class="tag ${esc(e.track)}">${esc(e.track)}</span><b>${esc(e.title)}</b></div>
      <div class="btns"><button class="ghost" data-act="edit">수정</button><button class="ghost danger" data-act="del">삭제</button></div></header>
      <div class="q">Q. ${esc(e.question)}</div>
      <div class="kw">키워드: ${esc((e.keywords || []).join(", "))}</div>
      <p class="a">${esc(e.answer)}</p></article>`).join("") || `<p class="hint">항목이 없습니다.</p>`;
}

$("#kbSearch").addEventListener("input", renderKb);
$("#kbFilter").addEventListener("change", renderKb);

$("#kbList").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest(".kb-item").dataset.id;
  if (btn.dataset.act === "edit") openKbDialog(kbById(id));
  if (btn.dataset.act === "del" && confirm("이 항목을 삭제할까요?")) {
    state.kb = state.kb.filter((e) => e.id !== id);
    save(KEYS.kb, state.kb); renderKb();
  }
});

function openKbDialog(entry) {
  editingId = entry?.id || null;
  const form = $("#kbForm");
  $("#kbDialogTitle").textContent = entry ? "항목 수정" : "새 항목";
  form.track.value = entry?.track || "수시";
  form.title.value = entry?.title || "";
  form.question.value = entry?.question || "";
  form.keywords.value = (entry?.keywords || []).join(", ");
  form.answer.value = entry?.answer || "";
  $("#kbDialog").showModal();
}

$("#btnKbNew").addEventListener("click", () => openKbDialog(null));
$("#kbDialog").addEventListener("close", () => {
  if ($("#kbDialog").returnValue !== "save") return;
  const form = $("#kbForm");
  const data = {
    track: form.track.value,
    title: form.title.value.trim(),
    question: form.question.value.trim(),
    keywords: form.keywords.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    answer: form.answer.value.trim(),
  };
  if (editingId) Object.assign(kbById(editingId), data);
  else state.kb.unshift({ id: `u-${Date.now().toString(36)}`, ...data });
  save(KEYS.kb, state.kb); renderKb();
});

$("#btnKbExport").addEventListener("click", () =>
  download("입시답변_지식베이스.json", JSON.stringify(state.kb, null, 2), "application/json"));

$("#kbImport").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const arr = Array.isArray(data) ? data : data.kb;
    if (!Array.isArray(arr) || !arr.every((x) => x.title && x.answer)) throw new Error("형식 오류");
    const mode = confirm(`${arr.length}개 항목을 가져옵니다.\n[확인] 기존 항목에 합치기 / [취소] 기존 항목을 모두 바꾸기`);
    const norm = arr.map((x, i) => ({ id: x.id || `i-${Date.now().toString(36)}-${i}`, track: x.track || "공통",
      title: x.title, question: x.question || x.title, keywords: x.keywords || [], answer: x.answer }));
    if (mode) {
      const map = new Map(state.kb.map((x) => [x.id, x]));
      norm.forEach((x) => map.set(x.id, x));
      state.kb = [...map.values()];
    } else state.kb = norm;
    save(KEYS.kb, state.kb); renderKb();
  } catch (err) { alert(`가져오기 실패: ${err.message}`); }
  e.target.value = "";
});

$("#btnKbReset").addEventListener("click", () => {
  if (!confirm("지식베이스를 기본값으로 되돌릴까요? 추가·수정한 항목이 사라집니다.")) return;
  state.kb = clone(DEFAULT_KB); save(KEYS.kb, state.kb); renderKb();
});

// ───────── 설정 ─────────
function renderSettings() {
  $("#settingsForm").innerHTML = Object.keys(DEFAULT_SETTINGS).map((k) => k === "강점"
    ? `<label>${esc(SETTING_LABELS[k])}
        <span class="hint">한 줄에 하나씩. <code>태그,태그: 문장</code>으로 쓰면 문의에 태그가 있을 때 그 문장을 골라 넣고, 태그 없는 줄은 기본 강점으로 씁니다.</span>
        <textarea name="강점" rows="7" placeholder="국시,합격률: 최근 3년간 임상병리사 국가시험 합격률 98%를 유지하고 있습니다">${esc(state.settings.강점 ?? "")}</textarea>
        <button type="button" class="ghost" id="btnStrengthEx">임상병리학과 예시 불러오기</button></label>`
    : `<label>${esc(SETTING_LABELS[k] || k)} <code>{{${esc(k)}}}</code>
      <input name="${esc(k)}" value="${esc(state.settings[k] ?? "")}" placeholder="${esc(placeholderFor(k))}"></label>`).join("");
  $("#btnStrengthEx").addEventListener("click", () => {
    const ta = $("#settingsForm textarea[name=강점]");
    if (ta.value.trim() && !confirm("입력된 강점을 예시로 바꿀까요?")) return;
    ta.value = EXAMPLE_STRENGTHS;
  });
  $("#apiKey").value = state.ai.apiKey || "";
  $("#aiModel").value = state.ai.model || "";
}
function placeholderFor(k) {
  return ({
    입학처전화: "예) 041-000-0000", 입학처이메일: "예) ipsi@example.ac.kr", 입학처홈페이지: "예) https://ipsi.example.ac.kr",
    수시원서접수: "예) 2026. 9. 8.(화) 10:00 ~ 9. 12.(토) 18:00", 수시합격발표: "예) 2026. 12. 11.(금) 14:00",
    정시원서접수: "예) 2026. 12. 29.(화) ~ 12. 31.(목)", 정시합격발표: "예) 2027. 1. 29.(금)", 정시모집군: "예) 나군",
    수능일: "예) 2026. 11. 19.(목)", 등록기간: "예) 2026. 12. 14.(월) ~ 12. 16.(수)",
  })[k] || "";
}
$("#btnSettingsSave").addEventListener("click", (e) => {
  e.preventDefault();
  const fd = new FormData($("#settingsForm"));
  for (const [k, v] of fd.entries()) state.settings[k] = v.toString().trim();
  save(KEYS.settings, state.settings);
  refreshHeader();
  if (state.analysis) assemble();
  alert("설정을 저장했습니다.");
});
$("#btnAiSave").addEventListener("click", () => {
  state.ai = { apiKey: $("#apiKey").value.trim(), model: $("#aiModel").value.trim() };
  save(KEYS.ai, state.ai);
  alert(state.ai.apiKey ? "AI 설정을 저장했습니다." : "API 키가 비어 있어 AI 기능은 꺼져 있습니다.");
});
$("#btnAiDelete").addEventListener("click", () => {
  state.ai = { apiKey: "", model: state.ai.model };
  save(KEYS.ai, state.ai); $("#apiKey").value = "";
  alert("API 키를 삭제했습니다.");
});
$("#btnSettingsExport").addEventListener("click", () =>
  download("입시자동답변_백업.json", JSON.stringify({ settings: state.settings, kb: state.kb }, null, 2), "application/json"));
$("#restoreFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.settings) state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    if (Array.isArray(data.kb)) state.kb = data.kb;
    save(KEYS.settings, state.settings); save(KEYS.kb, state.kb);
    renderSettings(); refreshHeader();
    alert("백업을 복원했습니다.");
  } catch (err) { alert(`복원 실패: ${err.message}`); }
  e.target.value = "";
});

// ───────── 기록 ─────────
function renderHistory() {
  const h = state.history;
  $("#histCount").textContent = `${h.length}건`;
  const counts = {};
  h.forEach((x) => (x.entries.length ? x.entries : ["(미매칭)"]).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  $("#histStats").innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([t, n]) => `<span class="stat">${esc(t)} <b>${n}</b></span>`).join("");
  $("#histList").innerHTML = h.map((x, i) => `<article class="hist-item" data-i="${i}">
    <header><div><b>${esc(new Date(x.at).toLocaleString("ko-KR"))}</b>
      <span class="hint"> · ${esc(x.track)} · ${esc(x.channel)} · ${esc(x.mode)}</span></div>
      <div class="btns"><button class="ghost" data-act="load">불러오기</button><button class="ghost danger" data-act="del">삭제</button></div></header>
    <div class="hint">Q. ${esc(x.inquiry)}</div><p class="a">${esc(x.answer)}</p></article>`).join("") || `<p class="hint">저장된 기록이 없습니다.</p>`;
}
$("#histList").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const i = +btn.closest(".hist-item").dataset.i;
  if (btn.dataset.act === "del") { state.history.splice(i, 1); save(KEYS.history, state.history); renderHistory(); }
  if (btn.dataset.act === "load") {
    const x = state.history[i];
    $("#inquiry").value = x.inquiry; $("#output").value = x.answer;
    $("#subject").value = x.subject || ""; $("#subject").hidden = !x.subject;
    showTab("compose");
  }
});
$("#btnHistCsv").addEventListener("click", () => {
  const rows = [["일시", "문의", "전형", "채널", "방식", "매칭항목", "제목", "답변"],
    ...state.history.map((x) => [x.at, x.inquiry, x.track, x.channel, x.mode, x.entries.join(" / "), x.subject, x.answer])];
  download("입시답변_기록.csv", toCsv(rows), "text/csv");
});
$("#btnHistClear").addEventListener("click", () => {
  if (!confirm("모든 기록을 삭제할까요?")) return;
  state.history = []; save(KEYS.history, state.history); renderHistory();
});

// ───────── 시작 ─────────
renderSettings();
refreshHeader();
