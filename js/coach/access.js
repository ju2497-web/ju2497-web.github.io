// 하드 페이월(이용 코드). coach.html과 interview.html이 함께 씁니다.
// 결제한 학생에게 보낸 이용 코드의 SHA-256 해시가 CONFIG.access.hashes에 있어야 답변 생성이 열립니다.
import { CONFIG } from "./config.js";

const KEY = "coach.code";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = (n) => `${n.toLocaleString("ko-KR")}원`;
const load = () => { try { return localStorage.getItem(KEY) ? JSON.parse(localStorage.getItem(KEY)) : ""; } catch { return ""; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 저장 불가 */ } };

export const normCode = (c) => (c || "").trim().toUpperCase().replace(/\s+/g, "");
export const savedCode = () => load();
export const rememberCode = (c) => save(normCode(c));

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function hasAccess(code) {
  if (CONFIG.beta) return true;
  const c = normCode(code);
  if (!c || !crypto.subtle) return false;
  try { return CONFIG.access.hashes.includes(await sha256(c)); } catch { return false; }
}

export function plansHTML() {
  const p = CONFIG.prices;
  const price = (n) => (CONFIG.beta ? `<s>${won(n)}</s>무료` : won(n));
  const deep = CONFIG.aiEndpoint ? `
    <div class="plan"><b>AI 심층형</b><span class="won">${price(p.deep)}</span><br>기본형 + 10단계 AI 분석 · 꼬리질문 모범 답변 · 감점 수정 이력</div>
    <div class="plan rec"><b>교수 첨삭형 <em>추천</em></b><span class="won">${price(p.deep + p.review)}</span><br>AI 심층형 + 교수 첨삭(보관함 답변 5문항 이내 1회)</div>` : `
    <div class="plan rec"><b>교수 첨삭형 <em>추천</em></b><span class="won">${price(p.basic + p.review)}</span><br>기본형 + 교수 첨삭(보관함 답변 5문항 이내 1회)</div>`;
  return `
    <div class="plan"><b>기본형</b><span class="won">${price(p.basic)}</span><br>이용 코드 1개 · 면접일까지 모든 문항 · 교수 평가 프레임 분석 · 예상 점수 · 답변 · 꼬리질문 · 대본</div>${deep}`;
}

// 페이지에 #payDlg 대화상자(payNote·payPlans·payLinks·payCode·payMsg·payOk·payClose)가 있어야 합니다.
export function openPaywall(onUnlock, currentCode = "") {
  const A = CONFIG.access;
  $("#payNote").textContent = A.payNote;
  $("#payPlans").innerHTML = plansHTML();
  $("#payLinks").innerHTML = [["soomgo", "숨고에서 결제"], ["kmong", "크몽에서 결제"]]
    .filter(([k]) => A.payLinks[k]).map(([k, t]) => `<a class="btnlike primary" target="_blank" rel="noopener" href="${esc(A.payLinks[k])}">${t}</a>`).join("");
  $("#payCode").value = currentCode || load(); $("#payMsg").hidden = true;
  $("#payDlg").showModal();
  $("#payOk").onclick = async () => {
    const code = normCode($("#payCode").value);
    if (await hasAccess(code)) { save(code); $("#payDlg").close(); onUnlock(code); }
    else { $("#payMsg").hidden = false; $("#payMsg").textContent = code ? "이용 코드가 맞지 않습니다. 결제 후 받으신 코드를 그대로 입력해 주세요." : "이용 코드를 입력해 주세요."; }
  };
  $("#payClose").onclick = () => $("#payDlg").close();
}

// 코드가 맞으면 run(), 아니면 결제 안내를 띄우고 코드 확인 뒤 run()
export async function gate(run, currentCode = load()) {
  if (await hasAccess(currentCode)) run(); else openPaywall(run, currentCode);
}

export const PAY_DIALOG_HTML = `
  <dialog id="payDlg">
    <div class="form">
      <h2>이용 코드가 필요합니다</h2>
      <p class="hint" id="payNote"></p>
      <div id="payPlans" class="plans"></div>
      <div id="payLinks" class="actions"></div>
      <label>이용 코드 입력<input id="payCode" type="text" autocomplete="off" placeholder="IV-○○○○-○○○○"></label>
      <p id="payMsg" class="warn" hidden></p>
      <div class="actions">
        <button id="payOk" class="primary">코드 확인하고 계속하기</button>
        <button id="payClose" class="ghost">닫기</button>
      </div>
    </div>
  </dialog>`;
