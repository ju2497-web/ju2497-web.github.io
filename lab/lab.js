// 실험실 공통 동작: 머리말·꼬리말, 공유, 결정론적 난수, 방문·결과·공유 집계.
(function () {
  const cfg = window.LAB_CONFIG || {};
  const Lab = {};
  let appId = "", appTitle = "";

  Lab.init = function (opt) {
    appId = opt.id; appTitle = opt.title;
    document.title = opt.title + " | " + (cfg.siteName || "작은 실험실");
    const top = document.createElement("div");
    top.className = "lab-top";
    top.innerHTML = '<a href="../">← ' + (cfg.siteName || "작은 실험실") + "</a><span>" + opt.title + "</span>";
    document.body.prepend(top);
    const foot = document.createElement("footer");
    foot.className = "lab-foot";
    foot.innerHTML = "재미로 보는 결과입니다. 입력한 내용은 이 기기 밖으로 나가지 않습니다.<br>" +
      '<a href="../">다른 실험 보기</a>';
    document.body.append(foot);
    const toast = document.createElement("div"); toast.className = "toast"; toast.id = "labToast";
    document.body.append(toast);
    loadAnalytics();
  };

  function loadAnalytics() {
    if (cfg.goatcounter) {
      const s = document.createElement("script");
      s.async = true; s.src = "https://gc.zgo.at/count.js";
      s.dataset.goatcounter = "https://" + cfg.goatcounter + ".goatcounter.com/count";
      document.head.append(s);
    }
    if (cfg.ga4) {
      const s = document.createElement("script");
      s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + cfg.ga4;
      document.head.append(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      gtag("js", new Date()); gtag("config", cfg.ga4);
    }
  }

  // 이벤트 집계: "result"(결과를 봄), "share"(공유 누름). 집계 코드가 없으면 아무것도 보내지 않음.
  Lab.track = function (event, label) {
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: "lab/" + appId + "/" + event + (label ? "/" + label : ""), title: appTitle + " " + event, event: true });
      }
      if (window.gtag && cfg.ga4) gtag("event", "lab_" + event, { app: appId, label: label || "" });
    } catch (e) {}
  };

  Lab.toast = function (msg) {
    const t = document.getElementById("labToast"); if (!t) return;
    t.textContent = msg; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 1800);
  };

  // 공유: 기기 공유창 → 안 되면 클립보드 복사
  Lab.share = async function (text) {
    Lab.track("share");
    const url = location.href.split("#")[0];
    const payload = { title: appTitle, text: text, url: url };
    try {
      if (navigator.share) { await navigator.share(payload); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text + "\n" + url); Lab.toast("결과와 주소를 복사했어요"); }
    catch (e) { Lab.toast("복사가 안 되는 브라우저예요"); }
  };

  // 문자열 → 32비트 해시 → 결정론적 난수 생성기(같은 입력이면 늘 같은 결과)
  Lab.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  Lab.rng = function (seed) {
    let s = typeof seed === "number" ? seed >>> 0 : Lab.hash(String(seed));
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  Lab.pick = function (arr, rnd) { return arr[Math.floor((rnd ? rnd() : Math.random()) * arr.length)]; };
  Lab.today = function () { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  // 결과 카드 렌더링. html: 본문, shareText: 공유 문구
  Lab.result = function (container, html, shareText, onRetry) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    el.innerHTML = '<div class="card result">' + html +
      '<div class="actions"><button class="primary" style="margin:0" id="labShare">결과 공유하기</button>' +
      (onRetry ? '<button class="ghost" id="labRetry">다시 하기</button>' : "") + "</div></div>";
    el.hidden = false;
    document.getElementById("labShare").onclick = () => Lab.share(shareText);
    if (onRetry) document.getElementById("labRetry").onclick = onRetry;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    Lab.track("result");
  };

  // 간단 설문 엔진: questions=[{q, a:[{t, s:{key:n}}]}], done(scores)
  Lab.quiz = function (container, questions, done) {
    const el = typeof container === "string" ? document.getElementById(container) : container;
    const scores = {}; let i = 0;
    function render() {
      if (i >= questions.length) { done(scores); return; }
      const q = questions[i];
      el.innerHTML = '<div class="card"><div class="progress">' + (i + 1) + " / " + questions.length + "</div><h2>" + q.q + '</h2><div class="choices">' +
        q.a.map((a, k) => '<button data-k="' + k + '">' + a.t + "</button>").join("") + "</div></div>";
      el.querySelectorAll("button").forEach(b => b.onclick = () => {
        const a = q.a[+b.dataset.k];
        for (const key in a.s) scores[key] = (scores[key] || 0) + a.s[key];
        i++; render();
      });
    }
    render();
  };

  Lab.bars = function (obj, labels) {
    const max = Math.max(1, ...Object.values(obj));
    return '<div class="bars">' + Object.keys(obj).map(k => '<div class="bar"><span>' + (labels ? labels[k] : k) + '</span><i style="width:' + Math.round(obj[k] / max * 100) + '%"></i><b>' + obj[k] + "</b></div>").join("") + "</div>";
  };

  window.Lab = Lab;
})();
