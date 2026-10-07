import { PARCELS, SITE } from "../data/parcels.js";
import { PRICE_PER_M2, PRICE_OVERRIDE, STATUS } from "./config.js";
import { favs, isFav, toggleFav, onFavs, FAV_MAX } from "./favs.js";
import { SEASONS, daylight, fmtTime } from "./sun.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => new Intl.NumberFormat("cs-CZ").format(n);
const track = (event, data = {}) => { (window.dataLayer = window.dataLayer || []).push({ event, ...data }); };
const statusOf = (id) => STATUS[id] || "volny";
const STATUS_TXT = { volny: "Volný", rezervace: "Rezervace", prodano: "Prodáno" };
const priceOf = (p) => PRICE_OVERRIDE[p.id] ?? (PRICE_PER_M2 ? Math.round((p.area * PRICE_PER_M2) / 1000) * 1000 : null);
const num = (id) => String(Number(id));
const plural = (n) => (n === 1 ? "pozemek" : n >= 2 && n <= 4 ? "pozemky" : "pozemků");
const baseUrl = () => location.pathname + location.search;
const isMobile = () => matchMedia("(max-width: 900px)").matches;

/* ---------- hlavička, menu, odhalování ---------- */
const header = $("#top-header");
const mbar = $("#mbar");
let pastHero = false, stageVisible = false;
const syncBar = () => mbar.classList.toggle("is-on", pastHero && !stageVisible);
new IntersectionObserver(([e]) => {
  pastHero = !e.isIntersecting;
  header.classList.toggle("is-solid", pastHero);
  syncBar();
}, { rootMargin: "-72px 0px 0px 0px" }).observe($(".hero"));

const menu = $("#mobile-menu");
const menuBtn = $(".site-header .menu-btn");
function setMenu(open) {
  menu.classList.toggle("is-open", open);
  menu.setAttribute("aria-hidden", String(!open));
  menu.inert = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) $(".menu-btn", menu).focus(); else if (document.activeElement && menu.contains(document.activeElement)) menuBtn.focus();
}
menuBtn.addEventListener("click", () => setMenu(true));
$(".menu-btn", menu).addEventListener("click", () => setMenu(false));
$$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -8% 0px" });
$$(".reveal").forEach((el) => io.observe(el));

/* ---------- modal (přelet dronem) ---------- */
let lastFocus = null;
function openModal(id) {
  const m = $(`#modal-${id}`);
  lastFocus = document.activeElement;
  m.inert = false;
  m.classList.add("is-open"); m.setAttribute("aria-hidden", "false");
  $(".modal-close", m).focus();
  track("flyover_open");
}
function closeModal() {
  const m = $(".modal.is-open");
  if (!m) return false;
  m.classList.remove("is-open"); m.setAttribute("aria-hidden", "true"); m.inert = true;
  m.querySelector("video")?.pause();
  lastFocus && lastFocus.focus();
  return true;
}
$$("[data-open-modal]").forEach((b) => b.addEventListener("click", () => openModal(b.dataset.openModal)));
$$("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModal));
$$(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) closeModal(); }));

/* ---------- galerie ---------- */
const gal = $("#gallery");
$$("[data-gal]").forEach((b) => b.addEventListener("click", () => {
  const step = gal.querySelector("figure").getBoundingClientRect().width + 16;
  gal.scrollBy({ left: step * Number(b.dataset.gal), behavior: "smooth" });
}));

/* ---------- formulář ---------- */
const form = $("#lead-form");
const plotSelect = $("#f-plot");
for (const p of PARCELS) {
  if (statusOf(p.id) === "prodano") continue;
  const o = document.createElement("option");
  o.value = p.id;
  o.textContent = `Pozemek ${num(p.id)} · ${fmt(p.area)} m² · etapa ${p.etapa}`;
  plotSelect.append(o);
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  let first = null;
  for (const f of $$(".field", form)) {
    const inp = $("input", f);
    if (!inp) continue;
    const v = inp.value.trim();
    const bad = (inp.required && !v) || (inp.type === "email" && v && !/^\S+@\S+\.\S+$/.test(v)) || (inp.type === "tel" && v && v.replace(/\D/g, "").length < 9);
    f.classList.toggle("is-invalid", bad);
    inp.setAttribute("aria-invalid", String(bad));
    if (bad && !first) first = inp;
  }
  const consent = $("#f-consent");
  consent.closest(".consent").classList.toggle("is-invalid", !consent.checked);
  if (!consent.checked && !first) first = consent;
  if (first) { first.focus(); return; }
  // DOPLNIT: odeslání na backend (webhook / CRM). Zatím jen potvrzení na stránce.
  track("lead_submit", { plot_id: plotSelect.value || null, visit: $("#f-when").value });
  form.classList.add("is-sent");
});
$$("input", form).forEach((i) => i.addEventListener("input", () => { i.closest(".field")?.classList.remove("is-invalid"); i.removeAttribute("aria-invalid"); }));

/* ---------- 3D výběr ---------- */
const stage = $("#stage");
const host = $("#stage-canvas");
const tooltip = $("#tooltip");
const drawer = $("#drawer");
const toast = $("#toast");
let mp = null, current = null, drawerTrigger = null;
const filter = { etapa: "all", minArea: 0, onlyFree: false };
const matches = (p) => (filter.etapa === "all" || String(p.etapa) === filter.etapa) && p.area >= filter.minArea && (!filter.onlyFree || statusOf(p.id) === "volny");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("is-on");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("is-on"), 2200);
}

function shapeSvg(p) {
  // pozemek natočený tak, aby ulice byla dole
  const a = (SITE.angle * Math.PI) / 180;
  const rot = p.front === "E" ? Math.PI / 2 : p.front === "N" ? Math.PI : 0;
  const ang = -a + rot;
  const pts = p.poly.map(([x, z]) => {
    const dx = x - p.c[0], dz = z - p.c[1];
    return [dx * Math.cos(ang) - dz * Math.sin(ang), dx * Math.sin(ang) + dz * Math.cos(ang)];
  });
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 320, H = 150, pad = 16;
  const s = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad - 16) / (maxY - minY));
  const ox = (W - (maxX - minX) * s) / 2, oy = pad + (H - 2 * pad - 16 - (maxY - minY) * s) / 2;
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${(ox + (x - minX) * s).toFixed(1)} ${(oy + (y - minY) * s).toFixed(1)}`).join("") + "Z";
  const bottom = oy + (maxY - minY) * s;
  const cw = (maxX - minX) * s, bw = Math.min(cw * 0.56, 12 * s), bh = 9 * s;
  const bx = ox + cw / 2 - bw / 2, by = bottom - 6.5 * s - bh;
  const c = 9, L = (x, y, dx, dy) => `M${x} ${y + dy * c}V${y}H${x + dx * c}`;
  const x0 = ox - 6, x1 = ox + cw + 6, y0 = oy - 6, y1 = bottom + 6;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tvar pozemku ${num(p.id)}">
    <path d="${d}" fill="#a9c98d" stroke="#132019" stroke-width="1.5"/>
    <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="#fbfcf8" stroke="#132019" stroke-dasharray="3 3"/>
    <path d="${L(x0, y0, 1, 1)}${L(x1, y0, -1, 1)}${L(x0, y1, 1, -1)}${L(x1, y1, -1, -1)}" fill="none" stroke="#132019" stroke-width="2"/>
    <text x="${W / 2}" y="${H - 2}" text-anchor="middle" font-size="10.5" fill="#5f6b64" font-family="Geist Mono, monospace" letter-spacing="1.5">ULICE · ${p.w} M</text>
  </svg>`;
}

function setDrawer(open) {
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  drawer.inert = !open;
  stage.classList.toggle("has-drawer", open);
}

function openDrawer(p, { source = "3d" } = {}) {
  current = p;
  if (!p) {
    const hadFocus = drawer.contains(document.activeElement);
    setDrawer(false);
    history.replaceState(null, "", baseUrl());
    if (hadFocus && drawerTrigger) drawerTrigger.focus({ preventScroll: true });
    return;
  }
  const st = statusOf(p.id);
  $("#drawer-etapa").textContent = `Etapa ${p.etapa}`;
  $("#d-num").textContent = num(p.id);
  const pill = $("#drawer-status");
  pill.textContent = STATUS_TXT[st];
  pill.className = "status-pill" + (st === "rezervace" ? " res" : st === "prodano" ? " sold" : "");
  const badge = $("#d-badge");
  const garden = { N: "Zahrada na jih", E: "Zahrada na západ" }[p.front];
  badge.hidden = !garden; if (garden) badge.textContent = garden;
  $("#d-area").innerHTML = `${fmt(p.area)} <small>m²</small>`;
  $("#d-dims").innerHTML = `${p.w} × ${p.d} <small>m</small>`;
  $("#d-built").innerHTML = `${fmt(Math.floor(p.area * 0.2))} <small>m²</small>`;
  const price = priceOf(p);
  const pd = $("#d-price");
  pd.classList.toggle("price-text", !price);
  pd.innerHTML = price ? `${fmt(price)} <small>Kč</small>` : "Ceník pošleme obratem";
  $("#drawer-shape").innerHTML = shapeSvg(p);
  const side = { N: "ze severu", S: "z jihu", E: "z východu" }[p.front];
  $("#d-note").textContent = `Vjezd z nové ulice ${side}. Vodovod, kanalizace a elektřina budou dovedeny k hranici pozemku. Čárkovaně je naznačen možný dům.`;
  const cta = $("#d-cta");
  cta.innerHTML = (st === "prodano" ? "Chci podobný pozemek" : price ? `Mám zájem o pozemek ${num(p.id)}` : `Zjistit cenu pozemku ${num(p.id)}`) + ' <svg class="icon icon-arrow"><use href="#i-arrow-right"/></svg>';
  $("#d-detail").href = `pozemky/${num(p.id)}`;
  syncFavBtn();
  const wasOpen = drawer.classList.contains("is-open");
  setDrawer(true);
  if (!wasOpen) drawerTrigger = document.activeElement !== document.body ? document.activeElement : null;
  if (source === "list" || source === "find") $("#drawer-title").focus({ preventScroll: true });
  if (source !== "step") track("plot_select", { plot_id: p.id, plot_area: p.area, source });
  history.replaceState(null, "", `${baseUrl()}#pozemek-${num(p.id)}`);
}

function selectPlot(id, source) {
  const p = PARCELS.find((x) => x.id === id);
  if (!p) return;
  if (mp) mp.select(id, { source });
  else openDrawer(p, { source });
}

function step(dir) {
  const list = PARCELS.filter(matches);
  if (!list.length) return;
  let i = list.findIndex((p) => p.id === current?.id);
  if (i < 0) i = dir > 0 ? -1 : 0;
  selectPlot(list[(i + dir + list.length) % list.length].id, "step");
}
$("#d-prev").addEventListener("click", () => step(-1));
$("#d-next").addEventListener("click", () => step(1));
$("#drawer-close").addEventListener("click", () => (mp ? mp.select(null) : openDrawer(null)));
$("#d-cta").addEventListener("click", () => {
  if (current && statusOf(current.id) !== "prodano") plotSelect.value = current.id;
  if (current && !priceOf(current)) $("#f-when").value = "Zatím jen ceník";
  track("plot_cta", { plot_id: current?.id });
});
$("#d-share").addEventListener("click", async () => {
  if (!current) return;
  const url = `${location.origin}${baseUrl()}#pozemek-${num(current.id)}`;
  try { await navigator.clipboard.writeText(url); showToast("Odkaz na pozemek zkopírován"); }
  catch { showToast(url); }
  track("plot_share", { plot_id: current.id });
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (closeModal()) return;
    if (menu.classList.contains("is-open")) return setMenu(false);
    if (drawer.classList.contains("is-open")) (mp ? mp.select(null) : openDrawer(null));
    return;
  }
  if (drawer.classList.contains("is-open") && stage.contains(document.activeElement) && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  }
});

// filtry
function applyFilter() {
  const n = PARCELS.filter(matches).length;
  $("#result-count").textContent = n;
  $("#result-word").textContent = plural(n);
  $("#empty").hidden = n > 0;
  if (mp) mp.setFilter({ ...filter });
  renderList();
  track("filter_change", { ...filter, results: n });
}
$$(".seg button").forEach((b) => b.addEventListener("click", () => {
  $$(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  filter.etapa = b.dataset.etapa;
  applyFilter();
}));
const range = $("#min-area");
const rangeOut = $("#min-area-out");
function syncRange() {
  const v = Number(range.value);
  filter.minArea = v <= 852 ? 0 : v;
  rangeOut.textContent = `${fmt(Math.max(852, v))} m²`;
  range.style.setProperty("--p", `${((v - range.min) / (range.max - range.min)) * 100}%`);
}
range.addEventListener("input", syncRange);
range.addEventListener("change", applyFilter);
range.addEventListener("input", () => { if (mp) mp.setFilter({ ...filter }); const n = PARCELS.filter(matches).length; $("#result-count").textContent = n; $("#result-word").textContent = plural(n); $("#empty").hidden = n > 0; });
syncRange();
$("#only-free").addEventListener("change", (e) => { filter.onlyFree = e.target.checked; applyFilter(); });
$("#reset-filters").addEventListener("click", () => {
  filter.etapa = "all"; filter.minArea = 0; filter.onlyFree = false;
  $$(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.etapa === "all")));
  range.value = range.min; syncRange();
  $("#only-free").checked = false;
  applyFilter();
});
$("#filter-more").addEventListener("click", (e) => {
  const card = $("#filter-card");
  const open = !card.classList.contains("is-expanded");
  card.classList.toggle("is-expanded", open);
  e.currentTarget.setAttribute("aria-expanded", String(open));
});
$("#find-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#find-input").value.replace(/\D/g, "");
  const id = v.padStart(2, "0");
  if (!PARCELS.some((p) => p.id === id)) { showToast("Pozemek s tímto číslem v nabídce není"); return; }
  setList(false);
  $("#filter-card").classList.remove("is-expanded");
  selectPlot(id, "find");
  $("#find-input").value = "";
});

// pohledy
$$("[data-view]").forEach((b) => b.addEventListener("click", () => {
  $$("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  setList(false);
  mp && mp.setView(b.dataset.view);
}));
$("#toggle-houses").addEventListener("change", (e) => { mp && mp.setHouses(e.target.checked); track("houses_toggle", { on: e.target.checked }); });
function setList(on) {
  stage.classList.toggle("is-list", on);
  $("#toggle-list").setAttribute("aria-pressed", String(on));
  if (on) { renderList(); track("list_view_open"); }
}
$("#toggle-list").addEventListener("click", () => setList(!stage.classList.contains("is-list")));

// seznam
let sortKey = "id", sortDir = 1;
function renderList() {
  const tb = $("#plot-table tbody");
  const rows = PARCELS.filter(matches).sort((a, b) => (sortKey === "area" ? (a.area - b.area) * sortDir : a.id.localeCompare(b.id) * sortDir));
  tb.innerHTML = rows.map((p) => {
    const st = statusOf(p.id);
    return `<tr data-row="${p.id}">
      <td>${num(p.id)}</td><td>${fmt(p.area)} m²</td><td class="hide-m">${p.etapa}</td><td class="hide-m">${p.w} × ${p.d} m</td>
      <td><span class="status-pill${st === "rezervace" ? " res" : st === "prodano" ? " sold" : ""}">${STATUS_TXT[st]}</span></td>
      <td style="text-align:right"><button class="btn btn-ghost" type="button" data-pick="${p.id}">Detail</button></td></tr>`;
  }).join("") || `<tr><td colspan="6" style="font-family:inherit;font-size:15px">Tomu nevyhovuje žádný pozemek.</td></tr>`;
}
$("#plot-table thead").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sort]");
  if (!b) return;
  sortDir = sortKey === b.dataset.sort ? -sortDir : b.dataset.sort === "area" ? -1 : 1;
  sortKey = b.dataset.sort;
  $$("#plot-table th").forEach((th) => th.removeAttribute("aria-sort"));
  b.closest("th").setAttribute("aria-sort", sortDir > 0 ? "ascending" : "descending");
  renderList();
});
$("#plot-table tbody").addEventListener("click", (e) => {
  const row = e.target.closest("[data-row]");
  if (!row) return;
  setList(false);
  selectPlot(row.dataset.row, "list");
});
$("#plot-table tbody").addEventListener("mouseover", (e) => { const row = e.target.closest("[data-row]"); if (row && mp) mp.hover(row.dataset.row); });
renderList();

// tooltip
function showTip(p, pt) {
  if (!p || !pt) { tooltip.classList.remove("is-on"); return; }
  tooltip.innerHTML = `<b>Pozemek ${num(p.id)}</b><span>${fmt(p.area)} m² · ${STATUS_TXT[statusOf(p.id)]}</span>`;
  tooltip.style.left = `${pt.x}px`;
  tooltip.style.top = `${pt.y}px`;
  tooltip.classList.add("is-on");
}
stage.addEventListener("mp:interact", () => { $("#hud-hint").style.opacity = "0"; });

function initialPlot() {
  const m = location.hash.match(/pozemek-(\d+)/) || location.search.match(/pozemek=(\d+)/);
  return m ? m[1].padStart(2, "0") : null;
}

async function boot() {
  try {
    const t = document.createElement("canvas");
    if (!(t.getContext("webgl2") || t.getContext("webgl"))) throw new Error("no webgl");
    const { createMasterplan } = await import("./masterplan.js");
    mp = createMasterplan(host, {
      onSelect: (p, source) => openDrawer(p, { source }),
      onHover: showTip,
      startView: isMobile() ? "top" : "persp",
    });
    if (isMobile()) $$("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.view === "top")));
    mp.setStatus(STATUS);
    mp.setFilter({ ...filter });
    stage.classList.add("is-ready");
    const first = initialPlot();
    if (first) setTimeout(() => selectPlot(first, "link"), 600);
    new IntersectionObserver(([e]) => (e.isIntersecting ? mp.start() : mp.stop())).observe(stage);
  } catch (err) {
    console.warn("3D plán nelze spustit, zobrazuji seznam.", err);
    stage.classList.add("is-ready");
    setList(true);
  }
}
new IntersectionObserver(([e], obs) => { if (e.isIntersecting) { obs.disconnect(); boot(); } }, { rootMargin: "600px 0px" }).observe(stage);
new IntersectionObserver(([e]) => { stageVisible = e.isIntersecting; syncBar(); }, { threshold: 0.25 }).observe(stage);

/* ---------- mapa ---------- */
new IntersectionObserver(async ([e], obs) => {
  if (!e.isIntersecting) return;
  obs.disconnect();
  const { createMap } = await import("./map.js");
  createMap($("#map-svg"), $("#dest-list"), $$(".map-modes button"), $$("#amenities [data-poi]"), $("#map-note"));
}, { rootMargin: "500px 0px" }).observe($("#mapcard"));

/* ---------- čísla se dopočítají při vjetí do obrazu ---------- */
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const countIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countIO.unobserve(e.target);
      const node = [...e.target.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.textContent));
      if (!node) continue;
      const target = Number(node.textContent.replace(/\D/g, ""));
      const t0 = performance.now(), dur = 1400;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur), v = Math.round(target * (1 - Math.pow(1 - k, 3)));
        node.textContent = fmt(v);
        if (k < 1) requestAnimationFrame(tick);
      };
      node.textContent = "0";
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });
  $$(".fact dd").forEach((el) => countIO.observe(el));
}

/* ---------- video přeletu v hero (až po obrázku, ne při omezení pohybu) ---------- */
{
  const v = $("#hero-video");
  const reduceM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ""));
  if (v && !reduceM && !saveData) {
    const start = () => {
      v.src = innerWidth < 760 ? v.dataset.srcSm : v.dataset.src;
      v.addEventListener("playing", () => { v.classList.add("is-playing"); $("#hero-media").classList.add("has-video"); }, { once: true });
      v.play().catch(() => {});
      new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause())).observe(v);
    };
    if (document.readyState === "complete") setTimeout(start, 300); else addEventListener("load", () => setTimeout(start, 300), { once: true });
  }
}
{
  const mv = $("#modal-video");
  $$("[data-open-modal]").forEach((b) => b.addEventListener("click", () => {
    if (!mv.src) mv.src = mv.dataset.src;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) mv.play().catch(() => {});
  }));
  $$("[data-close-modal], .modal").forEach((el) => el.addEventListener("click", (e) => { if (e.target === el || el.matches("[data-close-modal]")) mv.pause(); }));
}

/* ---------- oblíbené a porovnání ---------- */
const favBtn = $("#d-fav");
function syncFavBtn() {
  if (!current) return;
  const on = isFav(current.id);
  favBtn.setAttribute("aria-pressed", String(on));
  favBtn.setAttribute("aria-label", on ? "Odebrat z oblíbených" : "Uložit do oblíbených");
  favBtn.innerHTML = `<svg class="icon"><use href="#i-${on ? "heart-fill" : "heart"}"/></svg>`;
}
favBtn.addEventListener("click", () => {
  if (!current) return;
  const added = toggleFav(current.id);
  showToast(added ? `Uloženo do oblíbených (${favs().length}/${FAV_MAX})` : "Odebráno z oblíbených");
});
const cmpBtn = $("#toggle-compare");
const cmp = $("#compare");
function renderCompare() {
  const ids = favs();
  const rows = [
    ["Výměra", (p) => `${fmt(p.area)} m²`],
    ["Rozměry cca", (p) => `${p.w} × ${p.d} m`],
    ["Zastavět lze až", (p) => `${fmt(Math.floor(p.area * 0.2))} m²`],
    ["Etapa", (p) => p.etapa],
    ["Zahrada", (p) => ({ N: "na jih", S: "na sever", E: "na západ" }[p.front])],
    ["Stav", (p) => STATUS_TXT[statusOf(p.id)]],
    ["Cena", (p) => (priceOf(p) ? `${fmt(priceOf(p))} Kč` : "na vyžádání")],
  ];
  const plots = ids.map((id) => PARCELS.find((p) => p.id === id)).filter(Boolean);
  $("#compare-table").innerHTML = plots.length ? `<thead><tr><th></th>${plots.map((p) => `<th scope="col"><span class="c-num">${num(p.id)}</span><button type="button" class="c-rm" data-rm="${p.id}" aria-label="Odebrat pozemek ${num(p.id)}"><svg class="icon"><use href="#i-x"/></svg></button></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([label, f]) => `<tr><th scope="row">${label}</th>${plots.map((p) => `<td>${f(p)}</td>`).join("")}</tr>`).join("")}
    <tr><th scope="row"></th>${plots.map((p) => `<td><a class="c-link" href="pozemky/${num(p.id)}">Detail</a> · <button type="button" class="c-show" data-show="${p.id}">Ve 3D</button></td>`).join("")}</tr></tbody>` : "";
  $("#compare-hint").textContent = plots.length ? `${plots.length} z ${FAV_MAX} pozemků. Ceny pošleme ke všem najednou.` : "Uložte si pozemky srdíčkem v detailu.";
  $("#compare-send").hidden = !plots.length;
}
function syncFavCount() {
  const n = favs().length;
  cmpBtn.hidden = n === 0;
  $("#fav-count").textContent = n;
  if (!n) setCompare(false);
  renderCompare();
  syncFavBtn();
}
function setCompare(on) {
  cmp.classList.toggle("is-open", on);
  cmpBtn.setAttribute("aria-pressed", String(on));
  if (on) { setList(false); renderCompare(); track("compare_open", { count: favs().length }); }
}
cmpBtn.addEventListener("click", () => setCompare(!cmp.classList.contains("is-open")));
$("#compare-close").addEventListener("click", () => setCompare(false));
cmp.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rm]");
  if (rm) { toggleFav(rm.dataset.rm); return; }
  const sh = e.target.closest("[data-show]");
  if (sh) { setCompare(false); selectPlot(sh.dataset.show, "compare"); }
});
$("#compare-send").addEventListener("click", () => {
  const ids = favs();
  if (!ids.length) return;
  plotSelect.value = ids[0];
  $("#f-when").value = "Zatím jen ceník";
  const msg = $("#f-msg");
  msg.value = `Zajímají mě pozemky ${ids.map(num).join(", ")}. Pošlete mi prosím ceny.`;
  track("compare_send", { plots: ids.join(",") });
});
onFavs(syncFavCount);
syncFavCount();

/* ---------- slunce ve 3D ---------- */
{
  const panel = $("#hud-sun"), btn = $("#toggle-sun"), range = $("#sun-time"), out = $("#sun-out"), playBtn = $("#sun-play");
  let season = "leto", playing = 0;
  const apply = () => {
    const t = Number(range.value);
    out.textContent = fmtTime(t);
    if (mp) mp.setSun(season, t);
  };
  const setRange = () => {
    const d = daylight(season);
    range.min = (Math.ceil(d.rise * 4) / 4).toFixed(2);
    range.max = (Math.floor(d.set * 4) / 4).toFixed(2);
    if (Number(range.value) < Number(range.min) || Number(range.value) > Number(range.max)) range.value = Math.min(Math.max(16, range.min), range.max);
    $("#sun-note").textContent = `${SEASONS[season].note}: východ ${fmtTime(d.rise)}, západ ${fmtTime(d.set)}`;
  };
  const stop = () => { cancelAnimationFrame(playing); playing = 0; playBtn.innerHTML = '<svg class="icon"><use href="#i-play"/></svg>'; playBtn.setAttribute("aria-label", "Přehrát průběh dne"); };
  btn.addEventListener("click", () => {
    const on = panel.hidden;
    panel.hidden = !on;
    btn.setAttribute("aria-pressed", String(on));
    if (on) {
      const h = $("#toggle-houses");
      if (!h.checked) { h.checked = true; mp && mp.setHouses(true); }
      setRange(); apply();
      track("sun_open");
    } else { stop(); mp && mp.setSun(); }
  });
  $$("[data-season]").forEach((b) => b.addEventListener("click", () => {
    season = b.dataset.season;
    $$("[data-season]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setRange(); apply();
  }));
  range.addEventListener("input", () => { stop(); apply(); });
  playBtn.addEventListener("click", () => {
    if (playing) return stop();
    playBtn.innerHTML = '<svg class="icon"><use href="#i-pause"/></svg>';
    playBtn.setAttribute("aria-label", "Zastavit");
    if (Number(range.value) >= Number(range.max) - 0.1) range.value = range.min;
    let last = performance.now();
    const tick = (now) => {
      const v = Number(range.value) + ((now - last) / 1000) * 1.6; // 1,6 hodiny za sekundu
      last = now;
      range.value = v >= Number(range.max) ? range.min : v;
      apply();
      playing = requestAnimationFrame(tick);
    };
    playing = requestAnimationFrame(tick);
  });
}
