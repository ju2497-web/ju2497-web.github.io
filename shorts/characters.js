// 「회식하는 동물들」 캐릭터·소품·배경 SVG 그리기.
// 캐릭터 좌표계: 머리 중심이 (0,0), 몸은 아래로 약 y=180 까지.
(function () {
  const INK = "#1f1f1f";

  const KINDS = {
    dog: { // 김대리 (말티즈)
      fur: "#fffdf7", line: "#d6ccbc", jacket: "#1e3a8a", jacketLine: "#172554", shirt: "#e0f2fe", tie: "#ef4444",
      head: () => `
        <ellipse cx="-62" cy="12" rx="28" ry="52" fill="#efe8dc" stroke="#cbbfae" stroke-width="3" transform="rotate(14 -62 12)"/>
        <ellipse cx="62" cy="12" rx="28" ry="52" fill="#efe8dc" stroke="#cbbfae" stroke-width="3" transform="rotate(-14 62 12)"/>
        <circle r="70" fill="#fffdf7" stroke="#d6ccbc" stroke-width="3"/>
        <circle cx="-22" cy="-60" r="18" fill="#fffdf7"/><circle cx="6" cy="-68" r="20" fill="#fffdf7"/><circle cx="32" cy="-58" r="16" fill="#fffdf7"/>
        <ellipse cy="24" rx="30" ry="22" fill="#fff"/>
        <ellipse cy="12" rx="10" ry="7" fill="${INK}"/>`,
    },
    cat: { // 박과장 (회색 코숏)
      fur: "#9aa0a8", line: "#5b6169", jacket: "#374151", jacketLine: "#1f2937", shirt: "#ffffff", tie: "#7c3aed",
      head: () => `
        <path d="M-64,-26 L-52,-94 L-12,-58 Z" fill="#9aa0a8" stroke="#5b6169" stroke-width="3" stroke-linejoin="round"/>
        <path d="M64,-26 L52,-94 L12,-58 Z" fill="#9aa0a8" stroke="#5b6169" stroke-width="3" stroke-linejoin="round"/>
        <path d="M-54,-40 L-48,-78 L-24,-58 Z" fill="#f9a8d4"/><path d="M54,-40 L48,-78 L24,-58 Z" fill="#f9a8d4"/>
        <ellipse rx="74" ry="66" fill="#9aa0a8" stroke="#5b6169" stroke-width="3"/>
        <path d="M-14,-62 L-9,-42 M0,-65 L0,-42 M14,-62 L9,-42" stroke="#5b6169" stroke-width="5" stroke-linecap="round"/>
        <ellipse cy="24" rx="32" ry="21" fill="#e5e7eb"/>
        <path d="M-7,10 L7,10 L0,18 Z" fill="#f472b6"/>
        <path d="M-34,22 L-66,16 M-34,28 L-66,32 M34,22 L66,16 M34,28 L66,32" stroke="#4b5563" stroke-width="2"/>`,
    },
    hamster: { // 막내 햄찡
      fur: "#f3bf6b", line: "#b7832f", jacket: "#facc15", jacketLine: "#ca8a04", shirt: "#facc15", tie: null,
      head: () => `
        <circle cx="-50" cy="-52" r="19" fill="#f0b35f" stroke="#b7832f" stroke-width="3"/><circle cx="-50" cy="-52" r="9" fill="#fbcfe8"/>
        <circle cx="50" cy="-52" r="19" fill="#f0b35f" stroke="#b7832f" stroke-width="3"/><circle cx="50" cy="-52" r="9" fill="#fbcfe8"/>
        <ellipse rx="76" ry="68" fill="#f3bf6b" stroke="#b7832f" stroke-width="3"/>
        <ellipse cy="24" rx="50" ry="38" fill="#fff6e5"/>
        <circle cx="-44" cy="20" r="13" fill="#fda4af" opacity=".55"/><circle cx="44" cy="20" r="13" fill="#fda4af" opacity=".55"/>
        <circle cy="10" r="6" fill="#f472b6"/>`,
    },
    bear: { // 곰 부장
      fur: "#9a6634", line: "#5c3a1a", jacket: "#57534e", jacketLine: "#292524", shirt: "#f5f5f4", tie: "#b91c1c",
      head: () => `
        <circle cx="-52" cy="-52" r="23" fill="#9a6634" stroke="#5c3a1a" stroke-width="3"/><circle cx="-52" cy="-52" r="11" fill="#c08a5a"/>
        <circle cx="52" cy="-52" r="23" fill="#9a6634" stroke="#5c3a1a" stroke-width="3"/><circle cx="52" cy="-52" r="11" fill="#c08a5a"/>
        <circle r="72" fill="#9a6634" stroke="#5c3a1a" stroke-width="3"/>
        <ellipse cy="24" rx="34" ry="25" fill="#d9b48a"/>
        <ellipse cy="10" rx="12" ry="8" fill="#2b1a0e"/>`,
      glasses: true,
    },
  };

  const EYE = {
    normal: () => `<circle r="8" fill="${INK}"/><circle cx="-2.5" cy="-3" r="2.8" fill="#fff"/>`,
    happy: () => `<path d="M-10,3 Q0,-11 10,3" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    drunk: () => `<path d="M-10,-3 Q0,7 10,-3" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    cry: () => `<path d="M-10,-2 Q0,6 10,-2" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M0,6 Q-6,30 2,52 Q8,70 0,86" stroke="#7dd3fc" stroke-width="9" fill="none" stroke-linecap="round" opacity=".9"/>`,
    hungover: () => `<path d="M-11,0 L11,0" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <path d="M-7,0 A7,7 0 0 0 7,0 Z" fill="${INK}"/>
      <path d="M-12,11 Q0,18 12,11" stroke="#6d28d9" stroke-width="4" fill="none" opacity=".55" stroke-linecap="round"/>`,
    shock: () => `<circle r="14" fill="#fff" stroke="${INK}" stroke-width="3"/><circle r="4.5" fill="${INK}"/>`,
    sleep: () => `<path d="M-10,0 Q0,6 10,0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  };

  const MOUTH = {
    normal: `<path d="M-11,0 Q-5.5,7 0,0 Q5.5,7 11,0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    happy: `<path d="M-17,-4 Q0,22 17,-4 Z" fill="#7f1d1d"/><path d="M-8,8 Q0,14 8,8 Q0,4 -8,8Z" fill="#fb7185"/>`,
    drunk: `<path d="M-15,0 Q-7,9 0,2 Q7,-5 15,5" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    cry: `<path d="M-17,6 Q-8,-7 0,4 Q8,-7 17,6 Q0,20 -17,6 Z" fill="#7f1d1d"/>`,
    hungover: `<path d="M-14,2 Q-7,-3 0,2 Q7,7 14,2" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    shock: `<ellipse rx="9" ry="12" fill="#7f1d1d"/>`,
    sleep: `<circle r="5" fill="none" stroke="${INK}" stroke-width="3"/>`,
  };

  function body(K, kind) {
    const paw = K.fur;
    let torso = `
      <ellipse cx="-66" cy="112" rx="17" ry="42" fill="${K.jacket}" stroke="${K.jacketLine}" stroke-width="3"/>
      <ellipse cx="66" cy="112" rx="17" ry="42" fill="${K.jacket}" stroke="${K.jacketLine}" stroke-width="3"/>
      <path d="M-62,60 Q-72,170 -60,182 L60,182 Q72,170 62,60 Q0,46 -62,60 Z" fill="${K.jacket}" stroke="${K.jacketLine}" stroke-width="3"/>`;
    if (K.tie) {
      torso += `<path d="M-24,56 L0,114 L24,56 Z" fill="${K.shirt}"/>
        <path d="M-7,62 L7,62 L11,118 L0,132 L-11,118 Z" fill="${K.tie}"/>`;
    } else { // 막내: 후드티 + 사원증
      torso += `<path d="M-30,58 Q0,84 30,58" stroke="${K.jacketLine}" stroke-width="4" fill="none"/>
        <path d="M-14,66 L0,112 L14,66" stroke="#2563eb" stroke-width="4" fill="none"/>
        <rect x="-15" y="110" width="30" height="38" rx="4" fill="#fff" stroke="#2563eb" stroke-width="3"/>
        <rect x="-9" y="117" width="18" height="11" rx="2" fill="#bfdbfe"/>`;
    }
    torso += `<circle cx="-66" cy="152" r="14" fill="${paw}" stroke="${K.line}" stroke-width="3"/>
      <circle cx="66" cy="152" r="14" fill="${paw}" stroke="${K.line}" stroke-width="3"/>`;
    return torso;
  }

  function face(e, K) {
    const eyes = (EYE[e] || EYE.normal);
    let s = "";
    if (e === "hungover") s += `<ellipse cy="-4" rx="66" ry="58" fill="#65a30d" opacity=".22"/>`;
    s += `<g transform="translate(-26,-8)">${eyes()}</g><g transform="translate(26,-8)">${eyes()}</g>`;
    if (K.glasses) s += `<circle cx="-26" cy="-8" r="19" fill="none" stroke="${INK}" stroke-width="3.5"/>
      <circle cx="26" cy="-8" r="19" fill="none" stroke="${INK}" stroke-width="3.5"/><path d="M-7,-8 L7,-8" stroke="${INK}" stroke-width="3.5"/>`;
    s += `<g transform="translate(0,38)">${MOUTH[e] || MOUTH.normal}</g>`;
    if (e === "drunk") s += `<circle cx="-46" cy="22" r="17" fill="#ef4444" opacity=".55"/><circle cx="46" cy="22" r="17" fill="#ef4444" opacity=".55"/>`;
    if (e === "cry" || e === "shock") s += `<circle cx="-46" cy="22" r="13" fill="#fca5a5" opacity=".35"/><circle cx="46" cy="22" r="13" fill="#fca5a5" opacity=".35"/>`;
    return s;
  }

  function extras(e, o) {
    let s = "";
    if (e === "drunk") s += `<circle cx="70" cy="-70" r="8" fill="#fff" stroke="#93c5fd" stroke-width="2"/><circle cx="86" cy="-92" r="5" fill="#fff" stroke="#93c5fd" stroke-width="2"/>`;
    if (e === "hungover") s += `<path d="M-30,-100 q10,-14 20,0 q10,14 20,0 q10,-14 20,0" stroke="#65a30d" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    if (e === "sleep") s += `<text x="58" y="-74" font-family="Jua" font-size="34" fill="#60a5fa">Z</text><text x="86" y="-98" font-family="Jua" font-size="24" fill="#60a5fa">z</text>`;
    if (e === "shock") s += `<path d="M-60,-96 L-48,-78 M0,-110 L0,-88 M60,-96 L48,-78" stroke="#f59e0b" stroke-width="6" stroke-linecap="round"/>`;
    if (o.soul) s += `<g class="soul" opacity=".75"><path d="M-30,-150 Q-30,-210 0,-210 Q30,-210 30,-150 L30,-120 Q22,-130 15,-120 Q7,-130 0,-120 Q-7,-130 -15,-120 Q-22,-130 -30,-120 Z" fill="#fff" stroke="#cbd5e1" stroke-width="3"/>
      <circle cx="-10" cy="-170" r="4" fill="${INK}"/><circle cx="10" cy="-170" r="4" fill="${INK}"/></g>`;
    return s;
  }

  const PROPS = {
    somac: () => `<path d="M-17,-44 L17,-44 L12,18 L-12,18 Z" fill="#fde68a" stroke="#a16207" stroke-width="3"/>
      <ellipse cy="-44" rx="17" ry="6" fill="#fff" stroke="#e5e7eb" stroke-width="2"/>
      <path d="M-14,-36 L14,-36" stroke="#fff" stroke-width="5" opacity=".7"/>`,
    beer: () => `<rect x="-15" y="-40" width="30" height="56" rx="5" fill="#fbbf24" stroke="#a16207" stroke-width="3"/>
      <path d="M15,-28 q16,0 16,14 q0,14 -16,14" stroke="#a16207" stroke-width="4" fill="none"/>
      <ellipse cy="-40" rx="17" ry="7" fill="#fff"/>`,
    soju: () => `<rect x="-14" y="-40" width="28" height="62" rx="8" fill="#16a34a" stroke="#14532d" stroke-width="3"/>
      <rect x="-6" y="-62" width="12" height="24" rx="3" fill="#16a34a" stroke="#14532d" stroke-width="3"/>
      <rect x="-12" y="-20" width="24" height="22" rx="3" fill="#fff"/>
      <text y="-4" text-anchor="middle" font-family="Jua" font-size="11" fill="#14532d">소주</text>`,
    phone: () => `<rect x="-17" y="-36" width="34" height="58" rx="7" fill="#111827"/><rect x="-13" y="-30" width="26" height="44" rx="3" fill="#e0f2fe"/>`,
    mic: () => `<rect x="-5" y="-12" width="10" height="44" rx="4" fill="#111827"/><circle cy="-22" r="15" fill="#9ca3af" stroke="#4b5563" stroke-width="3"/>`,
    bowl: () => `<path d="M-38,-6 Q0,40 38,-6 Z" fill="#78350f" stroke="#451a03" stroke-width="3"/><ellipse cy="-6" rx="38" ry="9" fill="#dc2626"/>
      <path d="M-12,-20 q-6,-12 0,-24 M4,-20 q-6,-12 0,-24 M20,-20 q-6,-12 0,-24" stroke="#cbd5e1" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    clock: () => `<circle r="24" fill="#fef2f2" stroke="#dc2626" stroke-width="5"/><circle cx="-18" cy="-22" r="8" fill="#dc2626"/><circle cx="18" cy="-22" r="8" fill="#dc2626"/>
      <path d="M0,0 L0,-14 M0,0 L10,4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
    ramen: () => `<path d="M-24,-26 L24,-26 L18,24 L-18,24 Z" fill="#dc2626" stroke="#7f1d1d" stroke-width="3"/>
      <path d="M-18,-26 q6,-10 12,0 q6,-10 12,0 q6,-10 12,0" stroke="#fde68a" stroke-width="5" fill="none"/>
      <path d="M6,-56 L-10,-20 M16,-54 L0,-20" stroke="#a16207" stroke-width="4"/>`,
  };

  // 캐릭터 하나: {k, e, x, y, s, prop, anim, soul, blanket, flip}
  window.drawChar = function (c) {
    const K = KINDS[c.k];
    const e = c.e || "normal";
    const s = c.s || 0.9;
    const prop = c.prop ? `<g transform="translate(72,128)">${PROPS[c.prop]()}</g>` : "";
    const top = c.blanket === "head" ? 14 : 70; // head: 눈만 빼꼼
    const blanket = c.blanket
      ? `<path d="M-240,${top + 20} Q0,${top - 34} 240,${top + 20} L240,260 L-240,260 Z" fill="#f9a8d4" stroke="#db2777" stroke-width="4"/>
         <path d="M-225,${top + 40} Q0,${top - 10} 225,${top + 40}" stroke="#fff" stroke-width="5" fill="none" opacity=".6"/>`
      : "";
    return `<g transform="translate(${c.x},${c.y}) scale(${c.flip ? -s : s},${s})">
      <g class="anim" data-anim="${c.anim || "bob"}" data-seed="${c.x}">
        ${body(K, c.k)}${K.head()}${face(e, K)}${extras(e, c)}${blanket}${prop}
      </g></g>`;
  };

  // 배경: back(캐릭터 뒤), front(캐릭터 앞)
  const W = 510, H = 565;
  window.BG = {
    pocha: {
      back: `<rect width="${W}" height="${H}" fill="#1e1b4b"/>
        <path d="M0,0 H${W} V96 ${Array.from({ length: 9 }, (_, i) => `Q${W - i * 57 - 28},126 ${W - (i + 1) * 57},96`).join(" ")} Z" fill="#f97316"/>
        ${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 57 + 10}" y="0" width="22" height="100" fill="#fff" opacity=".85"/>`).join("")}
        ${Array.from({ length: 10 }, (_, i) => `<circle cx="${i * 54 + 20}" cy="${150 + (i % 2) * 10}" r="7" fill="#fde047"/>`).join("")}
`,
      front: `<rect y="470" width="${W}" height="95" fill="#b45309"/><rect y="462" width="${W}" height="14" fill="#92400e"/>`,
    },
    office: {
      back: `<rect width="${W}" height="${H}" fill="#e2e8f0"/>
        <rect x="300" y="50" width="170" height="140" fill="#bae6fd" stroke="#64748b" stroke-width="6"/><path d="M385,50 V190 M300,120 H470" stroke="#64748b" stroke-width="5"/>
        <rect x="40" y="70" width="110" height="70" rx="6" fill="#fff" stroke="#94a3b8" stroke-width="4"/><path d="M58,92 H132 M58,108 H118 M58,124 H104" stroke="#94a3b8" stroke-width="4"/>`,
      front: `<rect y="470" width="${W}" height="95" fill="#94a3b8"/><rect y="462" width="${W}" height="14" fill="#64748b"/>`,
    },
    bedroom: {
      back: `<rect width="${W}" height="${H}" fill="#fef3c7"/>
        <rect x="320" y="50" width="150" height="130" fill="#7dd3fc" stroke="#a16207" stroke-width="6"/><circle cx="430" cy="90" r="22" fill="#fde047"/>
        <rect y="400" width="${W}" height="165" fill="#fde68a"/>`,
      front: "",
    },
    karaoke: {
      back: `<defs><linearGradient id="kg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b0764"/><stop offset="1" stop-color="#7e22ce"/></linearGradient></defs>
        <rect width="${W}" height="${H}" fill="url(#kg)"/>
        <rect x="60" y="34" width="390" height="120" rx="8" fill="#0f172a" stroke="#f0abfc" stroke-width="4"/>
        <text x="${W / 2}" y="108" text-anchor="middle" font-family="Jua" font-size="34" fill="#f0abfc">♪ 회식의 밤 ♪</text>
        ${[[40, 220, "#f0abfc"], [470, 250, "#67e8f9"], [90, 330, "#fde047"], [440, 380, "#f0abfc"]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="10" fill="${c}" opacity=".8"/>`).join("")}`,
      front: `<rect y="490" width="${W}" height="75" fill="#581c87"/>`,
    },
    store: {
      back: `<rect width="${W}" height="${H}" fill="#0f172a"/>
        <rect x="0" y="70" width="${W}" height="330" fill="#e0f2fe"/>
        <rect x="0" y="70" width="${W}" height="46" fill="#2563eb"/><rect x="0" y="116" width="${W}" height="10" fill="#f97316"/>
        <text x="${W / 2}" y="104" text-anchor="middle" font-family="Do Hyeon" font-size="30" fill="#fff">24시 편의점</text>
        <path d="M120,126 V400 M255,126 V400 M390,126 V400" stroke="#94a3b8" stroke-width="5"/>`,
      front: `<rect x="40" y="470" width="430" height="20" rx="6" fill="#dc2626"/><rect x="60" y="490" width="14" height="75" fill="#991b1b"/><rect x="436" y="490" width="14" height="75" fill="#991b1b"/>`,
    },
    dark: {
      back: `<rect width="${W}" height="${H}" fill="#111827"/>
        ${Array.from({ length: 14 }, (_, i) => `<text x="${(i * 97) % 470 + 20}" y="${(i * 61) % 470 + 60}" font-family="Do Hyeon" font-size="${22 + (i % 3) * 8}" fill="#374151">???</text>`).join("")}`,
      front: "",
    },
  };
})();
