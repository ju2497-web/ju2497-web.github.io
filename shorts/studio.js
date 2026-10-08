// studio.html?mode=comic|video&ep=ep1 — 4컷 이미지 또는 쇼츠 프레임을 그린다.
(function () {
  const q = new URLSearchParams(location.search);
  const mode = q.get("mode") || "comic";
  const ep = EPISODES.find((e) => e.id === q.get("ep")) || EPISODES[0];
  const num = EPISODES.indexOf(ep) + 1;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  function bubble(b, i) {
    const style = `left:${b.x}px;top:${b.y}px;${b.w ? `width:${b.w}px;` : ""}`;
    const type = b.type || "say";
    if (type === "msg")
      return `<div class="b msg" data-i="${i}" style="${style}"><div class="from">💬 ${esc(b.from)}</div><div class="txt">${esc(b.t)}</div></div>`;
    const tail = type === "sfx" || !b.tail ? "" : `<span class="tail ${b.tail}"></span>`;
    return `<div class="b ${type}" data-i="${i}" style="${style}">${esc(b.t)}${tail}</div>`;
  }

  function panel(p) {
    const bg = BG[p.bg];
    return `<div class="panel">
      <svg viewBox="0 0 510 565" width="510" height="565">${bg.back}${p.chars.map(drawChar).join("")}${bg.front}</svg>
      ${p.narr ? `<div class="narr">${esc(p.narr)}</div>` : ""}
      ${(p.bubbles || []).map(bubble).join("")}
    </div>`;
  }

  const head = `<div class="series">🍻 ${SERIES}</div><div class="eptitle">EP.${num} ${esc(ep.title)}</div>`;
  const root = document.getElementById("root");

  if (mode === "comic") {
    root.innerHTML = `<div class="comic"><header>${head}</header>
      <div class="grid">${ep.panels.map(panel).join("")}</div>
      <div class="handle">@회식하는동물들 · 과음은 다음 날의 나에게 미안한 일</div></div>`;
    applyAnim(0.3);
  } else {
    const lineup = ["dog", "cat", "hamster", "bear"].map((k, i) =>
      drawChar({ k, e: "happy", x: 130 + i * 200, y: 120, s: 0.62, anim: "bob" })).join("");
    root.innerHTML = `<div class="video"><header>${head}</header>
      <div class="stage">${ep.panels.map(panel).join("")}</div>
      <div class="dots">${ep.panels.map(() => "<i></i>").join("")}</div>
      <div class="vfoot">@회식하는동물들</div>
      <div class="end"><h2>다음 회식에서<br>만나요 🍻</h2><p>구독하면 다음 회식 소식 알려드림</p>
        <svg width="900" height="300" viewBox="0 0 900 300">${lineup}</svg></div></div>`;
  }

  // 캐릭터 움직임
  function applyAnim(t) {
    document.querySelectorAll("g.anim").forEach((g) => {
      const seed = Number(g.dataset.seed) / 50;
      const a = g.dataset.anim;
      let tr = "";
      if (a === "bob") tr = `translate(0,${(Math.sin(t * 7.5 + seed) * 6).toFixed(2)})`;
      if (a === "sway") tr = `rotate(${(Math.sin(t * 4.4 + seed) * 7).toFixed(2)} 0 110)`;
      if (a === "shake") tr = `translate(${(Math.sin(t * 57) * 3.5).toFixed(2)},0)`;
      g.setAttribute("transform", tr);
      const soul = g.querySelector(".soul");
      if (soul) soul.setAttribute("transform", `translate(${(Math.sin(t * 3) * 6).toFixed(2)},${(-((t * 18) % 40)).toFixed(2)})`);
    });
  }

  const D = 2.8, END = 1.8;
  window.DURATION = ep.panels.length * D + END;
  const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
  const pop = (x) => (x <= 0 ? 0 : x < 0.18 ? (x / 0.18) * 1.12 : x < 0.3 ? 1.12 - ((x - 0.18) / 0.12) * 0.12 : 1);

  window.setTime = function (t) {
    if (mode !== "video") return;
    const panels = document.querySelectorAll(".stage .panel");
    const idx = Math.min(Math.floor(t / D), panels.length - 1);
    panels.forEach((p, i) => {
      if (i !== idx) { p.style.opacity = 0; return; }
      const u = t - i * D;
      const k = ease(u / 0.28);
      p.style.opacity = 0.35 + 0.65 * k;
      p.style.transform = `scale(${0.94 + 0.06 * k})`;
      p.style.transformOrigin = "50% 50%";
      p.querySelectorAll(".b").forEach((b) => {
        const s = pop(u - 0.35 - Number(b.dataset.i) * 0.8);
        b.style.transform = (b.classList.contains("sfx") ? "rotate(-8deg) " : "") + `scale(${s})`;
      });
      const n = p.querySelector(".narr");
      if (n) n.style.opacity = ease((u - 0.05) / 0.2);
    });
    document.querySelectorAll(".dots i").forEach((d, i) => d.classList.toggle("on", i <= idx));
    const end = document.querySelector(".end");
    end.style.opacity = ease((t - panels.length * D) / 0.3);
    applyAnim(t);
  };
  if (mode === "video") window.setTime(0);
})();
