// Stránka jednoho pozemku: plánek se stínem ukázkového domu podle slunce, poloha v lokalitě, podobné pozemky.
import { PARCELS, SITE } from "../data/parcels.js";
import { POIS, DEST } from "../data/geo.js";
import { PRICE_PER_M2, PRICE_OVERRIDE, STATUS } from "./config.js";
import { SEASONS, sunAt, daylight, fmtTime, toSun } from "./sun.js";
import { isFav, toggleFav, favs, FAV_MAX } from "./favs.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => new Intl.NumberFormat("cs-CZ").format(n);
const num = (id) => String(Number(id));
const track = (event, data = {}) => { (window.dataLayer = window.dataLayer || []).push({ event, ...data }); };
const statusOf = (id) => STATUS[id] || "volny";
const STATUS_TXT = { volny: "Volný", rezervace: "Rezervace", prodano: "Prodáno" };
const priceOf = (p) => PRICE_OVERRIDE[p.id] ?? (PRICE_PER_M2 ? Math.round((p.area * PRICE_PER_M2) / 1000) * 1000 : null);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const deg = (r) => Math.round((r * 180) / Math.PI);
const DIRS = ["severu", "severovýchodu", "východu", "jihovýchodu", "jihu", "jihozápadu", "západu", "severozápadu"];
const dirFrom = (az) => DIRS[Math.round(((az * 180) / Math.PI) / 45) % 8];

const P = PARCELS.find((p) => p.id === document.body.dataset.plot);

/* ---------- geometrie ---------- */
const A = (SITE.angle * Math.PI) / 180;
const V = [-Math.sin(A), Math.cos(A)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = (a) => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };

function frameOf(p) {
  const c = p.c, pts = p.poly;
  let L = null, best = 0;
  for (let i = 0; i < pts.length; i++) {
    const e = sub(pts[(i + 1) % pts.length], pts[i]);
    const l = Math.hypot(e[0], e[1]);
    if (l > best) { best = l; L = norm(e); }
  }
  const back = p.front === "N" ? V : p.front === "S" ? mul(V, -1) : [-1, 0];
  if (dot(L, back) < 0) L = mul(L, -1);
  const W = [-L[1], L[0]];
  let tmin = Infinity, tmax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (const q of pts) { const d = sub(q, c); tmin = Math.min(tmin, dot(d, L)); tmax = Math.max(tmax, dot(d, L)); wmin = Math.min(wmin, dot(d, W)); wmax = Math.max(wmax, dot(d, W)); }
  return { c, L, W, tmin, tmax, wmin, wmax };
}
function hull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const path = (pts) => pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join("") + "Z";

const F = frameOf(P);
// ukázkový dům: 9,2 m hloubka, šířka podle pozemku, odstup 6,5 m od ulice, hřeben souběžně s ulicí
const HD = 9.2, HL = Math.min(13, F.wmax - F.wmin - 8), EAVE = 3.65, RIDGE = 3.65 + HD / 2 + 0.45;
const hcen = add(add(F.c, mul(F.L, F.tmin + 6.5 + HD / 2)), mul(F.W, (F.wmin + F.wmax) / 2));
const corner = (sl, sw) => add(add(hcen, mul(F.L, (sl * HD) / 2)), mul(F.W, (sw * HL) / 2));
const HOUSE = [corner(-1, -1), corner(-1, 1), corner(1, 1), corner(1, -1)];
const RIDGE_LINE = [add(hcen, mul(F.W, -HL / 2)), add(hcen, mul(F.W, HL / 2))];

function shadowPoly(az, el) {
  if (el <= 0.01) return null;
  const dir = mul(toSun(az), -1);
  const k = 1 / Math.tan(el);
  const pts = [...HOUSE, ...HOUSE.map((q) => add(q, mul(dir, EAVE * k))), ...RIDGE_LINE.map((q) => add(q, mul(dir, RIDGE * k)))];
  return hull(pts);
}

/* ---------- plánek ---------- */
const xs = P.poly.map((q) => q[0]), zs = P.poly.map((q) => q[1]);
const M = 20;
const VB = { x: Math.min(...xs) - M, y: Math.min(...zs) - M, w: Math.max(...xs) - Math.min(...xs) + 2 * M, h: Math.max(...zs) - Math.min(...zs) + 2 * M };
const C = [VB.x + VB.w / 2, VB.y + VB.h / 2];
const R = Math.min(VB.w, VB.h) / 2 - 3;

function cornersOf(poly) {
  // 4 krajní body pozemku ve směrech ±L ±W
  const out = [];
  for (const [sl, sw] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
    let best = null, bv = -Infinity;
    for (const q of poly) { const d = sub(q, F.c); const v = sl * dot(d, F.L) + sw * dot(d, F.W); if (v > bv) { bv = v; best = q; } }
    out.push(best);
  }
  return out;
}

function planSvg(season, hours) {
  const s = sunAt(season, hours);
  const shadow = shadowPoly(s.az, s.el);
  const neigh = PARCELS.filter((p) => p.id !== P.id && Math.hypot(p.c[0] - P.c[0], p.c[1] - P.c[1]) < 75);
  const fs = VB.w / 34;
  let g = `<rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="#e7ebdf"/>`;
  g += `<path d="${path(SITE.outline)}" fill="#f8f8f3"/>`;
  for (const p of neigh) {
    g += `<a href="${num(p.id)}"><path d="${path(p.poly)}" fill="#d5ddc8" stroke="#f8f8f3" stroke-width="0.6"/><text x="${p.c[0]}" y="${p.c[1] + fs * 0.35}" text-anchor="middle" font-size="${fs}" font-family="Geist Mono, monospace" fill="#5f6b64">${num(p.id)}</text></a>`;
  }
  g += `<path d="${path(P.poly)}" fill="#b3d095" stroke="#132019" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  if (shadow) g += `<path d="${path(shadow)}" fill="rgba(19,32,25,.3)" class="shadow"/>`;
  g += `<path d="${path(HOUSE)}" fill="#fbfcf8" stroke="#132019" stroke-width="1.4" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`;
  g += `<path d="M${RIDGE_LINE[0][0]} ${RIDGE_LINE[0][1]}L${RIDGE_LINE[1][0]} ${RIDGE_LINE[1][1]}" stroke="#132019" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
  // rohové značky (brand)
  const cs = cornersOf(P.poly);
  for (let i = 0; i < 4; i++) {
    const q = cs[i], a = norm(sub(cs[(i + 1) % 4], q)), b = norm(sub(cs[(i + 3) % 4], q));
    const o = add(q, mul(norm(add(a, b)), -1.4));
    g += `<path d="M${add(o, mul(a, 3.6)).join(" ")}L${o.join(" ")}L${add(o, mul(b, 3.6)).join(" ")}" fill="none" stroke="#132019" stroke-width="2.6" vector-effect="non-scaling-stroke"/>`;
  }
  // kóty
  const front = add(F.c, mul(F.L, F.tmin));
  const lab = (pt, txt, rot = 0) => `<text x="${pt[0].toFixed(2)}" y="${pt[1].toFixed(2)}" transform="rotate(${rot} ${pt[0].toFixed(2)} ${pt[1].toFixed(2)})" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-family="Geist Mono, monospace" fill="#132019">${txt}</text>`;
  const angW = (Math.atan2(F.W[1], F.W[0]) * 180) / Math.PI;
  const angL = (Math.atan2(F.L[1], F.L[0]) * 180) / Math.PI;
  const up = (a) => (a > 90 || a < -90 ? a + 180 : a);
  g += lab(add(front, mul(F.L, -3)), `${P.w} m`, up(angW));
  g += lab(add(add(F.c, mul(F.W, F.wmax + 3.2)), mul(F.L, (F.tmin + F.tmax) / 2)), `${P.d} m`, up(angL));
  g += lab(add(front, mul(F.L, -8.5)), "ULICE", up(angW));
  g += lab(hcen, "dům", up(angW));
  g += lab(add(F.c, mul(F.L, (F.tmax + F.tmin) / 2 + (F.tmax - F.tmin) * 0.22)), "zahrada", up(angW));
  // dráha slunce (azimut po kružnici, střed = zenit)
  const d = daylight(season);
  const arc = [];
  for (let t = d.rise; t <= d.set; t += 0.25) { const p = sunAt(season, t); const r = R * (1 - Math.max(0, p.el) / (Math.PI / 2)); const v = toSun(p.az); arc.push([C[0] + v[0] * r, C[1] + v[1] * r]); }
  g += `<path d="${arc.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join("")}" fill="none" stroke="#c9a300" stroke-width="1.4" stroke-dasharray="2 5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  if (s.el > 0) {
    const r = R * (1 - s.el / (Math.PI / 2)), v = toSun(s.az), sp = [C[0] + v[0] * r, C[1] + v[1] * r];
    g += `<circle cx="${sp[0]}" cy="${sp[1]}" r="${fs * 1.2}" fill="#e4cb3c" stroke="#132019" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`;
  }
  // sever
  const nx = VB.x + VB.w - 5, ny = VB.y + 6;
  g += `<g transform="translate(${nx} ${ny})"><path d="M0 -3.4L1.8 1.8L0 0.9L-1.8 1.8Z" fill="#132019"/><text y="${-4.6}" text-anchor="middle" font-size="${fs * 0.9}" font-family="Geist Mono, monospace" fill="#132019">S</text></g>`;
  return { svg: `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet">${g}</svg>`, s, d };
}

/* ---------- slunce ---------- */
let season = "leto", playing = 0;
const range = $("#sun-time"), out = $("#sun-out"), playBtn = $("#sun-play");
function renderPlan() {
  const t = Number(range.value);
  out.textContent = fmtTime(t);
  const { svg, s, d } = planSvg(season, t);
  $("#plan").innerHTML = svg;
  const where = s.el > 0 ? `v ${fmtTime(t)} svítí z ${dirFrom(s.az)} ve výšce ${deg(s.el)}°` : `v ${fmtTime(t)} je slunce pod obzorem`;
  $("#sun-facts").innerHTML = `<b>${SEASONS[season].note}</b> · východ ${fmtTime(d.rise)} · západ ${fmtTime(d.set)} · slunce ${where}. Stín patří ukázkovému domu s hřebenem ve výšce cca ${Math.round(RIDGE)} m.`;
}
function setRange() {
  const d = daylight(season);
  range.min = (Math.ceil(d.rise * 4) / 4).toFixed(2);
  range.max = (Math.floor(d.set * 4) / 4).toFixed(2);
  if (+range.value < +range.min || +range.value > +range.max) range.value = 15;
}
const stop = () => { cancelAnimationFrame(playing); playing = 0; playBtn.innerHTML = '<svg class="icon"><use href="#i-play"/></svg>'; };
$$("[data-season]").forEach((b) => b.addEventListener("click", () => {
  season = b.dataset.season;
  $$("[data-season]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  setRange(); renderPlan();
  track("plot_sun", { plot_id: P.id, season });
}));
range.addEventListener("input", () => { stop(); renderPlan(); });
playBtn.addEventListener("click", () => {
  if (playing) return stop();
  playBtn.innerHTML = '<svg class="icon"><use href="#i-pause"/></svg>';
  if (+range.value >= +range.max - 0.1) range.value = range.min;
  let last = performance.now();
  const tick = (now) => {
    const v = +range.value + ((now - last) / 1000) * 1.5;
    last = now;
    range.value = v >= +range.max ? range.min : v;
    renderPlan();
    playing = requestAnimationFrame(tick);
  };
  playing = requestAnimationFrame(tick);
});
setRange();
renderPlan();
// úvodní ukázka: den proběhne jednou od rána do odpoledne
if (!reduce) {
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    const from = +range.min + 2, to = 15, t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 2200); range.value = from + (to - from) * (1 - Math.pow(1 - k, 3)); renderPlan(); if (k < 1 && !playing) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, { threshold: 0.5 }).observe($("#plan"));
}

/* ---------- stav, cena, oblíbené, sdílení ---------- */
const st = statusOf(P.id);
const pill = $("#p-status");
pill.textContent = STATUS_TXT[st];
pill.className = "status-pill" + (st === "rezervace" ? " res" : st === "prodano" ? " sold" : "");
const price = priceOf(P);
if (price) { $("#p-price").classList.remove("price-text"); $("#p-price").innerHTML = `${fmt(price)} <small>Kč</small>`; $("#p-cta").firstChild.textContent = `Mám zájem o pozemek ${num(P.id)} `; }
if (st === "prodano") $("#p-cta").firstChild.textContent = "Chci podobný pozemek ";

const toast = $("#toast");
const showToast = (m) => { toast.textContent = m; toast.classList.add("is-on"); clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove("is-on"), 2200); };
const favBtn = $("#p-fav");
const syncFav = () => {
  const on = isFav(P.id);
  favBtn.setAttribute("aria-pressed", String(on));
  favBtn.setAttribute("aria-label", on ? "Odebrat z oblíbených" : "Uložit do oblíbených");
  favBtn.innerHTML = `<svg class="icon"><use href="#i-${on ? "heart-fill" : "heart"}"/></svg>`;
};
favBtn.addEventListener("click", () => { const added = toggleFav(P.id); syncFav(); showToast(added ? `Uloženo do oblíbených (${favs().length}/${FAV_MAX}). Porovnání najdete ve 3D plánu.` : "Odebráno z oblíbených"); });
syncFav();
$("#p-share").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href.split("#")[0]); showToast("Odkaz na pozemek zkopírován"); } catch { showToast(location.href); }
  track("plot_share", { plot_id: P.id, page: "detail" });
});
track("plot_page", { plot_id: P.id, plot_area: P.area });

/* ---------- mini plán lokality ---------- */
{
  const ox = SITE.outline.map((q) => q[0]), oz = SITE.outline.map((q) => q[1]);
  const m = 8, vb = [Math.min(...ox) - m, Math.min(...oz) - m, Math.max(...ox) - Math.min(...ox) + 2 * m, Math.max(...oz) - Math.min(...oz) + 2 * m];
  let g = `<path d="${path(SITE.outline)}" fill="#f8f8f3" stroke="rgba(19,32,25,.2)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  for (const p of PARCELS) {
    const me = p.id === P.id, sold = statusOf(p.id) === "prodano", res = statusOf(p.id) === "rezervace";
    g += `<a href="${num(p.id)}" aria-label="Pozemek ${num(p.id)}"><path class="mini-plot${me ? " is-me" : ""}" d="${path(p.poly)}" fill="${me ? "#e4cb3c" : sold ? "#c2c6bd" : res ? "#dfcd9c" : "#b3d095"}" stroke="${me ? "#132019" : "#f8f8f3"}" stroke-width="${me ? 2 : 1}" vector-effect="non-scaling-stroke"/><text x="${p.c[0]}" y="${p.c[1] + 2}" text-anchor="middle" font-size="6.5" font-family="Geist Mono, monospace" fill="${me ? "#132019" : "#3a473f"}" font-weight="${me ? 700 : 400}" pointer-events="none">${num(p.id)}</text></a>`;
  }
  g += `<g transform="translate(${vb[0] + vb[2] - 14} ${vb[1] + 16})"><path d="M0 -9L5 5L0 2.5L-5 5Z" fill="#132019"/><text y="-12" text-anchor="middle" font-size="8" font-family="Geist Mono, monospace">S</text></g>`;
  $("#mini").innerHTML = `<svg viewBox="${vb.join(" ")}">${g}</svg>`;
}

/* ---------- vzdálenosti ---------- */
{
  const pick = [
    ...["skola", "vlak", "zamek"].map((k) => POIS.find((p) => p.id === k)).filter(Boolean).map((p) => ({ name: p.name, val: p.min, unit: "min pěšky", meta: p.m < 1000 ? `${Math.round(p.m / 10) * 10} m` : `${(p.m / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} km` })),
    ...["kolin", "praha"].map((k) => DEST.find((d) => d.id === k)).filter(Boolean).map((d) => ({ name: d.name, val: d.car_min, unit: "min autem", meta: `${d.car_km.toLocaleString("cs-CZ")} km` })),
  ];
  $("#dist").innerHTML = pick.map((x) => `<div class="dist-item"><span class="num">${x.val}</span><span><b>${x.name}</b><small>${x.unit} · ${x.meta}</small></span></div>`).join("") + `<a class="btn btn-ghost btn-sm" href="../#lokalita">Mapa okolí <svg class="icon icon-arrow"><use href="#i-arrow-right"/></svg></a>`;
}

/* ---------- podobné pozemky ---------- */
{
  const free = PARCELS.filter((p) => p.id !== P.id && statusOf(p.id) !== "prodano").sort((a, b) => Math.abs(a.area - P.area) - Math.abs(b.area - P.area) || Math.hypot(a.c[0] - P.c[0], a.c[1] - P.c[1]) - Math.hypot(b.c[0] - P.c[0], b.c[1] - P.c[1])).slice(0, 3);
  $("#similar").innerHTML = free.map((p) => {
    const xs = p.poly.map((q) => q[0]), zs = p.poly.map((q) => q[1]);
    const vb = [Math.min(...xs) - 3, Math.min(...zs) - 3, Math.max(...xs) - Math.min(...xs) + 6, Math.max(...zs) - Math.min(...zs) + 6];
    return `<a class="sim-card" href="${num(p.id)}">
      <svg viewBox="${vb.join(" ")}" aria-hidden="true"><path d="${path(p.poly)}" fill="#b3d095" stroke="#132019" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
      <span class="sim-num">${num(p.id)}</span>
      <span class="sim-meta"><b>${fmt(p.area)} m²</b><small>${p.w} × ${p.d} m · etapa ${p.etapa}</small></span>
      <span class="sim-go">Detail <svg class="icon"><use href="#i-arrow-right"/></svg></span></a>`;
  }).join("");
}

/* ---------- formulář ---------- */
{
  const form = $("#lead-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let first = null;
    for (const f of $$(".field", form)) {
      const inp = $("input", f);
      if (!inp) continue;
      const v = inp.value.trim();
      const bad = (inp.required && !v) || (inp.type === "email" && v && !/^\S+@\S+\.\S+$/.test(v)) || (inp.type === "tel" && v && v.replace(/\D/g, "").length < 9);
      f.classList.toggle("is-invalid", bad);
      if (bad && !first) first = inp;
    }
    const c = $("#f-consent");
    c.closest(".consent").classList.toggle("is-invalid", !c.checked);
    if (!c.checked && !first) first = c;
    if (first) return first.focus();
    // DOPLNIT: odeslání na backend (stejně jako na hlavní stránce)
    track("lead_submit", { plot_id: P.id, page: "detail" });
    form.classList.add("is-sent");
  });
}
