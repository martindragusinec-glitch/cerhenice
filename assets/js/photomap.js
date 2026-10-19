// Fotomapa: výběr pozemku přímo ve vizualizaci celé lokality (assets/data/fotomapa.js).
// Stejné rozhraní jako 3D model (select, hover, setStatus, setFilter), aby šly přepínat.
import { FOTOMAPA as F } from "../data/fotomapa.js";
import { PARCELS } from "../data/parcels.js";

const NS = "http://www.w3.org/2000/svg";
const byId = Object.fromEntries(PARCELS.map((p) => [p.id, p]));
const xs = Object.values(F.plots).flat().map((p) => p[0]), ys = Object.values(F.plots).flat().map((p) => p[1]);
const BOX = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createPhotomap(host, { onSelect, onHover } = {}) {
  const root = document.createElement("div");
  root.className = "fm";
  root.innerHTML = `
    <div class="fm-layer">
      <picture><source type="image/webp" srcset="assets/img/fotomapa-v2-sm.webp 1800w, assets/img/fotomapa-v2.webp 3600w" sizes="(max-width: 900px) 200vw, 2600px">
      <img src="assets/img/fotomapa-v2.jpg" alt="Vizualizace celé lokality Za Kapličkou z dronu s vyznačenými pozemky" width="${F.w}" height="${F.h}" draggable="false" decoding="async"></picture>
      <svg viewBox="0 0 ${F.w} ${F.h}" aria-hidden="true">
        <defs><pattern id="fm-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="rgba(228,203,60,.28)"/><rect width="5" height="14" fill="rgba(228,203,60,.62)"/></pattern></defs>
        <g class="fm-plots"></g>
      </svg>
    </div>
    <div class="fm-labels" aria-hidden="true"></div>`;
  root.style.setProperty("--fm-w", `${F.w}px`);
  root.style.setProperty("--fm-h", `${F.h}px`);
  host.appendChild(root);
  const layer = root.querySelector(".fm-layer"), g = root.querySelector(".fm-plots"), labelsEl = root.querySelector(".fm-labels");
  const img = root.querySelector("img");

  const items = {};
  for (const [id, poly] of Object.entries(F.plots)) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", poly.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("") + "Z");
    path.dataset.id = id;
    path.setAttribute("class", "fm-plot");
    g.appendChild(path);
    const lb = document.createElement("span");
    lb.className = "fm-label";
    lb.textContent = String(Number(id));
    labelsEl.appendChild(lb);
    items[id] = { path, lb };
  }

  const state = { status: {}, filter: { minArea: 0, onlyFree: false }, hovered: null, selected: null };
  let view = { s: 1, x: 0, y: 0 }, vw = 0, vh = 0, minS = 0.1, raf = 0;

  const statusOf = (id) => state.status[id] || "volny";
  const matches = (id) => { const p = byId[id], f = state.filter; return p.area >= (f.minArea || 0) && (!f.onlyFree || statusOf(id) === "volny"); };
  function paint() {
    for (const [id, { path, lb }] of Object.entries(items)) {
      const st = statusOf(id), on = matches(id);
      path.setAttribute("class", `fm-plot st-${st}${on ? "" : " is-dim"}${id === state.hovered ? " is-hover" : ""}${id === state.selected ? " is-sel" : ""}`);
      lb.className = `fm-label st-${st}${on ? "" : " is-dim"}${id === state.selected ? " is-sel" : ""}${id === state.hovered ? " is-hover" : ""}`;
    }
  }

  // ---------- pohled: posun a přiblížení ----------
  const clampView = () => {
    const s = view.s, w = F.w * s, h = F.h * s;
    view.x = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, view.x));
    view.y = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, view.y));
  };
  function apply() {
    clampView();
    layer.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`;
    root.style.setProperty("--fm-s", view.s);
    for (const [id, { lb }] of Object.entries(items)) {
      const [x, y] = F.labels[id];
      lb.style.transform = `translate3d(${(view.x + x * view.s).toFixed(1)}px, ${(view.y + y * view.s).toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
    root.classList.toggle("is-far", view.s < 0.2);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(); }); };
  function fitView() {
    const pad = vw < 700 ? 0.04 : 0.05;
    const bw = (BOX.x1 - BOX.x0) * (1 + 2 * pad), bh = (BOX.y1 - BOX.y0) * (1 + 2 * pad);
    const cover = Math.max(vw / F.w, vh / F.h);
    // počítač: celý obraz i s okolím; mobil na výšku: lokalita s rezervou, do stran se posouvá prstem
    const s = vw < 700 ? Math.max(cover, (vh * 0.66) / bh) : cover;
    const cx = (BOX.x0 + BOX.x1) / 2, cy = (BOX.y0 + BOX.y1) / 2;
    return { s, x: vw / 2 - cx * s, y: vh / 2 - cy * s };
  }
  let anim = 0;
  function animateTo(t, dur = 650) {
    cancelAnimationFrame(anim);
    if (reduce) { view = t; return apply(); }
    const f = { ...view }, t0 = performance.now(), ease = (k) => 1 - Math.pow(1 - k, 3);
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = ease(k);
      view = { s: Math.exp(Math.log(f.s) + (Math.log(t.s) - Math.log(f.s)) * e), x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e };
      apply();
      if (k < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  }
  function zoomAt(factor, px, py) {
    const s = Math.min(1.6, Math.max(minS, view.s * factor));
    view = { s, x: px - ((px - view.x) / view.s) * s, y: py - ((py - view.y) / view.s) * s };
    schedule();
  }
  function resize() {
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const first = !vw;
    vw = r.width; vh = r.height;
    minS = Math.max(vw / F.w, vh / F.h);
    if (first) view = fitView();
    view.s = Math.max(minS, view.s);
    apply();
  }
  new ResizeObserver(resize).observe(root);

  // ---------- myš, prst ----------
  const pts = new Map();
  let drag = null, moved = 0, pinch = null;
  const local = (e) => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hit = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.classList && el.classList.contains("fm-plot") ? el.dataset.id : null; };
  root.addEventListener("pointerdown", (e) => {
    if (e.button && e.button !== 0) return;
    pts.set(e.pointerId, local(e));
    root.setPointerCapture(e.pointerId);
    cancelAnimationFrame(anim);
    if (pts.size === 1) { drag = { p: local(e), v: { ...view } }; moved = 0; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s }; }
    host.dispatchEvent(new CustomEvent("mp:interact", { bubbles: true }));
  });
  root.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) {
      if (e.pointerType === "mouse") {
        const id = hit(e);
        if (id !== state.hovered) { state.hovered = id; paint(); }
        root.classList.toggle("is-pointer", !!id);
        onHover && onHover(id ? byId[id] : null, id ? { x: local(e)[0], y: local(e)[1] } : null);
      }
      return;
    }
    pts.set(e.pointerId, local(e));
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((pinch.s * d) / pinch.d / view.s, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      moved = 99;
      return;
    }
    if (drag) {
      const [x, y] = local(e);
      moved = Math.max(moved, Math.hypot(x - drag.p[0], y - drag.p[1]));
      if (moved > 4) { view = { ...view, x: drag.v.x + x - drag.p[0], y: drag.v.y + y - drag.p[1] }; schedule(); root.classList.add("is-dragging"); onHover && onHover(null, null); }
    }
  });
  const end = (e) => {
    const wasClick = drag && moved <= 4 && pts.size === 1;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      root.classList.remove("is-dragging");
      if (wasClick && e.type === "pointerup") {
        const id = hit(e);
        if (id) select(id, { source: "foto" });
        else if (state.selected) select(null);
      }
      drag = null;
    }
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);
  root.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !pts.size) { state.hovered = null; paint(); onHover && onHover(null, null); } });
  // kolečko posouvá stránku, přiblížení s Ctrl / ⌘ nebo sevřením prstů na touchpadu
  root.addEventListener("wheel", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const [x, y] = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.004), x, y);
  }, { passive: false });

  // ---------- veřejné rozhraní ----------
  function focusPlot(id) {
    const [x, y] = F.labels[id];
    const s = Math.max(view.s, vw < 700 ? 0.38 : view.s);
    const panel = vw >= 900 ? Math.min(420, vw * 0.34) : 0; // místo pro detail vpravo
    const tx = (vw - panel) / 2 - x * s, ty = (vw < 900 ? vh * 0.36 : vh / 2) - y * s;
    const out = x * view.s + view.x < 60 || x * view.s + view.x > vw - panel - 60 || y * view.s + view.y < 60 || y * view.s + view.y > vh - 60;
    if (out || s !== view.s) animateTo({ s, x: tx, y: ty });
  }
  function select(id, { source = "foto", fly = true } = {}) {
    state.selected = id || null;
    paint();
    if (id && fly) focusPlot(id);
    onSelect && onSelect(id ? byId[id] : null, source);
  }
  paint();
  return {
    select,
    hover(id) { state.hovered = id || null; paint(); },
    setStatus(map) { state.status = { ...map }; paint(); },
    setFilter(f) { Object.assign(state.filter, f); paint(); },
    fit() { if (vw) animateTo(fitView()); },
    zoom(f) { zoomAt(f, vw / 2, vh / 2); },
    resize,
    el: root,
    ready: img.decode ? img.decode().catch(() => {}) : Promise.resolve(),
  };
}
