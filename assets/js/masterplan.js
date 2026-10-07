// 3D masterplan Za Kapličkou. Geometrie parcel = koordinační situace APRIS (assets/data/parcels.js).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { SITE, PUBLIC, PARCELS } from "../data/parcels.js";
import { sunAt } from "./sun.js";
import { buildContext, CONTEXT_FOCUS } from "./context3d.js";

const COL = {
  free: new THREE.Color(0xb3d095),
  res: new THREE.Color(0xdfcd9c),
  sold: new THREE.Color(0xc2c6bd),
  dim: new THREE.Color(0xe1e5d8),
  hover: new THREE.Color(0xf0dc6e),
  sel: new THREE.Color(0xe4cb3c),
  pub: 0x8fb478,
  road: 0xf8f8f3,
  asphalt: 0xc6cbc0,
  bg: 0xdfe5d3,
  wall: 0xfbfbf7,
  roof: 0xb8644a,
  crown: [0x8db275, 0x7ea866, 0x9cbd83],
  trunk: 0x6d5d48,
};

const A = THREE.MathUtils.degToRad(SITE.angle);
const V = new THREE.Vector2(-Math.sin(A), Math.cos(A)); // napříč ulicemi, k jihu
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();

function shapeFrom(poly, inset = 0, c = null) {
  const s = new THREE.Shape();
  poly.forEach(([x, z], i) => {
    let px = x, pz = z;
    if (inset && c) {
      const d = new THREE.Vector2(c[0] - x, c[1] - z);
      const l = d.length();
      if (l > 0) { px += (d.x / l) * inset; pz += (d.y / l) * inset; }
    }
    i ? s.lineTo(px, -pz) : s.moveTo(px, -pz);
  });
  s.closePath();
  return s;
}
const flat = (geo) => { geo.rotateX(-Math.PI / 2); return geo; };

function frameOf(p) {
  const c = new THREE.Vector2(p.c[0], p.c[1]);
  const pts = p.poly.map(([x, z]) => new THREE.Vector2(x, z));
  let L = null, best = 0;
  for (let i = 0; i < pts.length; i++) {
    const e = pts[(i + 1) % pts.length].clone().sub(pts[i]);
    if (e.length() > best) { best = e.length(); L = e.clone().normalize(); }
  }
  const back = p.front === "N" ? V.clone() : p.front === "S" ? V.clone().negate() : new THREE.Vector2(-1, 0);
  if (L.dot(back) < 0) L.negate();
  const W = new THREE.Vector2(-L.y, L.x);
  let tmin = Infinity, tmax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (const q of pts) {
    const d = q.clone().sub(c);
    tmin = Math.min(tmin, d.dot(L)); tmax = Math.max(tmax, d.dot(L));
    wmin = Math.min(wmin, d.dot(W)); wmax = Math.max(wmax, d.dot(W));
  }
  return { c, L, W, tmin, tmax, wmin, wmax };
}

function pointInPoly([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function fieldTexture() {
  const S = 2048, cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");
  g.fillStyle = "#dde3cf"; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2); g.rotate(A);
  const tones = ["#e2e3cb", "#d6ddc3", "#e5e4cf", "#d1d9bd", "#dcdfc7", "#d9e0ca", "#e6e4d1"];
  let s2 = 3; const r2 = () => ((s2 = (s2 * 48271) % 2147483647) / 2147483647);
  for (let y = -S; y < S; ) {
    const h = 120 + r2() * 260;
    for (let x = -S; x < S; ) {
      const w = 160 + r2() * 420;
      g.fillStyle = tones[Math.floor(r2() * tones.length)];
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.strokeStyle = "rgba(60,80,60,0.06)"; g.lineWidth = 1.2;
      const vert = r2() > 0.5;
      for (let k = 8; k < (vert ? w : h); k += 9) {
        g.beginPath();
        if (vert) { g.moveTo(x + k, y + 4); g.lineTo(x + k, y + h - 4); } else { g.moveTo(x + 4, y + k); g.lineTo(x + w - 4, y + k); }
        g.stroke();
      }
      x += w;
    }
    y += h;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function createMasterplan(host, { onSelect, onHover, onWalk, startView = "persp" } = {}) {
  const W0 = host.clientWidth, H0 = host.clientHeight;
  const mobile = innerWidth < 900;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.setSize(W0, H0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(W0, H0);
  Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.bg, mobile ? 900 : 650, mobile ? 2200 : 1500);

  const camera = new THREE.PerspectiveCamera(30, W0 / H0, 5, 14000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 60;
  controls.maxDistance = mobile ? 7000 : 4200;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
  controls.screenSpacePanning = false;
  controls.rotateSpeed = 0.6;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc9d1bd, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e4, 2.0);
  sun.position.set(-170, 260, 210);
  sun.castShadow = true;
  const sm = mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 50, far: 800 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);

  const tex = fieldTexture();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.4, -1200); ground.receiveShadow = true;
  scene.add(ground);

  // silnice podél východní hrany
  const out = SITE.outline;
  const maxX = Math.max(...out.map((p) => p[0]));
  const east = out.filter((p) => p[0] > maxX - 18).sort((a, b) => a[1] - b[1]);
  const NE = new THREE.Vector2(...east[0]), SE = new THREE.Vector2(...east[east.length - 1]);
  const dir = SE.clone().sub(NE).normalize(), nrm = new THREE.Vector2(dir.y, -dir.x);
  if (nrm.x < 0) nrm.negate();
  const mid = NE.clone().add(SE).multiplyScalar(0.5).add(nrm.clone().multiplyScalar(6.5));
  // silnici III/3297 a okolí kreslí context3d.js (OpenStreetMap)

  const base = new THREE.Mesh(flat(new THREE.ExtrudeGeometry(shapeFrom(out), { depth: 0.25, bevelEnabled: false })), new THREE.MeshLambertMaterial({ color: COL.road }));
  base.receiveShadow = true;
  scene.add(base);

  for (const pub of PUBLIC) {
    const c = pub.poly.reduce((a, [x, z]) => [a[0] + x / pub.poly.length, a[1] + z / pub.poly.length], [0, 0]);
    const m = new THREE.Mesh(flat(new THREE.ExtrudeGeometry(shapeFrom(pub.poly, 0.4, c), { depth: 0.45, bevelEnabled: false })), new THREE.MeshLambertMaterial({ color: COL.pub }));
    m.receiveShadow = true;
    scene.add(m);
    if (pub.ts) {
      const ts = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3.5), new THREE.MeshLambertMaterial({ color: 0xe9ebe4 }));
      const tp = pub.poly.reduce((a, b) => (b[0] > a[0] ? b : a));
      ts.position.set(tp[0] - 6, 1.75, tp[1] + 6);
      ts.castShadow = true;
      scene.add(ts);
    }
  }

  // orientační popisky okolí
  const minZ = Math.min(...out.map((p) => p[1]));
  const addTag = (text, x, z) => {
    const el = document.createElement("div");
    el.className = "map-label";
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.set(x, 1, z);
    scene.add(o);
  };
  void addTag; void minZ; void mid;

  // parcely
  const plots = [];
  const houseGroup = new THREE.Group();
  houseGroup.visible = false;
  scene.add(houseGroup);
  const wallMat = new THREE.MeshLambertMaterial({ color: COL.wall });
  const roofMat = new THREE.MeshLambertMaterial({ color: COL.roof });
  const trees = [];

  for (const p of PARCELS) {
    const geo = flat(new THREE.ExtrudeGeometry(shapeFrom(p.poly, 0.55, p.c), { depth: 0.55, bevelEnabled: false }));
    const mat = new THREE.MeshLambertMaterial({ color: COL.free.clone() });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.userData.id = p.id;
    scene.add(mesh);

    const edgePts = p.poly.map(([x, z]) => new THREE.Vector3(x, 0.58, z));
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    edge.raycast = () => {};
    mesh.add(edge);

    const el = document.createElement("div");
    el.className = "plot-label";
    el.textContent = String(Number(p.id));
    const label = new CSS2DObject(el);
    label.position.set(p.c[0], 2.4, p.c[1]);
    scene.add(label);

    // ukázkový dům: hřeben souběžně s ulicí, odstup od ulice 6,5 m
    const f = frameOf(p);
    const depthAvail = f.tmax - f.tmin, widthAvail = f.wmax - f.wmin;
    const hl = Math.min(13, widthAvail - 8) * rr(0.86, 1), hd = 9.2, wall = 3.1;
    const hc = f.c.clone().add(f.L.clone().multiplyScalar(f.tmin + 6.5 + hd / 2)).add(f.W.clone().multiplyScalar((f.wmin + f.wmax) / 2 + rr(-1.5, 1.5)));
    const house = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(hl, wall, hd), wallMat);
    body.position.y = wall / 2 + 0.55;
    const ov = 0.45, half = hd / 2 + ov;
    const tri = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, half)]);
    const rg = new THREE.ExtrudeGeometry(tri, { depth: hl + ov * 2, bevelEnabled: false });
    rg.translate(0, 0, -(hl + ov * 2) / 2);
    rg.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(rg, roofMat);
    roof.position.y = wall + 0.55;
    for (const m of [body, roof]) { m.castShadow = true; m.receiveShadow = true; house.add(m); }
    house.position.set(hc.x, 0, hc.y);
    house.rotation.y = Math.atan2(-f.W.y, f.W.x);
    houseGroup.add(house);

    const front = f.c.clone().add(f.L.clone().multiplyScalar(f.tmin - 3.4)).add(f.W.clone().multiplyScalar((f.wmin + f.wmax) / 2 + widthAvail * rr(-0.3, 0.3)));
    trees.push([front.x, front.y, rr(2.2, 2.8)]);
    if (depthAvail > 30) {
      const t = f.c.clone().add(f.L.clone().multiplyScalar(f.tmax - rr(4, 10))).add(f.W.clone().multiplyScalar(rr(f.wmin + 3, f.wmax - 3)));
      trees.push([t.x, t.y, rr(1.8, 2.8)]);
    }
    plots.push({ p, mesh, mat, edge, label, el, house, lift: 0, frame: f });
  }

  for (const pub of PUBLIC) {
    const xs = pub.poly.map((q) => q[0]), zs = pub.poly.map((q) => q[1]);
    const n = pub.area > 1000 ? 14 : 4;
    for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
      const pt = [rr(Math.min(...xs) + 4, Math.max(...xs) - 4), rr(Math.min(...zs) + 4, Math.max(...zs) - 4)];
      if (pointInPoly(pt, pub.poly)) { trees.push([pt[0], pt[1], rr(2.4, 3.6)]); k++; }
    }
  }
  const oc = out.reduce((a, [x, z]) => [a[0] + x / out.length, a[1] + z / out.length], [0, 0]);
  for (let i = 0; i < out.length; i++) {
    const a = new THREE.Vector2(...out[i]), b = new THREE.Vector2(...out[(i + 1) % out.length]);
    const len = a.distanceTo(b);
    if (len < 14) continue;
    for (let t = 6; t < len - 6; t += rr(10, 18)) {
      if (rnd() < 0.3) continue;
      const pt = a.clone().lerp(b, t / len);
      if (pt.x > maxX - 12) continue;
      const o = pt.clone().sub(new THREE.Vector2(...oc)).normalize().multiplyScalar(4.5);
      trees.push([pt.x + o.x + rr(-1.5, 1.5), pt.y + o.y + rr(-1.5, 1.5), rr(2.2, 3.4)]);
    }
  }
  {
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), trees.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 1, 6), new THREE.MeshLambertMaterial({ color: COL.trunk }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
    trees.forEach(([x, z, r], i) => {
      const h = r * 1.5;
      pos.set(x, h + r * 0.75, z); s.set(r, r * 1.15, r);
      m4.compose(pos, q, s); crowns.setMatrixAt(i, m4);
      col.set(COL.crown[i % 3]); crowns.setColorAt(i, col);
      pos.set(x, h / 2 + 0.3, z); s.set(1, h, 1);
      m4.compose(pos, q, s); trunks.setMatrixAt(i, m4);
    });
    crowns.castShadow = trunks.castShadow = true;
    crowns.raycast = trunks.raycast = () => {};
    scene.add(crowns, trunks);
  }

  // ------- stav, filtry, výběr -------
  const byId = Object.fromEntries(plots.map((o) => [o.p.id, o]));
  const state = { hovered: null, listHover: null, selected: null, filter: { etapa: "all", minArea: 0, onlyFree: false }, status: {} };
  const statusOf = (id) => state.status[id] || "volny";
  const matches = (p) => {
    const f = state.filter;
    if (f.etapa !== "all" && String(p.etapa) !== f.etapa) return false;
    if (p.area < f.minArea) return false;
    if (f.onlyFree && statusOf(p.id) !== "volny") return false;
    return true;
  };
  function targetOf(o) {
    const id = o.p.id, st = statusOf(id);
    if (state.selected === id) return { color: COL.sel, lift: 1.4 };
    if (!matches(o.p)) return { color: COL.dim, lift: 0 };
    if (state.hovered === id || state.listHover === id) return { color: COL.hover, lift: 0.8 };
    return { color: st === "rezervace" ? COL.res : st === "prodano" ? COL.sold : COL.free, lift: 0 };
  }
  function refreshLabels() {
    for (const o of plots) {
      o.el.classList.toggle("is-dim", !matches(o.p) && state.selected !== o.p.id);
      o.el.classList.toggle("is-sel", state.selected === o.p.id);
      o.edge.material.color.set(state.selected === o.p.id ? 0x132019 : 0xffffff);
      o.edge.material.opacity = state.selected === o.p.id ? 1 : 0.8;
    }
  }

  // ------- kamera: usazení modelu do okna -------
  const bboxPts = [];
  for (const [x, z] of out) bboxPts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 8, z));
  const views = {
    persp: { polar: 50, az: 14 },
    top: { polar: 0.5, az: 0 },
    street: { polar: 74, az: -10, r: 230, target: [10, 0, 40] },
    okoli: { polar: 46, az: 10, pts: [...out, ...CONTEXT_FOCUS] },
  };
  const center = new THREE.Vector3(0, 0, 4);
  const tmpCam = camera.clone();
  function fitRadius(v, target, pts = bboxPts) {
    const m = mobile ? { x: 0.94, yTop: 0.66, yBot: -0.74 } : { x: 0.9, yTop: 0.84, yBot: -0.8 };
    let lo = 80, hi = 6000;
    for (let i = 0; i < 22; i++) {
      const r = (lo + hi) / 2;
      tmpCam.aspect = camera.aspect; tmpCam.fov = camera.fov; tmpCam.updateProjectionMatrix();
      tmpCam.position.setFromSpherical(new THREE.Spherical(r, THREE.MathUtils.degToRad(v.polar), THREE.MathUtils.degToRad(v.az))).add(target);
      tmpCam.lookAt(target); tmpCam.updateMatrixWorld();
      let ok = true;
      for (const p of pts) {
        const q = p.clone().project(tmpCam);
        if (Math.abs(q.x) > m.x || q.y > m.yTop || q.y < m.yBot) { ok = false; break; }
      }
      ok ? (hi = r) : (lo = r);
    }
    return hi;
  }
  function viewPos(name) {
    const v = views[name];
    let target = v.target ? new THREE.Vector3(...v.target) : center.clone();
    let pts = bboxPts;
    if (v.pts) {
      const xs = v.pts.map((q) => q[0]), zs = v.pts.map((q) => q[1]);
      target = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
      pts = v.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    }
    const r = v.r ? v.r * (mobile ? 1.4 : 1) : fitRadius(v, target, pts) * (v.pts ? (mobile ? 1.5 : 1.08) : 1);
    return { pos: new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, THREE.MathUtils.degToRad(v.polar), THREE.MathUtils.degToRad(v.az))).add(target), target, r };
  }
  let fly = null;
  function flyTo(pos, target, dur = 1100) {
    if (reduceMotion) dur = 0;
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), dur };
  }
  let currentView = startView;
  function setView(name, animate = true) {
    if (!views[name]) return;
    currentView = name;
    const { pos, target } = viewPos(name);
    if (animate) flyTo(pos, target); else { camera.position.copy(pos); controls.target.copy(target); }
  }
  {
    const { pos, target, r } = viewPos(startView);
    if (!reduceMotion) {
      camera.position.setFromSpherical(new THREE.Spherical(r * 1.6, THREE.MathUtils.degToRad(Math.max(views[startView].polar, 30) + 10), THREE.MathUtils.degToRad(views[startView].az + 40))).add(target);
      controls.target.copy(target);
      flyTo(pos, target, 2200);
    } else { camera.position.copy(pos); controls.target.copy(target); }
  }

  function select(id, { flyCam = true, source = "3d" } = {}) {
    const o = id ? byId[id] : null;
    state.selected = o ? id : null;
    refreshLabels();
    if (o && flyCam) {
      const t = new THREE.Vector3(o.p.c[0], 0, o.p.c[1]);
      const off = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      sph.radius = mobile ? 230 : 175;
      sph.phi = THREE.MathUtils.clamp(sph.phi, 0.05, 1.0);
      // posun cíle: na desktopu doleva od panelu, na mobilu nahoru nad spodní panel
      camera.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).setY(0);
      if (up.lengthSq() < 1e-4) up.set(0, 0, -1); else up.normalize();
      const shift = mobile ? up.multiplyScalar(-sph.radius * 0.2) : right.multiplyScalar(sph.radius * 0.16);
      const tgt = t.clone().add(shift);
      flyTo(new THREE.Vector3().setFromSpherical(sph).add(tgt), tgt, 1000);
    }
    if (!o && id === null && currentView) {
      // po zavření se kamera nevrací, uživatel zůstává, kde je
    }
    onSelect && onSelect(o ? o.p : null, source);
  }

  // ------- interakce -------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointer = null, down = null, interacted = false;
  const meshes = plots.map((o) => o.mesh);
  function pick() {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.id : null;
  }
  const dom = renderer.domElement;
  dom.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = dom.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    ndc.set((pointer.x / r.width) * 2 - 1, -(pointer.y / r.height) * 2 + 1);
    const id = pick();
    if (id !== state.hovered) { state.hovered = id; host.classList.toggle("is-hovering", !!id); }
    onHover && onHover(id ? byId[id].p : null, pointer);
  });
  dom.addEventListener("pointerleave", () => { pointer = null; state.hovered = null; host.classList.remove("is-hovering"); onHover && onHover(null); });
  dom.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
    fly = null;
    if (!interacted) { interacted = true; host.dispatchEvent(new CustomEvent("mp:interact", { bubbles: true })); }
  });
  dom.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) return;
    const r = dom.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const id = pick();
    if (id) select(id); else if (state.selected) select(null);
  });
  controls.addEventListener("start", () => { fly = null; });

  // ------- smyčka -------
  const compass = document.getElementById("compass");
  let running = false, raf = 0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const bound = 2400;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (walk) { stepWalk(dt); renderPlots(); renderer.render(scene, camera); labels.render(scene, camera); return; }
    if (fly) {
      const k = fly.dur ? Math.min(1, (now - fly.start) / fly.dur) : 1;
      camera.position.lerpVectors(fly.p0, fly.p1, ease(k));
      controls.target.lerpVectors(fly.t0, fly.t1, ease(k));
      if (k >= 1) fly = null;
    }
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -bound, bound);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -bound, bound);
    controls.target.y = 0;
    controls.update();
    // mlha podle vzdálenosti kamery: u lokality jemná, v pohledu Okolí daleko
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 0.9; scene.fog.far = dist * 2.6 + 500;
    labels.domElement.classList.toggle("is-far", dist > 1100);
    renderPlots();
    if (compass) compass.style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }
  function renderPlots() {
    for (const o of plots) {
      const t = targetOf(o);
      o.mat.color.lerp(t.color, 0.2);
      o.lift += (t.lift - o.lift) * 0.18;
      o.mesh.position.y = o.lift;
      o.label.position.y = 2.4 + o.lift;
      o.house.position.y = o.lift;
    }
  }

  // ------- procházka ulicemi (kamera ve výšce očí jede po trase) -------
  const U2 = new THREE.Vector2(Math.cos(A), Math.sin(A));
  const P2 = (n) => byId[String(n).padStart(2, "0")];
  const sp = (n) => { const f = P2(n).frame; return f.c.clone().add(f.L.clone().multiplyScalar(f.tmin - 6)); };
  const westOf = (n) => { const o = P2(n); let m = Infinity; for (const [x, z] of o.p.poly) m = Math.min(m, (x - o.p.c[0]) * U2.x + (z - o.p.c[1]) * U2.y); return new THREE.Vector2(...o.p.c).add(U2.clone().multiplyScalar(m - 6)); };
  const onLine = (a, b) => a.clone().add(U2.clone().multiplyScalar(b.clone().sub(a).dot(U2)));
  function walkCurve() {
    const seq = [
      onLine(sp(15), sp(31)),
      ...[15, 14, 13, 12, 11, 10, 9].map(sp),
      onLine(sp(9), westOf(16)),
      onLine(sp(23), westOf(23)),
      ...[23, 24, 25, 26, 27, 28, 29, 30].map(sp),
      onLine(sp(30), sp(34)),
      ...[34, 35, 44, 45].map(sp),
      onLine(sp(43), sp(45)),
      ...[43, 42, 41, 40, 39, 38, 37, 36].map(sp),
      onLine(sp(36), westOf(36)),
    ];
    return new THREE.CatmullRomCurve3(seq.map((v) => new THREE.Vector3(v.x, 1.7, v.y)), false, "centripetal", 0.4);
  }
  let walk = null, walkCurveCache = null;
  const WALK_SPEED = 9; // m/s
  const look = new THREE.Vector3();
  function stepWalk(dt) {
    if (walk.playing) {
      walk.t = Math.min(1, walk.t + (dt * WALK_SPEED) / walk.len);
      if (walk.t >= 1) walk.playing = false;
    }
    const c = walk.curve;
    const p = c.getPointAt(walk.t);
    const a = c.getPointAt(Math.min(1, walk.t + 14 / walk.len));
    camera.position.lerp(p, walk.snap ? 1 : 0.35);
    look.lerp(new THREE.Vector3(a.x, 1.45, a.z), walk.snap ? 1 : 0.08);
    walk.snap = false;
    camera.lookAt(look);
    if (onWalk) onWalk(walk.t, walk.playing);
  }
  function startWalk() {
    walkCurveCache = walkCurveCache || walkCurve();
    fly = null;
    controls.enabled = false;
    camera.near = 0.3; camera.updateProjectionMatrix();
    scene.fog.near = 90; scene.fog.far = 900;
    houseGroup.visible = true;
    walk = { curve: walkCurveCache, len: walkCurveCache.getLength(), t: 0, playing: !reduceMotion, snap: true };
    look.copy(walkCurveCache.getPointAt(0.01));
    if (onWalk) onWalk(0, walk.playing);
  }
  function stopWalk() {
    if (!walk) return;
    walk = null;
    controls.enabled = true;
    camera.near = 5; camera.updateProjectionMatrix();
    setView(currentView === "street" ? "street" : "persp");
  }

  function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }
  start();
  // okolí se dostaví až po prvním snímku, aby se model objevil hned
  setTimeout(() => buildContext(scene, { mobile }), 60);

  new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
  }).observe(host);

  return {
    select: (id, opts) => select(id, opts),
    setFilter(f) { Object.assign(state.filter, f); refreshLabels(); },
    setStatus(map) { state.status = { ...map }; refreshLabels(); },
    setView,
    setHouses(on) { houseGroup.visible = on; },
    startWalk, stopWalk,
    walkPlay(on) { if (walk) { if (on && walk.t >= 1) walk.t = 0; walk.playing = on; } },
    walkSeek(t) { if (walk) { walk.t = THREE.MathUtils.clamp(t, 0, 1); walk.snap = true; } },
    // slunce podle ročního období a místního času; bez parametrů výchozí světlo
    setSun(season, hours) {
      if (!season) { sun.position.set(-170, 260, 210); sun.intensity = 2.0; sun.color.set(0xfff6e4); hemi.intensity = 1.6; return null; }
      const p = sunAt(season, hours);
      const el = Math.max(p.el, 0.02);
      sun.position.set(Math.sin(p.az) * Math.cos(el), Math.sin(el), -Math.cos(p.az) * Math.cos(el)).multiplyScalar(420);
      const k = Math.min(1, el / 0.45);
      sun.intensity = p.el > 0 ? 0.7 + 1.5 * k : 0;
      sun.color.set(0xffb074).lerp(new THREE.Color(0xfff6e4), k);
      hemi.intensity = 1.05 + 0.55 * k;
      return p;
    },
    hover(id) { state.listHover = id; },
    start, stop,
  };
}
