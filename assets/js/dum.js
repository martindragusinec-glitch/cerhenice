// Stránka „Váš dům na pozemku“: vybraný typ domu postavený na vybraném pozemku, se sluncem a kontrolou pravidel.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PARCELS, SITE } from "./../data/parcels.js";
import { STATUS } from "./config.js";
import { sunAt, daylight, fmtTime } from "./sun.js";
import { TYPES, buildHouse } from "./houses.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => new Intl.NumberFormat("cs-CZ").format(Math.round(n));
const num = (id) => String(Number(id));
const track = (event, data = {}) => { (window.dataLayer = window.dataLayer || []).push({ event, ...data }); };
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = innerWidth < 900;

/* ---------- stav ---------- */
const qs = new URLSearchParams(location.search);
const state = {
  plot: (qs.get("pozemek") || "12").padStart(2, "0"),
  type: TYPES[qs.get("typ")] ? qs.get("typ") : "podkrovi",
  ridge: qs.get("stit") !== "1",
  garageRight: qs.get("garaz") !== "vlevo",
  setback: Number(qs.get("odstup")) || 6,
  season: "leto",
  time: 16,
};
if (!PARCELS.some((p) => p.id === state.plot)) state.plot = "12";
const plotOf = (id) => PARCELS.find((p) => p.id === id);

/* ---------- geometrie pozemku ---------- */
const A = (SITE.angle * Math.PI) / 180;
const V = new THREE.Vector2(-Math.sin(A), Math.cos(A));
function frameOf(p) {
  const c = new THREE.Vector2(...p.c);
  const pts = p.poly.map(([x, z]) => new THREE.Vector2(x, z));
  let L = null, best = 0;
  for (let i = 0; i < pts.length; i++) { const e = pts[(i + 1) % pts.length].clone().sub(pts[i]); if (e.length() > best) { best = e.length(); L = e.clone().normalize(); } }
  const back = p.front === "N" ? V.clone() : p.front === "S" ? V.clone().negate() : new THREE.Vector2(-1, 0);
  if (L.dot(back) < 0) L.negate();
  const W = new THREE.Vector2(-L.y, L.x);
  let tmin = Infinity, tmax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (const q of pts) { const d = q.clone().sub(c); tmin = Math.min(tmin, d.dot(L)); tmax = Math.max(tmax, d.dot(L)); wmin = Math.min(wmin, d.dot(W)); wmax = Math.max(wmax, d.dot(W)); }
  return { c, L, W, tmin, tmax, wmin, wmax };
}
function shapeOf(poly, inset = 0, c = null) {
  const s = new THREE.Shape();
  poly.forEach(([x, z], i) => {
    let px = x, pz = z;
    if (inset && c) { const dx = c[0] - x, dz = c[1] - z, l = Math.hypot(dx, dz); px += (dx / l) * inset; pz += (dz / l) * inset; }
    i ? s.lineTo(px, -pz) : s.moveTo(px, -pz);
  });
  s.closePath();
  return s;
}
const flat = (g) => { g.rotateX(-Math.PI / 2); return g; };

/* ---------- scéna ---------- */
const host = $("#house-canvas");
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe5d3);
scene.fog = new THREE.Fog(0xdfe5d3, 260, 900);
const camera = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, 0.5, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
controls.minDistance = 14;
controls.maxDistance = 260;

const hemi = new THREE.HemisphereLight(0xffffff, 0xc9d1bd, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e4, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 500 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0xdde3cf }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.3; ground.receiveShadow = true;
scene.add(ground);
const base = new THREE.Mesh(flat(new THREE.ExtrudeGeometry(shapeOf(SITE.outline), { depth: 0.2, bevelEnabled: false })), new THREE.MeshLambertMaterial({ color: 0xf6f6f1 }));
base.receiveShadow = true;
scene.add(base);

// parcely: vybraná zeleně, ostatní tlumeně
const plotMeshes = {};
for (const p of PARCELS) {
  const m = new THREE.Mesh(flat(new THREE.ExtrudeGeometry(shapeOf(p.poly, 0.45, p.c), { depth: 0.4, bevelEnabled: false })), new THREE.MeshLambertMaterial({ color: 0xcdd8bd }));
  m.receiveShadow = true;
  scene.add(m);
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p.poly.map(([x, z]) => new THREE.Vector3(x, 0.43, z))), new THREE.LineBasicMaterial({ color: 0xffffff }));
  scene.add(edge);
  plotMeshes[p.id] = { m, edge };
}
// stromy v uličním pásu
{
  const pts = [];
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const p of PARCELS) {
    const f = frameOf(p);
    const fr = f.c.clone().add(f.L.clone().multiplyScalar(f.tmin - 3.4)).add(f.W.clone().multiplyScalar((f.wmin + f.wmax) / 2 + (f.wmax - f.wmin) * (rnd() - 0.5) * 0.6));
    pts.push([fr.x, fr.y, 2.2 + rnd() * 0.7]);
  }
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x86ad6e, flatShading: true }), pts.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 6), new THREE.MeshLambertMaterial({ color: 0x6d5d48 }), pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  pts.forEach(([x, z, r], i) => {
    pos.set(x, r * 1.5 + r * 0.8, z); s.set(r, r * 1.15, r); m4.compose(pos, q, s); crowns.setMatrixAt(i, m4);
    pos.set(x, r * 0.75 + 0.3, z); s.set(1, r * 1.5, 1); m4.compose(pos, q, s); trunks.setMatrixAt(i, m4);
  });
  crowns.castShadow = trunks.castShadow = true;
  scene.add(crowns, trunks);
}

/* ---------- dům ---------- */
let houseObj = null;
const driveMat = new THREE.MeshLambertMaterial({ color: 0xc9ccc2 });
let drive = null;
function placeHouse() {
  if (houseObj) scene.remove(houseObj.group);
  if (drive) scene.remove(drive);
  const p = plotOf(state.plot);
  const f = frameOf(p);
  houseObj = buildHouse(state.type, { ridgeAlongStreet: state.ridge, garageRight: state.garageRight });
  const center = f.c.clone().add(f.L.clone().multiplyScalar(f.tmin + state.setback + houseObj.front)).add(f.W.clone().multiplyScalar((f.wmin + f.wmax) / 2));
  houseObj.group.position.set(center.x, 0.4, center.y);
  houseObj.group.rotation.y = Math.atan2(-f.L.x, -f.L.y);
  scene.add(houseObj.group);
  // příjezd: zpevněná plocha od ulice k domu
  const dw = 3.2, dl = state.setback;
  const side = (f.wmax - f.wmin) / 2 - 2.6;
  const dc = f.c.clone().add(f.L.clone().multiplyScalar(f.tmin + dl / 2)).add(f.W.clone().multiplyScalar((f.wmin + f.wmax) / 2 + (state.garageRight ? 1 : -1) * Math.min(side, houseObj.across / 2 - dw / 2)));
  drive = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.06, dl), driveMat);
  drive.position.set(dc.x, 0.43, dc.y);
  drive.rotation.y = Math.atan2(-f.L.x, -f.L.y);
  drive.receiveShadow = true;
  scene.add(drive);
  // barvy parcel
  for (const [id, o] of Object.entries(plotMeshes)) {
    const me = id === state.plot;
    o.m.material.color.set(me ? 0xb3d095 : STATUS[id] === "prodano" ? 0xc8ccc2 : 0xcdd8bd);
    o.edge.material.color.set(me ? 0x132019 : 0xffffff);
  }
  sun.target.position.set(f.c.x, 0, f.c.y);
  return { p, f };
}

/* ---------- kamera ---------- */
let fly = null;
function viewFor(name) {
  const p = plotOf(state.plot), f = frameOf(p);
  const hp = houseObj ? houseObj.group.position : new THREE.Vector3(f.c.x, 0, f.c.y);
  const target = new THREE.Vector3(hp.x, 3.5, hp.z).add(new THREE.Vector3(f.L.x, 0, f.L.y).multiplyScalar(name === "zahrada" ? -2 : 3));
  const toStreet = Math.atan2(-f.L.x, -f.L.y);
  const r = mobile ? 72 : 50;
  const v = { ulice: { az: toStreet + 0.62, polar: 60 }, zahrada: { az: toStreet + Math.PI - 0.55, polar: 60 }, shora: { az: toStreet, polar: 3 } }[name];
  const pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(name === "shora" ? r * 1.4 : r, THREE.MathUtils.degToRad(v.polar), v.az)).add(target);
  return { pos, target };
}
function goView(name, animate = true) {
  const { pos, target } = viewFor(name);
  if (!animate || reduce) { camera.position.copy(pos); controls.target.copy(target); fly = null; return; }
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, s: performance.now(), d: 1000 };
}

/* ---------- slunce ---------- */
function applySun() {
  const s = sunAt(state.season, state.time);
  const el = Math.max(s.el, 0.03);
  const t = sun.target.position;
  sun.position.set(t.x + Math.sin(s.az) * Math.cos(el) * 200, Math.sin(el) * 200, t.z - Math.cos(s.az) * Math.cos(el) * 200);
  const k = Math.min(1, el / 0.45);
  sun.intensity = s.el > 0 ? 0.8 + 1.5 * k : 0;
  sun.color.set(0xffb074).lerp(new THREE.Color(0xfff6e4), k);
  hemi.intensity = 1.0 + 0.5 * k;
  $("#sun-out").textContent = fmtTime(state.time);
}
const range = $("#sun-time");
function setRange() {
  const d = daylight(state.season);
  range.min = (Math.ceil(d.rise * 4) / 4).toFixed(2);
  range.max = (Math.floor(d.set * 4) / 4).toFixed(2);
  if (state.time < +range.min || state.time > +range.max) state.time = 15;
  range.value = state.time;
}

/* ---------- panel ---------- */
const sel = $("#h-plot");
sel.innerHTML = PARCELS.map((p) => `<option value="${p.id}">Pozemek ${num(p.id)} · ${fmt(p.area)} m²${STATUS[p.id] === "prodano" ? " · prodáno" : ""}</option>`).join("");
const typesEl = $("#h-types");
const icon = (t) => {
  // jednoduchý pohled na štít domu, úměrně rozměrům typu
  const w = t.D * 4, wall = t.wall * 4, rise = (t.D / 2) * Math.tan((t.pitch * Math.PI) / 180) * 4, H = 60;
  const x0 = (64 - w) / 2, yb = H - 4;
  return `<svg viewBox="0 0 64 ${H}" aria-hidden="true"><path d="M${x0} ${yb}V${yb - wall}L32 ${yb - wall - rise}L${x0 + w} ${yb - wall}V${yb}Z" fill="#fbfcf8" stroke="#132019" stroke-width="1.6"/><path d="M${x0 - 3} ${yb - wall + 2}L32 ${yb - wall - rise - 1}L${x0 + w + 3} ${yb - wall + 2}" fill="none" stroke="#b8644a" stroke-width="3"/>${t.wing ? `<rect x="${x0 + w}" y="${yb - 11}" width="9" height="11" fill="#fbfcf8" stroke="#132019" stroke-width="1.4"/>` : ""}</svg>`;
};
typesEl.innerHTML = Object.entries(TYPES).map(([k, t]) => `<button type="button" role="radio" class="type-card" data-type="${k}" aria-checked="false">${icon(t)}<span><b>${t.name}</b><small>${t.short} · ${t.rooms}</small></span></button>`).join("");

function syncUI() {
  const p = plotOf(state.plot);
  sel.value = state.plot;
  $("#h-plot-link").href = `pozemky/${num(p.id)}`;
  $("#h-plot-meta").textContent = `${fmt(p.area)} m² · ${p.w} × ${p.d} m · etapa ${p.etapa}`;
  $$(".type-card").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === state.type)));
  const t = TYPES[state.type];
  $$("#h-ridge button").forEach((b) => { b.setAttribute("aria-pressed", String((b.dataset.ridge === "1") === state.ridge)); b.disabled = !!t.wing && b.dataset.ridge === "0"; });
  $("#h-garage-row").hidden = !t.wing;
  $("#h-garage").checked = state.garageRight;
  $("#h-setback").value = state.setback;
  $("#h-setback-out").textContent = `${String(state.setback).replace(".", ",")} m`;
  $("#h-cta").innerHTML = `${STATUS[p.id] === "prodano" ? "Chci podobný pozemek" : `Chci pozemek ${num(p.id)}`} <svg class="icon icon-arrow"><use href="#i-arrow-right"/></svg>`;
  $("#h-cta").href = `pozemky/${num(p.id)}#poptavka`;
}

function results() {
  const p = plotOf(state.plot), f = frameOf(p), h = houseObj, t = h.type;
  const limit = p.area * 0.2;
  const garden = p.area - h.footprint - 26 - 3.2 * state.setback;
  const share = (h.footprint / p.area) * 100;
  const widthAvail = f.wmax - f.wmin, depthAvail = f.tmax - f.tmin;
  const fitsW = h.across + 4 <= widthAvail;
  const fitsD = state.setback + h.front + h.back + 6 <= depthAvail;
  $("#r-built").innerHTML = `${fmt(h.footprint)} <small>m²</small>`;
  $("#r-limit").innerHTML = `${fmt(limit)} <small>m²</small>`;
  $("#r-usable").innerHTML = `${fmt(t.usable)} <small>m²</small>`;
  $("#r-garden").innerHTML = `${fmt(garden)} <small>m²</small>`;
  const checks = [
    [share <= 20, `Zastavěnost ${share.toFixed(1).replace(".", ",")} % z povolených 20 %`],
    [true, `${t.floors === 2 ? "2 nadzemní podlaží" : t.attic ? "1 podlaží a podkroví" : "1 nadzemní podlaží"}, povoleno nejvýše 2`],
    [t.pitch >= 40 && t.pitch <= 50, `Sedlová střecha ${t.pitch}°, povoleno 40 až 50°`],
    [fitsW, fitsW ? `Šířka domu ${fmt(h.across)} m, pozemek ${fmt(widthAvail)} m` : `Dům je na šířku pozemku moc široký (${fmt(h.across)} m), zkuste otočení štítem`],
    [fitsD, fitsD ? `Za domem zbude zahrada hluboká cca ${fmt(depthAvail - state.setback - h.front - h.back)} m` : "Při tomto odstupu se dům do hloubky nevejde"],
  ];
  $("#r-checks").innerHTML = checks.map(([ok, txt]) => `<li class="${ok ? "ok" : "bad"}"><svg class="icon"><use href="#i-${ok ? "check" : "x"}"/></svg>${txt}</li>`).join("");
}

function update({ camera: cam = false } = {}) {
  placeHouse();
  syncUI();
  results();
  applySun();
  if (cam) goView(currentView);
  const u = new URLSearchParams({ pozemek: num(state.plot), typ: state.type });
  if (!state.ridge) u.set("stit", "1");
  if (!state.garageRight) u.set("garaz", "vlevo");
  if (state.setback !== 6) u.set("odstup", state.setback);
  history.replaceState(null, "", `${location.pathname}?${u}`);
}

let currentView = "ulice";
sel.addEventListener("change", () => { state.plot = sel.value; update({ camera: true }); track("house_plot", { plot_id: state.plot }); });
typesEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]");
  if (!b) return;
  state.type = b.dataset.type;
  if (TYPES[state.type].wing) state.ridge = true;
  update();
  track("house_type", { type: state.type, plot_id: state.plot });
});
$$("#h-ridge button").forEach((b) => b.addEventListener("click", () => { state.ridge = b.dataset.ridge === "1"; update(); }));
$("#h-garage").addEventListener("change", (e) => { state.garageRight = e.target.checked; update(); });
$("#h-setback").addEventListener("input", (e) => { state.setback = Number(e.target.value); update(); });
$$("[data-hview]").forEach((b) => b.addEventListener("click", () => {
  currentView = b.dataset.hview;
  $$("[data-hview]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  goView(currentView);
}));
$$("[data-season]").forEach((b) => b.addEventListener("click", () => {
  state.season = b.dataset.season;
  $$("[data-season]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  setRange(); applySun();
}));
let playing = 0;
const playBtn = $("#sun-play");
const stopPlay = () => { cancelAnimationFrame(playing); playing = 0; playBtn.innerHTML = '<svg class="icon"><use href="#i-play"/></svg>'; };
range.addEventListener("input", () => { stopPlay(); state.time = Number(range.value); applySun(); });
playBtn.addEventListener("click", () => {
  if (playing) return stopPlay();
  playBtn.innerHTML = '<svg class="icon"><use href="#i-pause"/></svg>';
  if (state.time >= +range.max - 0.1) state.time = +range.min;
  let last = performance.now();
  const tick = (now) => { state.time += ((now - last) / 1000) * 1.4; last = now; if (state.time >= +range.max) state.time = +range.min; range.value = state.time; applySun(); playing = requestAnimationFrame(tick); };
  playing = requestAnimationFrame(tick);
});
$("#h-share").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); toast("Odkaz na sestavu zkopírován"); } catch { toast(location.href); }
  track("house_share", { plot_id: state.plot, type: state.type });
});
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("is-on"), 2200); }

/* ---------- smyčka ---------- */
setRange();
update();
goView("ulice", false);
if (!reduce) { const { pos } = viewFor("ulice"); camera.position.copy(pos.clone().multiplyScalar(1).add(new THREE.Vector3(0, 30, 0))); goView("ulice"); }
const ease = (t) => 1 - Math.pow(1 - t, 3);
function frame(now) {
  requestAnimationFrame(frame);
  if (fly) {
    const k = Math.min(1, (now - fly.s) / fly.d);
    camera.position.lerpVectors(fly.p0, fly.p1, ease(k));
    controls.target.lerpVectors(fly.t0, fly.t1, ease(k));
    if (k >= 1) fly = null;
  }
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
controls.addEventListener("start", () => { fly = null; });
new ResizeObserver(() => {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
}).observe(host);
track("house_page", { plot_id: state.plot, type: state.type });
