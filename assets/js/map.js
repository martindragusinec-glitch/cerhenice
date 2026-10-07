// Mapa lokality: vlastní SVG ze skutečných souřadnic (assets/data/geo.js).
// Režimy: autem (města), vlakem (S1), v obci (škola, zastávka, zámek… pěšky).
// Po výběru cíle mapa plynule najede na celou trasu a trasa se vykreslí.
import { SITE_LL, DEST, RAIL, RIVER, TOWNS, POIS } from "../data/geo.js";
import { VILLAGE } from "../data/village.js";
import { SITE, PARCELS } from "../data/parcels.js";

// dekódování vrstev obce a půdorysu lokality do [lon, lat]
const dec = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push([15 + a[i] / 1e5, 50 + a[i + 1] / 1e5]); return o; };
const V = Object.fromEntries(Object.entries(VILLAGE).map(([k, v]) => [k, v.map(dec)]));
const M2LL = ([x, z]) => [SITE_LL[0] + x / (111320 * Math.cos((SITE_LL[1] * Math.PI) / 180)), SITE_LL[1] - z / 111320];
const SITE_POLY = SITE.outline.map(M2LL);
const PLOTS = PARCELS.map((p) => p.poly.map(M2LL));

const NS = "http://www.w3.org/2000/svg";
const KX = Math.cos((50.06 * Math.PI) / 180);
const STATION = [15.0798, 50.0776];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtKm = (n) => n.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${fmtKm(m / 1000)} km`);
const MARK = "M4.5 32V4.5H32M68 4.5h27.5V32M95.5 68v27.5H68M32 95.5H4.5V68";
const NOTES = {
  car: "Časy autem při volném provozu (OpenStreetMap).",
  train: "Vlak S1 podle jízdního řádu PID. Na zastávku 2 km, na kole cca 8 minut.",
  local: "Pěší trasy podle OpenStreetMap. Poloha lokality je orientační.",
};

// vlakové úseky po trati S1 (index zastávky Cerhenice v RAIL = 10)
const TRAIN = {
  kolin: { path: RAIL.slice(10), meta: "S1 ze zastávky Cerhenice" },
  pecky: { path: RAIL.slice(9, 11).reverse(), meta: "S1 ze zastávky Cerhenice" },
  praha: { path: RAIL.slice(0, 11).reverse(), meta: "S1 na Masarykovo nádraží" },
};
const P = (ll) => [ll[0] * KX, -ll[1]];

export function createMap(host, list, modeButtons, chips = [], note = null) {
  let mode = "car", active = "kolin";
  let W = 0, H = 0, view = null, anim = 0, drawn = false, seen = false;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  host.appendChild(svg);

  const pad = () => (W > 900 ? { l: 400, r: 80, t: 90, b: 80 } : { l: 30, r: 30, t: 40, b: 40 });
  function viewFor(points, minSpanKm) {
    const pts = points.map(P);
    let minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
    let minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
    const span = minSpanKm / 111;
    if (maxX - minX < span) { const c = (minX + maxX) / 2; minX = c - span / 2; maxX = c + span / 2; }
    if (maxY - minY < span * 0.6) { const c = (minY + maxY) / 2; minY = c - span * 0.3; maxY = c + span * 0.3; }
    const p = pad();
    const k = Math.min((W - p.l - p.r) / (maxX - minX), (H - p.t - p.b) / (maxY - minY));
    return { x: (minX + maxX) / 2 - (p.l - p.r) / 2 / k, y: (minY + maxY) / 2 - (p.t - p.b) / 2 / k, k };
  }
  const proj = (ll) => { const [x, y] = P(ll); return [W / 2 + (x - view.x) * view.k, H / 2 + (y - view.y) * view.k]; };
  const line = (pts) => pts.map((p, i) => { const [x, y] = proj(p); return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; }).join("");
  const smooth = (pts) => {
    const Q = pts.map(proj);
    let d = `M${Q[0][0].toFixed(1)} ${Q[0][1].toFixed(1)}`;
    for (let i = 1; i < Q.length - 1; i++) { const mx = (Q[i][0] + Q[i + 1][0]) / 2, my = (Q[i][1] + Q[i + 1][1]) / 2; d += `Q${Q[i][0].toFixed(1)} ${Q[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`; }
    return d;
  };
  const items = () => (mode === "local" ? POIS : DEST);
  const current = () => items().find((x) => x.id === active);

  function activePoints() {
    if (mode === "train") { const t = TRAIN[active]; return t ? [SITE_LL, STATION, ...t.path] : [SITE_LL]; }
    const d = current();
    return d ? [SITE_LL, ...d.route] : [SITE_LL];
  }
  function activePath() {
    if (mode === "train") { const t = TRAIN[active]; return t ? line([SITE_LL, STATION, ...t.path.slice(1)]) : ""; }
    const d = current();
    return d ? line(d.route) : "";
  }
  const minSpan = () => (mode === "local" ? (active === "d11" ? 6 : 2.6) : 14);

  function draw(hideActive = !drawn) {
    const km = view.k / 111;
    let g = "";
    const step = (km > 120 ? 0.5 : 5) * km;
    if (step > 18) {
      const [ox, oy] = proj([15, 50]);
      for (let x = ox % step; x < W; x += step) g += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="rgba(19,32,25,.05)"/>`;
      for (let y = oy % step; y < H; y += step) g += `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="rgba(19,32,25,.05)"/>`;
    }
    if (km < 120) {
      g += `<path d="${smooth(RIVER)}" fill="none" stroke="#c3d5cf" stroke-width="${Math.min(6, Math.max(3, km * 0.2)).toFixed(1)}" stroke-linecap="round"/>`;
      const rl = proj(RIVER[9]);
      g += `<text x="${rl[0] + 12}" y="${rl[1]}" font-family="Instrument Sans, sans-serif" font-style="italic" font-size="13" fill="#7f9a94">Labe</text>`;
    }
    const local = km > 30;
    if (local) {
      const multi = (arr, close) => arr.map((pts) => line(pts) + (close ? "Z" : "")).join("");
      g += `<path d="${multi(V.water, true)}" fill="#c9dad4" stroke="#b3c9c2" stroke-width="1"/>`;
      g += `<path d="${multi(V.track, false)}" fill="none" stroke="rgba(19,32,25,.22)" stroke-width="1" stroke-dasharray="3 3"/>`;
      g += `<path d="${multi(V.major, false)}" fill="none" stroke="#c9cfc0" stroke-width="${Math.min(9, km / 22).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      g += `<path d="${multi([...V.minor, ...V.major], false)}" fill="none" stroke="#fbfcf8" stroke-width="${Math.min(6, km / 34).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      g += `<path d="${multi(V.b, true)}" fill="#c5ccb9"/>`;
      g += `<path d="${multi(V.rail, false)}" fill="none" stroke="#5f6b64" stroke-width="2.4"/><path d="${multi(V.rail, false)}" fill="none" stroke="#e9ede2" stroke-width="1" stroke-dasharray="5 5"/>`;
      // půdorys lokality a parcely
      g += `<path d="${line(SITE_POLY)}Z" fill="rgba(228,203,60,.28)" stroke="#132019" stroke-width="1.5"/>`;
      if (km > 90) g += `<path d="${PLOTS.map((pp) => line(pp) + "Z").join("")}" fill="rgba(169,201,141,.55)" stroke="#fbfcf8" stroke-width="1"/>`;
    }
    for (const d of DEST) g += `<path d="${line(d.route)}" fill="none" stroke="rgba(19,32,25,.14)" stroke-width="1.5" stroke-linejoin="round"/>`;
    if (mode === "local") for (const d of POIS) g += `<path d="${line(d.route)}" fill="none" stroke="rgba(19,32,25,.12)" stroke-width="1.5" stroke-linejoin="round"/>`;
    if (!local) g += `<path d="${line(RAIL)}" fill="none" stroke="#132019" stroke-width="3.2" opacity=".2"/><path d="${line(RAIL)}" fill="none" stroke="#f2f4ee" stroke-width="1.4" stroke-dasharray="6 6"/>`;
    const walk = mode === "local" && current()?.mode === "foot";
    g += `<path id="m-active" d="${activePath()}" opacity="${hideActive ? 0 : 1}" fill="none" stroke="#132019" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"${walk ? ' data-walk="1"' : ""}/>`;
    const [px, py] = proj(SITE_LL);
    for (const [name, lon, lat, tier] of TOWNS) {
      const [x, y] = proj([lon, lat]);
      if (x < -60 || x > W + 60 || y < -20 || y > H + 20 || Math.hypot(x - px, y - py) < 40) continue;
      const r = tier === 3 ? 6 : tier === 2 ? 4.5 : 3.2;
      const on = mode !== "local" && DEST.some((d) => d.id === active && d.name.startsWith(name.split(" ")[0]));
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${tier === 3 || on ? "#132019" : "#fbfcf8"}" stroke="#132019" stroke-width="1.5"/>`;
      g += `<text x="${(x + r + 7).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-family="Geist Mono, monospace" font-size="${tier === 3 ? 13 : 11.5}" letter-spacing=".6" fill="${on ? "#132019" : "#5f6b64"}" font-weight="${on ? 600 : 400}">${name.toUpperCase()}</text>`;
    }
    if (km > 40) {
      for (const p of POIS) {
        const [x, y] = proj(p.ll);
        if (x < -40 || x > W + 40 || y < -20 || y > H + 20) continue;
        const on = mode === "local" && p.id === active;
        g += `<g data-poi="${p.id}" style="cursor:pointer"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 15 : 12}" fill="${on ? "#132019" : "#fbfcf8"}" stroke="#132019" stroke-width="1.5"/>`;
        g += `<svg x="${(x - 8).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="16" height="16" viewBox="0 0 256 256"><use href="#i-${p.icon}" fill="${on ? "#e4cb3c" : "#132019"}"/></svg>`;
        g += `<text x="${(x + 20).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-family="Geist Mono, monospace" font-size="11" letter-spacing=".4" fill="${on ? "#132019" : "#5f6b64"}" font-weight="${on ? 600 : 400}">${p.name.toUpperCase()}</text></g>`;
      }
    } else if (km > 14) {
      const [sx, sy] = proj(STATION);
      g += `<rect x="${sx - 4}" y="${sy - 4}" width="8" height="8" fill="#fbfcf8" stroke="#132019" stroke-width="1.5" transform="rotate(45 ${sx} ${sy})"/><text x="${sx + 9}" y="${sy - 7}" font-family="Geist Mono, monospace" font-size="10.5" fill="#5f6b64">ZASTÁVKA S1</text>`;
    }
    const s = 34;
    const left = px > 170;
    g += `<g transform="translate(${(px - s / 2).toFixed(1)} ${(py - s / 2).toFixed(1)})">
      <circle cx="${s / 2}" cy="${s / 2}" r="${s}" fill="#e4cb3c" opacity=".25">${reduce ? "" : `<animate attributeName="r" values="${s * 0.6};${s * 1.2};${s * 0.6}" dur="3.2s" repeatCount="indefinite"/>`}</circle>
      <rect width="${s}" height="${s}" rx="7" fill="#132019"/>
      <g transform="translate(6 6) scale(${(s - 12) / 100})"><path d="${MARK}" fill="none" stroke="#f2f4ee" stroke-width="10"/><rect x="26" y="26" width="48" height="48" fill="#e4cb3c"/></g></g>
      <g text-anchor="${left ? "end" : "start"}" transform="translate(${(left ? px - s / 2 - 12 : px + s / 2 + 12).toFixed(1)} ${(py - 2).toFixed(1)})"><text font-family="Instrument Sans, sans-serif" font-size="16" font-weight="600" fill="#132019">Za Kapličkou</text><text y="17" font-family="Geist Mono, monospace" font-size="10.5" fill="#5f6b64">VAŠE NOVÁ ADRESA</text></g>`;
    const d = current();
    const val = !d ? null : mode === "train" ? d.train_min : mode === "local" ? d.min : d.car_min;
    if (d && val) {
      const [x, y] = proj(d.ll);
      const short = d.name.split(",")[0].replace("Nájezd na D11 u Vrbové Lhoty", "D11");
      const txt = mode === "local" ? `${short} · ${val} min ${d.mode === "foot" ? "pěšky" : "autem"}` : `${d.name} · ${val} min`;
      const w = txt.length * 8 + 28;
      let bx = x > px ? x + 22 : x - 22 - w, by = y - 22;
      bx = Math.min(Math.max(bx, W > 900 ? 380 : 8), W - w - 8); by = Math.min(Math.max(by, 8), H - 52);
      if (Math.abs(by + 22 - y) < 26 && Math.abs(bx + w / 2 - x) < w / 2 + 20) by = y + 22;
      g += `<g id="m-bubble" opacity="${drawn ? 1 : 0}"><rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="44" rx="10" fill="#132019"/><text x="${(bx + 14).toFixed(1)}" y="${(by + 28).toFixed(1)}" fill="#f2f4ee" font-family="Instrument Sans, sans-serif" font-size="15" font-weight="500">${txt}</text></g>`;
    }
    const unit = km > 90 ? 0.5 : km > 30 ? 2 : 10;
    const sk = km * unit, lab = unit < 1 ? "500 m" : `${unit} km`;
    const bx = W - 30 - sk, by = H - 28;
    g += `<g font-family="Geist Mono, monospace" font-size="11" fill="#5f6b64"><path d="M${bx} ${by}h${sk}M${bx} ${by - 5}v10M${bx + sk} ${by - 5}v10" stroke="#132019"/><text x="${bx + sk / 2}" y="${by - 10}" text-anchor="middle">${lab}</text></g>`;
    svg.innerHTML = g;
  }

  function animateRoute() {
    const p = svg.querySelector("#m-active");
    if (!p) return;
    if (reduce) { drawn = true; p.setAttribute("opacity", "1"); svg.querySelector("#m-bubble")?.setAttribute("opacity", "1"); return; }
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    p.getBoundingClientRect();
    p.setAttribute("opacity", "1");
    p.style.transition = "stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)";
    p.style.strokeDashoffset = "0";
    setTimeout(() => {
      drawn = true;
      if (p.dataset.walk) { p.style.transition = "none"; p.style.strokeDasharray = "1 7"; p.style.strokeDashoffset = "0"; }
      const b = svg.querySelector("#m-bubble"); if (b) { b.style.transition = "opacity .4s"; b.setAttribute("opacity", "1"); }
    }, 1250);
  }

  function goTo(target, animate = true) {
    cancelAnimationFrame(anim);
    drawn = false;
    if (!animate || reduce || !view) { view = target; draw(); animateRoute(); return; }
    const from = { ...view }, t0 = performance.now(), dur = 1000;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = ease(k);
      view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e) };
      draw();
      if (k < 1) anim = requestAnimationFrame(tick); else animateRoute();
    };
    anim = requestAnimationFrame(tick);
  }

  function renderList() {
    list.innerHTML = items().map((d) => {
      const na = mode === "train" && !d.train_min;
      const val = mode === "train" ? d.train_min : mode === "local" ? d.min : d.car_min;
      const meta = mode === "train" ? TRAIN[d.id]?.meta || "" : mode === "local" ? `${fmtDist(d.m)} ${d.mode === "foot" ? "pěšky" : "autem"}` : `${fmtKm(d.car_km)} km autem`;
      return `<li class="${na ? "is-na" : ""}"><button type="button" data-dest="${d.id}" aria-pressed="${d.id === active}">
        <span><span class="d-name">${d.name}</span><span class="d-meta">${meta}</span></span>
        <span class="d-time">${val ?? ""}<small>min</small></span></button></li>`;
    }).join("");
    modeButtons.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === mode)));
    chips.forEach((c) => c.setAttribute("aria-pressed", String(mode === "local" && c.dataset.poi === active)));
    if (note) note.textContent = NOTES[mode];
  }

  function select(newMode, id) {
    mode = newMode;
    active = id;
    renderList();
    goTo(viewFor(activePoints(), minSpan()));
    (window.dataLayer = window.dataLayer || []).push({ event: "map_destination", destination: active, mode });
  }

  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dest]");
    if (b) select(mode, b.dataset.dest);
  });
  svg.addEventListener("click", (e) => {
    const g = e.target.closest("[data-poi]");
    if (g) select("local", g.dataset.poi);
  });
  modeButtons.forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.mode;
    const id = m === "local" ? (POIS.some((p) => p.id === active) ? active : "skola") : m === "train" ? (TRAIN[active] ? active : "kolin") : DEST.some((d) => d.id === active) ? active : "kolin";
    select(m, id);
  }));
  chips.forEach((c) => c.addEventListener("click", () => {
    select("local", c.dataset.poi);
    const r = host.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) host.closest(".mapcard").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }));

  function resize() {
    W = host.clientWidth; H = host.clientHeight;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    view = viewFor(activePoints(), minSpan());
    drawn = false;
    draw();
    if (seen) animateRoute();
  }
  renderList();
  resize();
  let t = 0;
  new ResizeObserver(() => { clearTimeout(t); t = setTimeout(resize, 120); }).observe(host);
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { seen = true; animateRoute(); o.disconnect(); } }, { threshold: 0.35 }).observe(host);
  return { select };
}
