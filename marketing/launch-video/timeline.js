/*
 * CapKit launch video — deterministic timeline.
 *
 * Every visual is a pure function of time: `window.seek(ms)` paints the exact
 * frame for that timestamp. There are no CSS transitions, animations, timers or
 * random values, so render.ts can capture frames at any rate and get identical
 * output. Coordinates are 1920×1080 stage pixels; "desk" coordinates are the
 * simulated Windows desktop before the camera/studio transforms are applied.
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------ timing ---- */
  const S1 = 3500; // capture + annotate
  const S3 = 16000; // screen draw
  const S4 = 23600; // showcase
  const S5 = 32200; // record + auto zoom
  const S6 = 43000; // size reveal
  const S7 = 47600; // end card
  const END = 52600;
  window.DURATION = END;

  /* ------------------------------------------------------------ easing ---- */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t;
    const sy = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i += 1) {
        t = (lo + hi) / 2;
        if (sx(t) < x) lo = t; else hi = t;
      }
      return sy(t);
    };
  }
  const ease = {
    out: bezier(0.23, 1, 0.32, 1),
    inOut: bezier(0.77, 0, 0.175, 1),
    drawer: bezier(0.32, 0.72, 0, 1),
    move: bezier(0.45, 0, 0.2, 1), // cursor travel: human, slightly front-loaded
    linear: (x) => x,
  };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  /** Eased progress of `t` through [start, start + dur]. */
  const prog = (t, start, dur, e = ease.out) => e(clamp((t - start) / dur));
  /** Fade in over [a, b], fade out over [c, d]. */
  const window01 = (t, a, b, c, d) => prog(t, a, b - a) * (1 - prog(t, c, d - c));

  /* ------------------------------------------------------------- DOM ------ */
  const $ = (q) => document.querySelector(q);
  function el(parent, cls, style, html) {
    const node = document.createElement("div");
    if (cls) node.className = cls;
    if (style) node.style.cssText = style;
    if (html) node.innerHTML = html;
    parent.appendChild(node);
    return node;
  }
  const icon = (name, size = 22) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" color="currentColor">${window.ICONS[name]}</svg>`;
  function show(node, o) {
    node.style.opacity = String(o);
    node.style.visibility = o < 0.002 ? "hidden" : "visible";
  }
  function tf(node, x, y, s = 1, o = 1, extra = "") {
    node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${s.toFixed(4)}) ${extra}`;
    show(node, o);
  }

  const stage = $("#stage");
  const deskWrap = $("#deskWrap");
  const deskCam = $("#deskCam");

  /* -------------------------------------------------------- product UI ---- */
  function chartSvg() {
    const values = [38, 42, 40, 47, 51, 49, 58, 62, 60, 71, 78, 86];
    const w = 560, h = 196;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / 100) * h]);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const grid = [0.25, 0.5, 0.75].map((g) => `<line x1="0" x2="${w}" y1="${h * g}" y2="${h * g}" stroke="#eeece6" />`).join("");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6fde" stop-opacity=".22"/><stop offset="1" stop-color="#2f6fde" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${line} L${w} ${h} L0 ${h} Z" fill="url(#ga)"/>
      <path d="${line}" fill="none" stroke="#2f6fde" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${pts[11][0] - 3}" cy="${pts[11][1]}" r="6" fill="#fff" stroke="#2f6fde" stroke-width="3"/></svg>`;
  }

  function productWindow(live, blurEmails) {
    const id = (name) => (live ? ` id="${name}"` : "");
    const email = (v) => `<span${blurEmails ? ' style="filter:blur(7px)"' : ""}>${v}</span>`;
    const row = (done, label) =>
      `<div class="row${done ? " done" : ""}"><span class="box${done ? " ok" : ""}"></span><span>${label}</span></div>`;
    return `<div class="win">
      <div class="bar"><span class="dot"></span>Orbit — Release Center<div class="ctl"><span>&#8212;</span><span>&#9744;</span><span>&#10005;</span></div></div>
      <div class="side"><div class="brand"><b></b>Orbit</div><div class="nav"><span class="on">Overview</span><span>Releases</span><span>Customers</span><span>Insights</span><span>Settings</span></div></div>
      <h1>Release 2.4</h1><div class="sub">Launch checklist · Week 43</div>
      <div class="ship">Ship release</div>
      <div class="card kpi" style="left:252px;width:292px"><div class="k">Signups</div><div class="v"${id("kpiSignups")}>12,480</div><div class="d">+18.2%</div></div>
      <div class="card kpi" style="left:560px;width:292px"><div class="k">Conversion</div><div class="v">4.2%</div><div class="d">+0.6</div></div>
      <div class="card kpi" style="left:868px;width:300px"><div class="k">Churn</div><div class="v">1.1%</div><div class="d neg">&#8722;0.3</div></div>
      <div class="card chart"><div class="t">Weekly active</div><div class="legend">LAST 12 WEEKS</div>${chartSvg()}</div>
      <div class="card list"><div class="t">Launch checklist</div>${row(true, "Pricing page")}${row(true, "Docs updated")}${row(false, "Status page")}${row(false, "Press kit")}</div>
      <div class="card table">
        <div class="tr h"><span>Customer</span><span>Email</span><span>Plan</span><span>MRR</span></div>
        <div class="tr"><span>Acme Studio</span>${email("maya@acmestudio.io")}<span><i class="pill">Pro</i></span><span>$1,240</span></div>
        <div class="tr"><span>Northwind</span>${email("j.ortiz@northwind.co")}<span><i class="pill">Team</i></span><span>$860</span></div>
        <div class="tr"><span>Lumen Labs</span>${email("ops@lumenlabs.dev")}<span><i class="pill">Pro</i></span><span>$2,110</span></div>
      </div>
    </div>`;
  }

  function logoSvg(prefix) {
    return `<svg viewBox="0 0 512 512" width="100%" height="100%">
      <rect id="${prefix}Bg" width="512" height="512" rx="116" fill="#151714" style="transform-origin:256px 256px"/>
      <path id="${prefix}Br" pathLength="1" d="M104 210V120c0-9 7-16 16-16h90M302 104h90c9 0 16 7 16 16v90M408 302v90c0 9-7 16-16 16h-90M210 408h-90c-9 0-16-7-16-16v-90" fill="none" stroke="#D9FF43" stroke-width="34" stroke-linecap="round" stroke-dasharray="1 1"/>
      <rect id="${prefix}Sq" x="178" y="178" width="156" height="156" rx="24" fill="#D9FF43" style="transform-origin:256px 256px"/>
      <path id="${prefix}Ar" pathLength="1" d="M226 282l64-64M254 218h36v36" fill="none" stroke="#151714" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 1"/>
    </svg>`;
  }

  /* --------------------------------------------------------- desktop ------ */
  el(deskCam, "wallpaper abs");
  el(deskCam, "taskbar", "",
    `<i></i><i></i><i></i><i></i><i class="capkit" style="width:30px;height:30px">${logoSvg("tb")}</i><i></i>
     <div class="tray"><span class="mono">ENG</span><span class="mono">9:41</span></div>`);
  el(deskCam, "", "", productWindow(true, false));
  const kpiSignups = $("#kpiSignups");

  /* capture overlay */
  const cap = el(deskCam, "abs", "width:1920px;height:1080px");
  const tintFull = el(cap, "abs tint", "width:1920px;height:1080px");
  const snap = el(cap, "snap", "left:612px;top:426px;width:600px;height:280px");
  const anno = el(cap, "abs", "width:1920px;height:1080px");
  const annoRect = el(anno, "anno-rect", "left:910px;top:290px;width:0;height:0");
  const annoHl = el(anno, "anno-hl", "left:624px;top:438px;width:0;height:28px");
  const BADGES = [[1496, 496], [1496, 540], [1496, 584]];
  const badges = BADGES.map(([x, y], i) => el(anno, "badge", `left:${x}px;top:${y}px`, String(i + 1)));
  const blurBox = el(anno, "blur", "left:826px;top:780px;width:0;height:0");
  const sel = el(cap, "sel", "left:596px;top:284px;width:0;height:0");
  const HANDLES = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
  const handles = HANDLES.map(([hx, hy]) => el(sel, "handle", `left:${hx * 100}%;top:${hy * 100}%`));
  const dims = el(cap, "dims", "left:596px;top:246px", "0 × 0 px");
  const hint = el(cap, "hint", "left:0;top:0", "Drag to select <b>·</b> Click to grab a window");
  const rail = el(cap, "dock v", "left:1556px;top:284px");
  const railTools = [["Copy01", "C"], ["Download04", "S"], ["Pin", ""]].map(([name, key]) =>
    el(rail, "tool", "", icon(name) + (key ? `<span class="kbd">${key}</span>` : "")));
  const toolDock = el(cap, "dock", "left:596px;top:922px");
  const tools = ["Cursor01", "Square", "Highlighter", "Blur", "Hashtag", "Undo03"].map((name) =>
    el(toolDock, "tool", "", icon(name)));
  const toastCopy = el(deskCam, "toast", "left:960px;top:930px",
    `<span class="ok">${icon("Tick02", 16)}</span>Copied to clipboard <span class="meta">948 × 626</span>`);

  /* screen draw */
  const draw = el(deskCam, "abs", "width:1920px;height:1080px");
  const spot = el(draw, "abs", "width:1920px;height:1080px");
  const inkSvg = el(draw, "abs", "width:1920px;height:1080px");
  {
    const cx = 1449, cy = 246, pts = [];
    for (let i = 0; i <= 120; i += 1) {
      const a = -0.35 * Math.PI + (i / 120) * 2.3 * Math.PI;
      const rx = 122 * (1 + 0.025 * Math.sin(3 * a));
      const ry = 48 * (1 + 0.05 * Math.cos(2 * a));
      pts.push(`${i ? "L" : "M"}${(cx + rx * Math.cos(a)).toFixed(1)} ${(cy + ry * Math.sin(a) + i * 0.09).toFixed(1)}`);
    }
    inkSvg.innerHTML = `<svg width="1920" height="1080" viewBox="0 0 1920 1080">
      <path id="inkCircle" class="ink" d="${pts.join(" ")}"/>
      <path id="inkArrow" class="ink" d="M1100 252 Q1205 214 1312 238"/>
      <path id="inkHead" class="ink" d="M1288 222 L1312 238 L1287 254"/></svg>`;
  }
  const inkCircle = $("#inkCircle"), inkArrow = $("#inkArrow"), inkHead = $("#inkHead");
  const inkLens = [inkCircle, inkArrow, inkHead].map((p) => p.getTotalLength());
  [inkCircle, inkArrow, inkHead].forEach((p, i) => { p.style.strokeDasharray = `${inkLens[i]} ${inkLens[i]}`; });
  const scrawl = el(draw, "scrawl", "left:828px;top:212px", "ship it friday!");
  const drawDockRow = el(draw, "abs", "width:1920px;top:962px;display:flex;justify-content:center");
  const drawDock = el(drawDockRow, "dock", "position:relative");
  const drawTools = ["PencilEdit01", "Highlighter", "ArrowUpRight01", "Square", "Text", "Spotlight"].map((n) =>
    el(drawDock, "tool", "", icon(n)));
  el(drawDock, "sep");
  ["#d9ff43", "#ff5b4d", "#60a5fa", "#ffffff"].forEach((c, i) =>
    el(drawDock, `swatch${i === 1 ? " on" : ""}`, `background:${c}`));
  const live = el(draw, "live", "left:1590px;top:72px", "<i></i>Desktop stays live");

  /* recording */
  const rec = el(deskCam, "abs", "width:1920px;height:1080px");
  const recBorder = el(rec, "recborder");
  const countdown = el(rec, "count", "left:960px;top:520px", "3");
  const recDock = el(rec, "rec", "left:680px;top:958px;width:560px",
    `<span class="dot"></span><span class="time">00:00</span><span class="src">Region · Display 1</span>
     <span class="ctl"><span class="on">${icon("Mic01")}</span><span class="on">${icon("Video01")}</span><span>${icon("Pause")}</span></span>
     <span class="stop" style="margin-left:auto;width:96px;justify-content:center">${icon("StopCircle", 18)}Stop</span>`);
  const recTime = recDock.querySelector(".time");
  const recStop = recDock.querySelector(".stop");

  /* stage-level layers */
  const studioBg = $("#studioBg");
  studioBg.style.background =
    "radial-gradient(circle at 18% 12%, rgb(217 255 67 / 26%), transparent 30%), radial-gradient(circle at 83% 82%, rgb(95 148 130 / 42%), transparent 34%), linear-gradient(135deg, #26352e, #101411 70%)";
  const studioUi = $("#studioUi");
  const timelinePanel = el(studioUi, "timeline", "",
    `<div class="track-label" style="top:26px">Clip</div><div class="track clip" style="top:18px"></div>
     <div class="track-label" style="top:72px">Zoom</div><div class="track" style="top:64px;background:rgb(255 255 255 / 5%)"></div>`);
  const zoomTrack = timelinePanel.querySelectorAll(".track")[1];
  const ZOOM_BLOCKS = [[0.17, 0.47, "1.8× · click"], [0.5, 0.93, "pan · click"]];
  const zoomBlocks = ZOOM_BLOCKS.map(([a, b, label]) =>
    el(zoomTrack, "zoomblk", `left:${a * 100}%;width:${(b - a) * 100}%`, label));
  const playhead = el(timelinePanel, "playhead", "left:110px");
  const autoPill = el(studioUi, "live", "left:260px;top:842px", `<i></i>Auto-zoom from your clicks`);
  const camBubble = el(stage, "cam", "left:0;top:0;z-index:30;transform-origin:0 0",
    `<svg viewBox="0 0 230 230" width="100%" height="100%">
      <defs><radialGradient id="camLight" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#5d6f63"/><stop offset="1" stop-color="#1a201c"/></radialGradient></defs>
      <rect width="230" height="230" fill="url(#camLight)"/>
      <circle cx="115" cy="98" r="44" fill="#c9a389"/><path d="M60 64 Q115 20 170 64 Q160 50 115 48 Q70 50 60 64Z" fill="#2b231e"/>
      <path d="M28 236 Q34 160 115 152 Q196 160 202 236Z" fill="#d9ff43" opacity=".9"/>
      <path d="M90 156 Q115 176 140 156 L140 150 Q115 164 90 150Z" fill="#b38f77"/></svg>`);

  /* showcase */
  const showcase = $("#showcase");
  const LOOKS = [
    { label: "Spotlight", bg: "radial-gradient(circle at 18% 12%,rgb(217 255 67 / 36%),transparent 27%),radial-gradient(circle at 83% 82%,rgb(95 148 130 / 48%),transparent 32%),linear-gradient(135deg,#26352e,#121714 70%)", s: 1, r: 14, rx: 0, ry: 0, bezel: 0, shadow: 1 },
    { label: "Editorial", bg: "#ecebe5", s: 0.93, r: 8, rx: 0, ry: 0, bezel: 0, shadow: 0.35 },
    { label: "Midnight", bg: "radial-gradient(circle at 50% 40%, #232624, #0f1110 70%)", s: 0.97, r: 14, rx: 0, ry: 0, bezel: 0, shadow: 0.9 },
    { label: "Poster", bg: "linear-gradient(135deg,#f3a46f 0%,#a76591 100%)", s: 0.9, r: 18, rx: 9, ry: -16, bezel: 0, shadow: 1 },
    { label: "Device", bg: "linear-gradient(135deg,#8de3ef 0%,#31577a 100%)", s: 0.88, r: 16, rx: 0, ry: 0, bezel: 1, shadow: 1 },
    { label: "Bare", bg: "repeating-conic-gradient(#e7e6e0 0 25%, #f7f6f2 0 50%) 0 0 / 22px 22px", s: 1, r: 0, rx: 0, ry: 0, bezel: 0, shadow: 0 },
  ];
  const backdrops = LOOKS.map((look) => el(showcase, "bd", `background:${look.bg}`));
  const shot = el(showcase, "", "");
  shot.id = "shot";
  const shotShadow = el(shot, "abs", "inset:0;width:948px;height:626px;box-shadow:0 60px 140px rgb(0 0 0 / 55%), 0 14px 34px rgb(0 0 0 / 30%)");
  const shotBezel = el(shot, "");
  shotBezel.id = "shotBezel";
  const shotClip = el(shot, "");
  shotClip.id = "shotClip";
  const shotInner = el(shotClip, "");
  shotInner.id = "shotInner";
  shotInner.innerHTML = productWindow(false, true);
  el(shotInner, "anno-rect", "left:910px;top:290px;width:312px;height:130px");
  el(shotInner, "anno-hl", "left:624px;top:438px;width:172px;height:28px");
  BADGES.forEach(([x, y], i) => el(shotInner, "badge", `left:${x}px;top:${y}px`, String(i + 1)));
  const looksStrip = el(showcase, "looks");
  const lookTiles = LOOKS.map((look) =>
    el(looksStrip, "look", "", `<div class="th" style="background:${look.bg}"></div><span>${look.label}</span>`));
  const copyBtn = el(showcase, "btn dark", "left:1515px;top:60px", `${icon("Copy01")}Copy`);
  const exportBtn = el(showcase, "btn light", "left:1640px;top:60px", `${icon("Download04")}Export`);
  const toastExport = el(showcase, "toast", "left:1290px;top:128px",
    `<span class="ok">${icon("Tick02", 16)}</span>Exported <span class="meta">PNG · 2× · Pictures › CapKit</span>`);

  /* corners used by the intro → desktop transition */
  const frameCorners = $("#frameCorners");
  const corners = [
    "border-top-width:5px;border-left-width:5px;border-top-left-radius:14px",
    "border-top-width:5px;border-right-width:5px;border-top-right-radius:14px",
    "border-bottom-width:5px;border-right-width:5px;border-bottom-right-radius:14px",
    "border-bottom-width:5px;border-left-width:5px;border-bottom-left-radius:14px",
  ].map((style) => el(frameCorners, "corner", style));

  /* outro / intro overlay */
  const outro = $("#outro");
  const introLogo = el(outro, "", "position:absolute;left:850px;top:250px;width:220px;height:220px", logoSvg("in"));
  const introLines = el(outro, "abs", "width:1920px;top:540px;text-align:center;font:750 92px/1.08 Jakarta;letter-spacing:-0.045em;color:#f6f6f1");
  introLines.innerHTML =
    ["Everything", "you", "show,"].map((w) => `<span class="w" style="display:inline-block;margin:0 .13em">${w}</span>`).join("") +
    "<br>" +
    ["in", "one", '<span style="color:#d9ff43">tiny</span>', '<span style="color:#d9ff43">tool.</span>'].map((w) => `<span class="w" style="display:inline-block;margin:0 .13em">${w}</span>`).join("");
  const introWords = Array.from(introLines.querySelectorAll(".w"));

  const sizeEye = el(outro, "meta-line", "top:262px", "The entire download");
  const bigSize = el(outro, "bigsize", "top:318px", "");
  const ticks = el(outro, "ticks", "left:360px;top:668px;width:1200px");
  const STATS = ["<b>≈33 MB</b> RAM at idle", "<b>0%</b> CPU while waiting", "No account. <b>No cloud.</b>"];
  const stats = STATS.map((html, i) => el(outro, "stat", `left:${560 + i * 400}px;top:712px`, html));
  const CHIPS = [["Scan", "Capture"], ["PaintBrush02", "Draw"], ["Presentation01", "Showcase"], ["Video01", "Record"]];
  const chips = CHIPS.map(([name, label], i) =>
    el(outro, "chip", `left:${452 + i * 262}px;top:812px;width:236px;justify-content:center`, icon(name, 26) + label));

  const endLogo = el(outro, "", "position:absolute;left:0;top:0;width:150px;height:150px", logoSvg("end"));
  const endWord = el(outro, "word", "left:818px;top:322px", "CapKit");
  const endTag = el(outro, "tag", "top:530px", "The lightweight desktop toolkit to capture, record, and showcase.");
  const endMeta = el(outro, "meta-line", "top:620px", "Windows 11 &nbsp;·&nbsp; Microsoft Store");

  /* cursor + ripples (stage space, mapped through the camera) */
  const cursor = el(stage, "", "z-index:45;transform-origin:0 0");
  cursor.id = "cursor";
  cursor.innerHTML = `
    <svg data-k="arrow" width="30" height="38" viewBox="0 0 30 38" style="left:-3px;top:-3px"><path d="M3 3 L3 29 L9.5 22.5 L14 33 L18.5 31 L14 20.5 L22.5 20.5 Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>
    <svg data-k="cross" width="36" height="36" viewBox="0 0 36 36" style="left:-18px;top:-18px"><path d="M18 2v12M18 22v12M2 18h12M22 18h12" stroke="#111" stroke-width="4.5" stroke-linecap="round"/><path d="M18 2v12M18 22v12M2 18h12M22 18h12" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
    <svg data-k="pen" width="30" height="30" viewBox="0 0 30 30" style="left:-15px;top:-15px"><circle cx="15" cy="15" r="7" fill="#ff5b4d" stroke="#fff" stroke-width="2.5"/></svg>`;
  const cursorKinds = Array.from(cursor.querySelectorAll("svg"));
  const ripplesLayer = el(stage, "", "position:absolute;left:0;top:0;z-index:44");

  const scrim = $("#scrim");
  const hl = $("#hl");
  const hlEye = $("#hlEye");
  const hlText = $("#hlText");
  const hlPlate = document.createElement("div");
  hlPlate.style.cssText = "position:absolute;left:-44px;top:-34px;right:-48px;bottom:-30px;border-radius:40px;background:rgb(12 13 11 / 86%);border:2px solid rgb(255 255 255 / 10%);z-index:-1";
  hlText.style.position = "relative";
  const keys = $("#keys");

  /* ------------------------------------------------------- headlines ------ */
  const HEADLINES = [
    { start: S1, end: S1 + 5000, eye: "01 — Capture · Alt + Shift + S", text: "Capture any *region.*", hero: true },
    { start: S1 + 5000, end: S3, eye: "", text: "Mark it up in *place.*", hero: false },
    { start: S3, end: S4, eye: "02 — Screen Draw · Alt + Shift + A", text: "Draw on a *live* screen.", hero: true },
    { start: S4, end: S5, eye: "03 — Showcase", text: "Make it *launch-ready.*", hero: true },
    { start: S5, end: S5 + 6200, eye: "04 — Record · Alt + Shift + R", text: "Record your *screen.*", hero: true },
    { start: S5 + 6200, end: S6, eye: "", text: "Smooth zoom, from your *clicks.*", hero: false },
  ];
  let builtHeadline = -1;
  let hlWords = [];
  function renderHeadline(t) {
    const index = HEADLINES.findIndex((h) => t >= h.start && t < h.end);
    if (index < 0) {
      show(hl, 0);
      show(scrim, 0);
      return;
    }
    const h = HEADLINES[index];
    if (builtHeadline !== index) {
      builtHeadline = index;
      hlEye.textContent = h.eye;
      hlEye.style.display = h.eye ? "block" : "none";
      hlText.innerHTML = "";
      hlText.append(hlPlate);
      hlText.insertAdjacentHTML("beforeend", h.text.split(" ").map((word) => {
        const lime = word.startsWith("*");
        const clean = word.replaceAll("*", "");
        return `<span class="w"${lime ? ' style="color:#d9ff43"' : ""}>${clean}</span>`;
      }).join(" "));
      hlWords = Array.from(hlText.querySelectorAll(".w"));
    }
    const local = t - h.start;
    const exit = 1 - prog(t, h.end - 280, 280);
    const width = hl.offsetWidth, height = hl.offsetHeight;
    const eyeHeight = h.eye ? hlEye.offsetHeight + 22 : 0;
    const CORNER_SCALE = 0.4;
    const cornerX = 96, cornerY = 70 - eyeHeight * CORNER_SCALE;
    if (h.hero) {
      hlWords.forEach((word, i) => {
        const p = prog(local, 120 + i * 70, 720);
        word.style.transform = `translateY(${((1 - p) * 0.42).toFixed(3)}em)`;
        word.style.opacity = String(p);
      });
      const move = prog(local, 1100, 720, ease.inOut);
      const x = lerp((1920 - width) / 2, cornerX, move);
      const y = lerp((1080 - height) / 2, cornerY, move);
      tf(hl, x, y, lerp(1, CORNER_SCALE, move), exit);
      hlEye.style.opacity = String(prog(local, 0, 400) * (1 - prog(local, 1100, 260)));
      hlPlate.style.opacity = String(prog(local, 1450, 400));
      show(scrim, prog(local, 0, 260) * (1 - prog(local, 1100, 620, ease.inOut)));
    } else {
      hlWords.forEach((word) => { word.style.transform = "none"; word.style.opacity = "1"; });
      const p = prog(local, 0, 320);
      tf(hl, cornerX, cornerY + (1 - p) * 10, CORNER_SCALE, p * exit);
      hlPlate.style.opacity = "1";
      show(scrim, 0);
    }
  }

  /* --------------------------------------------------------- keycaps ------ */
  const KEYS = [
    { start: S1 + 1900, end: S1 + 2700, press: S1 + 2150, keys: ["Alt", "Shift", "S"] },
    { start: S1 + 10600, end: S1 + 11300, press: S1 + 10800, keys: ["C"] },
    { start: S3 + 1900, end: S3 + 2600, press: S3 + 2150, keys: ["Alt", "Shift", "A"] },
    { start: S3 + 6800, end: S3 + 7400, press: S3 + 7000, keys: ["Esc"] },
    { start: S5 + 1900, end: S5 + 2600, press: S5 + 2150, keys: ["Alt", "Shift", "R"] },
  ];
  let builtKeys = -1;
  function renderKeys(t) {
    const index = KEYS.findIndex((k) => t >= k.start && t < k.end);
    if (index < 0) { show(keys, 0); return; }
    const k = KEYS[index];
    if (builtKeys !== index) {
      builtKeys = index;
      keys.innerHTML = k.keys.map((key) => `<span class="key">${key}</span>`).join('<span class="plus">+</span>');
    }
    const p = prog(t, k.start, 220);
    const o = p * (1 - prog(t, k.end - 220, 220));
    tf(keys, (1920 - keys.offsetWidth) / 2, 952 + (1 - p) * 14, 1, o);
    const pressed = t >= k.press && t < k.press + 170;
    keys.querySelectorAll(".key").forEach((key) => {
      key.style.transform = pressed ? "translateY(3px) scale(0.96)" : "none";
      key.style.boxShadow = pressed ? "0 1px 0 #0b0c0a, 0 10px 24px rgb(0 0 0 / 40%)" : "";
      key.style.background = pressed ? "linear-gradient(#3a3d2c, #23261c)" : "";
      key.style.borderColor = pressed ? "rgb(217 255 67 / 70%)" : "";
    });
  }

  /* ---------------------------------------------------------- cursor ------ */
  const at = (base, rows) => rows.map(([dt, x, y]) => [base + dt, x, y]);
  const PLAYBACK_START = S5 + 7100, PLAYBACK_DUR = 3200;
  const circleStart = inkCircle.getPointAtLength(0);
  const circleEnd = inkCircle.getPointAtLength(inkLens[0]);
  const arrowStart = inkArrow.getPointAtLength(0);
  const arrowEnd = inkArrow.getPointAtLength(inkLens[1]);
  const WAYPOINTS = [
    ...at(S1, [[1700, 1300, 700], [2500, 1300, 700], [3100, 900, 520], [3200, 900, 520], [3600, 596, 284], [3700, 596, 284],
      [4500, 1544, 910], [5000, 1544, 910], [5450, 678, 952], [5550, 678, 952], [5900, 910, 290], [5950, 910, 290],
      [6600, 1222, 420], [6700, 1222, 420], [7050, 730, 952], [7150, 730, 952], [7450, 624, 452], [7500, 624, 452],
      [7950, 796, 452], [8050, 796, 452], [8350, 834, 952], [8450, 834, 952], [8650, 1496, 496], [8750, 1496, 496],
      [8900, 1496, 540], [9000, 1496, 540], [9150, 1496, 584], [9300, 1496, 584], [9600, 782, 952], [9700, 782, 952],
      [9950, 826, 780], [10000, 826, 780], [10450, 1084, 892], [12500, 1084, 892]]),
    ...at(S3, [[2600, 1084, 892], [2900, circleStart.x, circleStart.y], [3700, circleEnd.x, circleEnd.y],
      [3800, arrowStart.x, arrowStart.y], [4300, arrowEnd.x, arrowEnd.y], [4450, arrowEnd.x, arrowEnd.y],
      [4550, 830, 268], [5350, 1080, 268], [5550, 1449, 246], [5800, 1449, 246], [6900, 912, 520], [7600, 912, 520]]),
    ...at(S4, [[1900, 1300, 760], [2000, 1300, 760], [2400, 717, 946], [2900, 717, 946], [3200, 879, 946], [3700, 879, 946],
      [4050, 1203, 946], [4550, 1203, 946], [4850, 1041, 946], [5400, 1041, 946], [5950, 1705, 83], [8600, 1705, 83]]),
    ...at(S5, [[3600, 1200, 700], [3700, 1200, 700], [4300, 758, 355], [4600, 758, 355], [5200, 1449, 246],
      [5500, 1449, 246], [5900, 1182, 988], [6200, 1182, 988]]),
  ];
  /** Intervals where the cursor follows an ink path exactly. */
  const PATH_FOLLOW = [
    { t0: S3 + 2900, t1: S3 + 3700, path: inkCircle, len: inkLens[0], e: ease.inOut },
    { t0: S3 + 3800, t1: S3 + 4300, path: inkArrow, len: inkLens[1], e: ease.inOut },
  ];
  const PLAYBACK_CURSOR = [[0, 1200, 700], [0.15, 1200, 700], [0.25, 758, 355], [0.35, 758, 355], [0.55, 1449, 246], [0.62, 1449, 246], [0.85, 1200, 640], [1, 1200, 640]];
  const VISIBLE = [[S1 + 1700, S1 + 11900], [S3 + 2600, S3 + 7300], [S4 + 1900, S4 + 8300], [S5 + 3600, S5 + 6150], [PLAYBACK_START, PLAYBACK_START + PLAYBACK_DUR + 300]];
  const KINDS = [[0, "arrow"], [S1 + 2300, "cross"], [S1 + 4500, "arrow"], [S3 + 2600, "pen"], [S3 + 7300, "arrow"]];
  const CLICKS = [S1 + 5500, S1 + 7100, S1 + 8400, S1 + 8700, S1 + 8950, S1 + 9200, S1 + 9650,
    S4 + 2450, S4 + 3250, S4 + 4100, S4 + 4900, S4 + 6000, S5 + 4400, S5 + 5300, S5 + 5950];

  function interpolate(rows, t, e = ease.move) {
    if (t <= rows[0][0]) return [rows[0][1], rows[0][2]];
    for (let i = 0; i < rows.length - 1; i += 1) {
      const [t0, x0, y0] = rows[i];
      const [t1, x1, y1] = rows[i + 1];
      if (t <= t1) {
        const p = t1 === t0 ? 1 : e((t - t0) / (t1 - t0));
        return [lerp(x0, x1, p), lerp(y0, y1, p)];
      }
    }
    const last = rows[rows.length - 1];
    return [last[1], last[2]];
  }
  function deskCursor(t) {
    if (t >= PLAYBACK_START - 200) {
      const f = clamp((t - PLAYBACK_START) / PLAYBACK_DUR);
      return interpolate(PLAYBACK_CURSOR, f);
    }
    for (const follow of PATH_FOLLOW) {
      if (t >= follow.t0 && t <= follow.t1) {
        const point = follow.path.getPointAtLength(follow.e((t - follow.t0) / (follow.t1 - follow.t0)) * follow.len);
        return [point.x, point.y];
      }
    }
    return interpolate(WAYPOINTS, t);
  }

  /* ---------------------------------------------------------- camera ------ */
  const CAMERA = [[0, 1, 960, 540], [0.17, 1, 960, 540], [0.3, 1.8, 758, 355], [0.45, 1.8, 758, 355], [0.6, 1.8, 1449, 246], [0.78, 1.8, 1449, 246], [0.93, 1, 960, 540], [1, 1, 960, 540]];
  function cameraAt(t) {
    if (t < PLAYBACK_START || t > S6 + 600) return { s: 1, tx: 0, ty: 0 };
    const f = clamp((t - PLAYBACK_START) / PLAYBACK_DUR);
    let s = 1, fx = 960, fy = 540;
    for (let i = 0; i < CAMERA.length - 1; i += 1) {
      const a = CAMERA[i], b = CAMERA[i + 1];
      if (f <= b[0]) {
        const p = ease.inOut((f - a[0]) / (b[0] - a[0]));
        s = lerp(a[1], b[1], p); fx = lerp(a[2], b[2], p); fy = lerp(a[3], b[3], p);
        break;
      }
    }
    const tx = clamp(960 - fx * s, 1920 - 1920 * s, 0);
    const ty = clamp(540 - fy * s, 1080 - 1080 * s, 0);
    return { s, tx, ty };
  }
  const STUDIO = { s: 0.62, x: 960 - 960 * 0.62, y: 440 - 540 * 0.62 };
  function wrapAt(t) {
    const p = prog(t, S5 + 6100, 800, ease.inOut);
    return { s: lerp(1, STUDIO.s, p), x: lerp(0, STUDIO.x, p), y: lerp(0, STUDIO.y, p), p };
  }

  /* ripples */
  const RIPPLES = [
    [S5 + 4400, 758, 355], [S5 + 5300, 1449, 246],
    [PLAYBACK_START + 0.27 * PLAYBACK_DUR, 758, 355], [PLAYBACK_START + 0.58 * PLAYBACK_DUR, 1449, 246],
  ].map(([time, x, y]) => ({ time, x, y, node: el(ripplesLayer, "ripple", "left:0;top:0") }));

  /* ------------------------------------------------------------ render ---- */
  function renderDesk(t, cam, wrap) {
    // Which desktop layers are visible
    let deskO = 0;
    if (t >= S1 + 1100 && t < S4 + 300) deskO = prog(t, S1 + 1100, 420);
    if (t >= S5 + 300 && t < S6 + 600) deskO = 1 - prog(t, S6, 450);
    show(deskWrap, deskO);
    deskWrap.style.transform = `translate3d(${wrap.x}px, ${wrap.y}px, 0) scale(${wrap.s})`;
    deskWrap.style.borderRadius = `${(wrap.p * 18) / wrap.s}px`;
    deskWrap.style.boxShadow = wrap.p > 0 ? `0 0 0 ${1.5 / wrap.s}px rgb(255 255 255 / ${0.12 * wrap.p}), 0 ${60 / wrap.s}px ${140 / wrap.s}px rgb(0 0 0 / ${0.5 * wrap.p})` : "none";
    deskCam.style.transform = `translate3d(${cam.tx}px, ${cam.ty}px, 0) scale(${cam.s})`;

    // Live data: the desktop keeps changing while Screen Draw is open.
    const ticksSince = t - (S3 + 2700);
    const signups = ticksSince < 0 ? 12480 : Math.min(12486, 12481 + Math.floor(ticksSince / 700));
    kpiSignups.textContent = signups.toLocaleString("en-US");

    /* --- capture + annotate (S1) --- */
    const L = t - S1;
    const capO = t >= S1 && t < S3 ? 1 - prog(L, 11500, 300) : 0;
    show(cap, capO);
    if (capO > 0) {
      const dragging = L >= 3700;
      show(tintFull, dragging ? 0 : prog(L, 2300, 200));
      tf(snap, 0, 0, lerp(1.03, 1, prog(L, 3000, 180)), prog(L, 3000, 150) * (1 - prog(L, 3250, 150)));
      const [hx, hy] = deskCursor(t);
      tf(hint, hx + 26, hy + 30, 1, prog(L, 2400, 200) * (1 - prog(L, 3500, 150)));

      const dp = prog(L, 3700, 800, ease.move);
      const sw = lerp(0, 948, dp), sh = lerp(0, 626, dp);
      sel.style.width = `${sw}px`;
      sel.style.height = `${sh}px`;
      sel.style.boxShadow = "0 0 0 1px rgb(0 0 0 / 25%), 0 0 0 4000px rgb(7 8 7 / 64%)";
      show(sel, dragging ? 1 : 0);
      dims.textContent = `${Math.round(sw)} × ${Math.round(sh)} px`;
      tf(dims, 0, 0, 1, dragging ? 1 : 0);
      handles.forEach((handle, i) => {
        const p = prog(L, 4550 + i * 18, 200);
        handle.style.transform = `scale(${p})`;
      });
      tf(rail, (1 - prog(L, 4600, 260)) * 12, 0, 1, prog(L, 4600, 220));
      tf(toolDock, 0, (1 - prog(L, 4650, 260)) * 12, 1, prog(L, 4650, 220));

      const activeTool = L < 5500 ? 0 : L < 7100 ? 1 : L < 8400 ? 2 : L < 9650 ? 4 : 3;
      tools.forEach((tool, i) => tool.classList.toggle("on", i === activeTool));
      const copying = L >= 10800 && L < 11050;
      railTools[0].classList.toggle("on", copying);

      const rp = prog(L, 5950, 650, ease.move);
      annoRect.style.width = `${312 * rp}px`;
      annoRect.style.height = `${130 * rp}px`;
      show(annoRect, L >= 5950 ? 1 : 0);
      annoHl.style.width = `${172 * prog(L, 7500, 450, ease.move)}px`;
      show(annoHl, L >= 7500 ? 0.62 : 0);
      [8700, 8950, 9200].forEach((popAt, i) => {
        const p = prog(L, popAt, 260);
        tf(badges[i], 0, 0, lerp(0.5, 1, p), L >= popAt ? Math.min(1, p * 1.6) : 0);
      });
      const bp = prog(L, 10000, 450, ease.move);
      blurBox.style.width = `${258 * bp}px`;
      blurBox.style.height = `${112 * bp}px`;
      show(blurBox, L >= 10000 ? 1 : 0);

    }
    const toastP = prog(L, 10850, 260);
    tf(toastCopy, 0, (1 - toastP) * 10, lerp(0.97, 1, toastP), L >= 10850 && L < 12400 ? toastP * (1 - prog(L, 12100, 200)) : 0);

    /* --- screen draw (S3) --- */
    const D = t - S3;
    const drawO = t >= S3 && t < S4 ? 1 - prog(D, 7050, 300) : 0;
    show(draw, drawO);
    if (drawO > 0) {
      const dockP = prog(D, 2600, 260);
      tf(drawDockRow, 0, (1 - dockP) * 16, 1, dockP);
      tf(live, 0, (1 - prog(D, 2700, 260)) * -8, 1, prog(D, 2700, 240));
      const tool = D < 3750 ? 0 : D < 4500 ? 2 : D < 5500 ? 4 : 5;
      drawTools.forEach((node, i) => node.classList.toggle("on", i === tool));
      inkCircle.style.strokeDashoffset = String(inkLens[0] * (1 - prog(D, 2900, 800, ease.inOut)));
      inkArrow.style.strokeDashoffset = String(inkLens[1] * (1 - prog(D, 3800, 500, ease.inOut)));
      inkHead.style.strokeDashoffset = String(inkLens[2] * (1 - prog(D, 4300, 150, ease.linear)));
      show(inkCircle, D >= 2900 ? 1 : 0);
      show(inkArrow, D >= 3800 ? 1 : 0);
      show(inkHead, D >= 4300 ? 1 : 0);
      const writeP = prog(D, 4550, 800, ease.linear);
      scrawl.style.clipPath = `inset(-20px ${((1 - writeP) * 100).toFixed(2)}% -20px -10px)`;
      show(scrawl, D >= 4550 ? 1 : 0);
      const spotO = prog(D, 5550, 260);
      const [sx, sy] = deskCursor(t);
      spot.style.background = `radial-gradient(circle at ${sx}px ${sy}px, transparent 0, transparent 186px, rgb(7 8 7 / 74%) 198px)`;
      show(spot, spotO);
    }

    /* --- recording (S5) --- */
    const R = t - S5;
    const recO = t >= S5 && t < S6 ? 1 - prog(R, 6100, 180) : 0;
    show(rec, recO);
    if (recO > 0) {
      const digits = ["3", "2", "1"];
      const step = Math.floor((R - 2500) / 300);
      if (step >= 0 && step < 3) {
        const local = R - 2500 - step * 300;
        countdown.textContent = digits[step];
        tf(countdown, 0, 0, lerp(0.86, 1, prog(local, 0, 160)), prog(local, 0, 120) * (1 - prog(local, 220, 80)));
      } else {
        show(countdown, 0);
      }
      show(recBorder, prog(R, 3400, 160));
      tf(recDock, 0, (1 - prog(R, 3400, 280)) * 16, 1, prog(R, 3400, 240));
      const elapsed = Math.max(0, Math.floor((R - 3400) / 1000));
      recTime.textContent = `00:${String(elapsed).padStart(2, "0")}`;
      recStop.style.transform = R >= 5950 && R < 6100 ? "scale(0.95)" : "none";
    }
  }

  function renderCursorAndRipples(t, cam, wrap) {
    const [dx, dy] = deskCursor(t);
    const sx = (dx * cam.s + cam.tx) * wrap.s + wrap.x;
    const sy = (dy * cam.s + cam.ty) * wrap.s + wrap.y;
    let o = 0;
    for (const [a, b] of VISIBLE) if (t >= a - 150 && t <= b + 150) o = Math.max(o, prog(t, a - 150, 150) * (1 - prog(t, b, 150)));
    let kind = "arrow";
    for (const [time, k] of KINDS) if (t >= time) kind = k;
    cursorKinds.forEach((svg) => { svg.style.display = svg.dataset.k === kind ? "block" : "none"; });
    const pressed = CLICKS.some((c) => t >= c && t < c + 140);
    const scale = cam.s * wrap.s * (pressed ? 0.86 : 1);
    tf(cursor, sx, sy, scale, o);
    for (const ripple of RIPPLES) {
      const p = clamp((t - ripple.time) / 520);
      const active = t >= ripple.time && p < 1;
      const rx = (ripple.x * cam.s + cam.tx) * wrap.s + wrap.x;
      const ry = (ripple.y * cam.s + cam.ty) * wrap.s + wrap.y;
      tf(ripple.node, rx, ry, lerp(0.35, 1.7, ease.out(p)) * cam.s * wrap.s, active ? 0.9 * (1 - p) : 0);
    }
  }

  function renderStudio(t, wrap) {
    const R = t - S5;
    const out = 1 - prog(t, S6, 450);
    show(studioBg, t >= S5 ? prog(R, 6100, 500) * out : 0);
    const panelP = prog(R, 6500, 320);
    tf(timelinePanel, 0, (1 - panelP) * 20, 1, panelP);
    tf(autoPill, 0, (1 - prog(R, 7300, 260)) * 8, 1, prog(R, 7300, 240));
    show(studioUi, t >= S5 + 6400 ? out : 0);
    const f = clamp((t - PLAYBACK_START) / PLAYBACK_DUR);
    playhead.style.transform = `translateX(${(f * 1268).toFixed(1)}px)`;
    zoomBlocks.forEach((block, i) => {
      const [a, b] = ZOOM_BLOCKS[i];
      block.style.opacity = f >= a && f <= b ? "1" : "0.55";
    });

    // Camera bubble: recorder corner → studio canvas corner
    const camIn = prog(R, 3450, 320);
    const recPos = { x: 1650, y: 750, s: 1 };
    const studioPos = { x: wrap.x + 1660 * STUDIO.s - 10, y: wrap.y + 790 * STUDIO.s - 6, s: 0.62 };
    const p = wrap.p;
    const bx = lerp(recPos.x, studioPos.x, p), by = lerp(recPos.y, studioPos.y, p), bs = lerp(recPos.s, studioPos.s, p);
    const visible = t >= S5 + 3450 && t < S6 + 600;
    tf(camBubble, bx, by + (1 - camIn) * 12, bs * lerp(0.92, 1, camIn), visible ? camIn * out : 0);
  }

  function renderShowcase(t) {
    const C = t - S4;
    const visible = t >= S4 + 300 && t < S5 + 300;
    show(showcase, visible ? 1 : 0);
    if (!visible) return;
    const CLICK_AT = [[0, 0], [2450, 1], [3250, 2], [4100, 4], [4900, 3]];
    let from = 0, to = 0, switchAt = 0;
    for (const [time, look] of CLICK_AT) if (C >= time) { from = to; to = look; switchAt = time; }
    const p = switchAt === 0 ? 1 : prog(C, switchAt, 480, ease.inOut);
    const a = LOOKS[from], b = LOOKS[to];
    const mix = (key) => lerp(a[key], b[key], p);
    backdrops.forEach((bd, i) => {
      const fade = prog(C, switchAt, 380);
      show(bd, i === to ? 1 : i === from && switchAt !== 0 ? 1 - fade : 0);
      bd.style.zIndex = i === to ? "1" : "0";
    });
    const enter = prog(C, 1100, 760);
    const s = mix("s") * lerp(0.94, 1, enter);
    shot.style.transform = `translate3d(486px, ${142 + (1 - enter) * 40}px, 0) perspective(2400px) rotateX(${mix("rx")}deg) rotateY(${mix("ry")}deg) scale(${s})`;
    shot.style.zIndex = "2";
    show(shot, enter);
    shotClip.style.borderRadius = `${mix("r")}px`;
    shotShadow.style.borderRadius = `${mix("r")}px`;
    shotShadow.style.opacity = String(mix("shadow"));
    shotBezel.style.opacity = String(mix("bezel"));
    lookTiles.forEach((tile, i) => tile.classList.toggle("on", i === to));
    const ui = prog(C, 1500, 300);
    tf(looksStrip, 0, (1 - ui) * 16, 1, ui, "translateX(-50%)");
    looksStrip.style.transform = `translateX(-50%) translateY(${((1 - ui) * 16).toFixed(1)}px)`;
    looksStrip.style.zIndex = "3";
    tf(copyBtn, 0, (1 - ui) * -10, 1, ui);
    tf(exportBtn, 0, (1 - ui) * -10, C >= 6000 && C < 6140 ? 0.95 : 1, ui);
    copyBtn.style.zIndex = exportBtn.style.zIndex = "3";
    const toastP = prog(C, 6050, 260);
    tf(toastExport, 0, (1 - toastP) * -10, lerp(0.97, 1, toastP), C >= 6050 ? toastP : 0);
    toastExport.style.zIndex = "4";
  }

  function renderIntroOutro(t) {
    /* intro */
    const introOut = 1 - prog(t, 3000, 380);
    const introVisible = t < 3500;
    show(introLogo, introVisible ? prog(t, 150, 450) * introOut : 0);
    if (introVisible) {
      introLogo.style.transform = `translateY(${(-prog(t, 3000, 380) * 12).toFixed(1)}px) scale(${lerp(0.9, 1, prog(t, 150, 700))})`;
      $("#inBr").style.strokeDashoffset = String(1 - prog(t, 350, 850, ease.inOut));
      $("#inSq").style.transform = `scale(${prog(t, 800, 450)})`;
      $("#inAr").style.strokeDashoffset = String(1 - prog(t, 1100, 350, ease.inOut));
      introWords.forEach((word, i) => {
        const p = prog(t, 1450 + i * 75, 720);
        word.style.transform = `translateY(${((1 - p) * 0.4).toFixed(3)}em)`;
        word.style.opacity = String(p);
      });
    }
    show(introLines, introVisible ? introOut : 0);

    /* corners: logo frame expands to the full screen as the desktop arrives */
    const cP = prog(t, S1 + 1100, 760, ease.inOut);
    const box = { x: lerp(866, 26, cP), y: lerp(266, 26, cP), w: lerp(188, 1868, cP), h: lerp(188, 1028, cP) };
    const cornersO = t >= S1 + 1000 && t < S1 + 2200 ? prog(t, S1 + 1000, 150) * (1 - prog(t, S1 + 1750, 350)) : 0;
    show(frameCorners, cornersO);
    const size = lerp(40, 64, cP);
    corners.forEach((corner, i) => {
      const x = i === 0 || i === 3 ? box.x : box.x + box.w - size;
      const y = i < 2 ? box.y : box.y + box.h - size;
      corner.style.left = `${x}px`;
      corner.style.top = `${y}px`;
      corner.style.width = corner.style.height = `${size}px`;
    });
    frameCorners.style.zIndex = "55";

    /* size reveal */
    const Z = t - S6;
    const sizeVisible = t >= S6 && t < S7 + 200;
    const sizeOut = 1 - prog(Z, 3900, 400);
    show(sizeEye, sizeVisible ? prog(Z, 500, 320) * sizeOut : 0);
    sizeEye.style.transform = `translateY(${((1 - prog(Z, 500, 400)) * 10).toFixed(1)}px)`;
    const countP = prog(Z, 650, 1200, ease.out);
    bigSize.innerHTML = `${(5.4 * countP).toFixed(1)}<small>MB</small>`;
    show(bigSize, sizeVisible ? prog(Z, 600, 300) * sizeOut : 0);
    bigSize.style.transform = `translateY(${((1 - prog(Z, 600, 600)) * 24).toFixed(1)}px)`;
    ticks.style.transform = `scaleX(${prog(Z, 900, 700, ease.inOut)})`;
    ticks.style.transformOrigin = "50% 50%";
    show(ticks, sizeVisible ? sizeOut : 0);
    stats.forEach((stat, i) => {
      const p = prog(Z, 1900 + i * 140, 420);
      tf(stat, 0, (1 - p) * 12, 1, sizeVisible ? p * sizeOut : 0, "translateX(-50%)");
      stat.style.transform = `translateX(-50%) translateY(${((1 - p) * 12).toFixed(1)}px)`;
    });
    const converge = prog(Z, 3900, 520, ease.inOut);
    chips.forEach((chip, i) => {
      const p = prog(Z, 2500 + i * 110, 420);
      const homeX = 452 + i * 262 + 118;
      const dx = (960 - homeX) * converge;
      const dy = (420 - 844) * converge;
      tf(chip, dx, (1 - p) * 14 + dy, lerp(1, 0.35, converge), sizeVisible ? p * (1 - prog(Z, 4150, 260)) : 0);
    });

    /* end card */
    const E = t - S7;
    const endVisible = t >= S7 - 200;
    const fadeAll = 1 - prog(t, END - 600, 600, ease.inOut);
    const logoIn = prog(E, -200, 650);
    const slide = prog(E, 700, 650, ease.inOut);
    const logoX = lerp(960 - 75, 632, slide);
    tf(endLogo, logoX, 322, lerp(0.6, 1, logoIn), endVisible ? logoIn * fadeAll : 0);
    endLogo.style.transformOrigin = "75px 75px";
    $("#endBr").style.strokeDashoffset = String(1 - prog(E, -100, 700, ease.inOut));
    $("#endSq").style.transform = `scale(${prog(E, 100, 450)})`;
    $("#endAr").style.strokeDashoffset = String(1 - prog(E, 350, 350, ease.inOut));
    const wordP = prog(E, 850, 600);
    endWord.style.clipPath = `inset(-20px ${((1 - wordP) * 100).toFixed(1)}% -20px -20px)`;
    tf(endWord, (1 - wordP) * -24, 0, 1, endVisible ? wordP * fadeAll : 0);
    const tagP = prog(E, 1350, 520);
    tf(endTag, 0, (1 - tagP) * 12, 1, tagP * fadeAll);
    const metaP = prog(E, 1700, 520);
    tf(endMeta, 0, (1 - metaP) * 10, 1, metaP * fadeAll);
  }

  function seek(ms) {
    const t = clamp(ms, 0, END);
    const cam = cameraAt(t);
    const wrap = t >= S5 && t < S6 + 600 ? wrapAt(t) : { s: 1, x: 0, y: 0, p: 0 };
    renderDesk(t, cam, wrap);
    renderStudio(t, wrap);
    renderShowcase(t);
    renderCursorAndRipples(t, cam, wrap);
    renderHeadline(t);
    renderKeys(t);
    renderIntroOutro(t);
  }
  window.seek = seek;

  /* ----------------------------------------------------- preview modes ---- */
  const params = new URLSearchParams(location.search);
  if (params.has("play")) {
    const from = Number(params.get("from") ?? 0);
    document.fonts.ready.then(() => {
      const started = performance.now();
      const frame = (now) => {
        const t = from + (now - started);
        seek(t % END);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  } else {
    seek(Number(params.get("t") ?? 0));
    document.fonts.ready.then(() => seek(Number(params.get("t") ?? 0)));
  }
})();
