// Fotomontáž: zástavba podle koordinační situace APRIS vyrenderovaná z pohledu kamery dronu (průhledné pozadí).
// Parcely, ulice a prostranství = assets/data/parcels.js, domy = assets/js/houses.js (stejné typy jako konfigurátor).
// window.setT(t) překreslí průběh výstavby 0–1 a vrátí PNG (data URL) pro video proměny.
import * as THREE from "three";
import { SITE, PUBLIC, PARCELS } from "../../assets/data/parcels.js";
import { buildHouse } from "../../assets/js/houses.js";

const Q = new URLSearchParams(location.search);
const W = Number(Q.get("w") || 2736), H = Number(Q.get("h") || 1824);
const S = await fetch("scene.json").then((r) => r.json());
const CAM = S.cams[Q.get("cam") || "p9"];

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const smooth = (t, a, b) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAM.vfov, W / H, 1, 4000);
camera.position.set(...CAM.pos);
camera.up.set(...CAM.up);
camera.lookAt(CAM.pos[0] + CAM.fwd[0] * 100, CAM.pos[1] + CAM.fwd[1] * 100, CAM.pos[2] + CAM.fwd[2] * 100);

scene.add(new THREE.HemisphereLight(0xe6edf5, 0x77715c, 1.45));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.35);
const sd = new THREE.Vector3(...S.sun).normalize();
sun.position.copy(sd.clone().multiplyScalar(500));
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -240, right: 240, top: 240, bottom: -240, near: 100, far: 1100 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);

// ---------- textury ----------
function noiseTex(base, spread, stripes = 0) {
  const N = 512, cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const g = cv.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * spread, y = Math.floor(i / 4 / N);
    const s = stripes ? (Math.floor(y / (N / stripes)) % 2 ? 6 : -6) : 0;
    d[i] += n + s; d[i + 1] += n + s; d[i + 2] += n * 0.8 + s;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
const lawnTex = noiseTex("#86995c", 16, 6); lawnTex.repeat.set(1 / 9, 1 / 9);
const parkTex = noiseTex("#748c52", 22); parkTex.repeat.set(1 / 8, 1 / 8);
const asphaltTex = noiseTex("#7e817e", 12); asphaltTex.repeat.set(1 / 6, 1 / 6);

// ---------- geometrie ----------
const A = THREE.MathUtils.degToRad(SITE.angle);
const VS = new THREE.Vector2(-Math.sin(A), Math.cos(A)); // napříč ulicemi, k jihu
function shapeFrom(poly, inset = 0, c = null) {
  const s = new THREE.Shape();
  poly.forEach(([x, z], i) => {
    let px = x, pz = z;
    if (inset && c) { const dx = c[0] - x, dz = c[1] - z, l = Math.hypot(dx, dz); if (l) { px += (dx / l) * inset; pz += (dz / l) * inset; } }
    i ? s.lineTo(px, -pz) : s.moveTo(px, -pz);
  });
  s.closePath();
  return s;
}
const flatShape = (shape, y) => { const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g; };
function frameOf(p) {
  const c = new THREE.Vector2(p.c[0], p.c[1]);
  const pts = p.poly.map(([x, z]) => new THREE.Vector2(x, z));
  let L = null, best = 0;
  for (let i = 0; i < pts.length; i++) { const e = pts[(i + 1) % pts.length].clone().sub(pts[i]); if (e.length() > best) { best = e.length(); L = e.clone().normalize(); } }
  const back = p.front === "N" ? VS.clone() : p.front === "S" ? VS.clone().negate() : new THREE.Vector2(-1, 0);
  if (L.dot(back) < 0) L.negate();
  const Wv = new THREE.Vector2(-L.y, L.x);
  let tmin = Infinity, tmax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (const q of pts) { const d = q.clone().sub(c); tmin = Math.min(tmin, d.dot(L)); tmax = Math.max(tmax, d.dot(L)); wmin = Math.min(wmin, d.dot(Wv)); wmax = Math.max(wmax, d.dot(Wv)); }
  return { c, L, W: Wv, tmin, tmax, wmin, wmax, pts };
}
function pointInPoly([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const zs = SITE.outline.map((p) => p[1]), zmin = Math.min(...zs), zmax = Math.max(...zs);
const order = (z) => (z - zmin) / (zmax - zmin); // od severu (daleko) k jihu (blízko)

const fades = []; // [material, a, b, extra]
const grows = []; // [object, start, len, axis]
function fadeMat(color, a, b, map = null) {
  const m = new THREE.MeshLambertMaterial({ color, map, transparent: true, opacity: 0 });
  fades.push([m, a, b]);
  return m;
}

// ulice: celá plocha lokality (pod parcelami) jako asfalt
const street = new THREE.Mesh(flatShape(shapeFrom(SITE.outline), 0.03), fadeMat(0xffffff, 0.02, 0.2, asphaltTex));
street.receiveShadow = true; scene.add(street);

// obrys parcel ze studie (na začátku videa „zakreslení“)
const linePts = [];
for (const p of PARCELS) p.poly.forEach((a, i) => { const b = p.poly[(i + 1) % p.poly.length]; linePts.push(a[0], 0.3, a[1], b[0], 0.3, b[1]); });
SITE.outline.forEach((a, i) => { const b = SITE.outline[(i + 1) % SITE.outline.length]; linePts.push(a[0], 0.3, a[1], b[0], 0.3, b[1]); });
const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePts, 3));
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
scene.add(new THREE.LineSegments(lineGeo, lineMat));

// veřejná prostranství
for (const pub of PUBLIC) {
  const c = pub.poly.reduce((a, [x, z]) => [a[0] + x / pub.poly.length, a[1] + z / pub.poly.length], [0, 0]);
  const m = new THREE.Mesh(flatShape(shapeFrom(pub.poly, 0.6, c), 0.09), fadeMat(0xffffff, 0.2, 0.4, parkTex));
  m.receiveShadow = true; scene.add(m);
}

const WALLS = [0xf4f2eb, 0xece9e0, 0xf7f6f1, 0xe1ded5, 0xeae4d7, 0xf0eee8];
const ROOFS = [0x3a3d40, 0x45484a, 0x34373a, 0x9a4f38, 0x7a4636, 0x3f4245, 0x8b4a35];
const TYPES = ["podkrovi", "podkrovi", "bungalov", "patrovy", "ldum", "podkrovi", "bungalov", "ldum"];
const trees = [];

for (const p of PARCELS) {
  const f = frameOf(p), k = order(p.c[1]);
  // trávník
  const tint = new THREE.Color(0xffffff).offsetHSL(rr(-0.02, 0.02), rr(-0.08, 0.04), rr(-0.05, 0.03));
  const lawn = new THREE.Mesh(flatShape(shapeFrom(p.poly, 0.35, p.c), 0.1), fadeMat(tint, 0.16 + 0.22 * k, 0.26 + 0.22 * k, lawnTex));
  lawn.receiveShadow = true; scene.add(lawn);
  // hrana do ulice
  let fi = 0, fs = Infinity;
  for (let i = 0; i < f.pts.length; i++) { const m = f.pts[i].clone().add(f.pts[(i + 1) % f.pts.length]).multiplyScalar(0.5); const s = m.clone().sub(f.c).dot(f.L); if (s < fs) { fs = s; fi = i; } }
  const fa = f.pts[fi], fb = f.pts[(fi + 1) % f.pts.length];
  // chodník podél hrany do ulice
  const out = f.L.clone().negate();
  const sw = new THREE.Shape([fa, fb, fb.clone().add(out.clone().multiplyScalar(2.2)), fa.clone().add(out.clone().multiplyScalar(2.2))].map((v) => new THREE.Vector2(v.x, -v.y)));
  const swm = new THREE.Mesh(flatShape(sw, 0.07), fadeMat(0xd2cfc6, 0.1 + 0.2 * k, 0.2 + 0.2 * k));
  swm.receiveShadow = true; scene.add(swm);
  // ploty: vzadu a místy po bocích živý plot, jinak nízký světlý plot
  const hedgeMat = fadeMat(0x5f7448, 0.2 + 0.22 * k, 0.3 + 0.22 * k), fenceMat = fadeMat(0xa7a99f, 0.2 + 0.22 * k, 0.3 + 0.22 * k);
  let bi = 0, bs = -Infinity;
  for (let i = 0; i < f.pts.length; i++) { const m = f.pts[i].clone().add(f.pts[(i + 1) % f.pts.length]).multiplyScalar(0.5); const s = m.clone().sub(f.c).dot(f.L); if (s > bs) { bs = s; bi = i; } }
  for (let i = 0; i < f.pts.length; i++) {
    if (i === fi) continue;
    const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length], len = a.distanceTo(b);
    if (len < 3) continue;
    const hedgy = i === bi ? rnd() > 0.25 : rnd() > 0.6;
    const mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
    const inward = f.c.clone().sub(mid).normalize().multiplyScalar(hedgy ? 0.5 : 0.15);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(len - 1, hedgy ? 1.0 : 1.2, hedgy ? 0.55 : 0.06), hedgy ? hedgeMat : fenceMat);
    hedge.position.set(mid.x + inward.x, hedgy ? 0.6 : 0.7, mid.y + inward.y);
    hedge.rotation.y = -Math.atan2(dir.y, dir.x);
    hedge.castShadow = hedge.receiveShadow = true; scene.add(hedge);
  }
  // dům: typ a barvy podle náhody se semínkem, hřeben souběžně s ulicí, 6,5 m od ulice
  const widthAvail = f.wmax - f.wmin;
  let type = pick(TYPES);
  let h = buildHouse(type, { ridgeAlongStreet: true, garageRight: rnd() > 0.5 });
  if (h.across > widthAvail - 6) { type = "patrovy"; h = buildHouse(type, { ridgeAlongStreet: true }); }
  const wall = new THREE.MeshLambertMaterial({ color: pick(WALLS) }), roof = new THREE.MeshLambertMaterial({ color: pick(ROOFS) });
  h.group.traverse((o) => {
    if (!o.isMesh) return;
    const c = o.material.color.getHex();
    if (c === 0xfbfbf6) o.material = wall; else if (c === 0xb8644a) o.material = roof;
  });
  const wOff = (f.wmin + f.wmax) / 2 + rr(-1.2, 1.2);
  const hc = f.c.clone().add(f.L.clone().multiplyScalar(f.tmin + 6.5 + h.front)).add(f.W.clone().multiplyScalar(wOff));
  h.group.position.set(hc.x, 0.1, hc.y);
  h.group.rotation.y = Math.atan2(-f.L.x, -f.L.y);
  scene.add(h.group);
  grows.push([h.group, 0.3 + 0.42 * k, 0.13, "y"]);
  // příjezd k domu
  const side = rnd() > 0.5 ? 1 : -1, dW = wOff + side * (h.across / 2 - 1.8);
  const d0 = f.c.clone().add(f.L.clone().multiplyScalar(f.tmin)).add(f.W.clone().multiplyScalar(dW));
  const dv = f.W.clone().multiplyScalar(1.7), dl = f.L.clone().multiplyScalar(6.6);
  const drive = new THREE.Shape([d0.clone().sub(dv), d0.clone().add(dv), d0.clone().add(dv).add(dl), d0.clone().sub(dv).add(dl)].map((v) => new THREE.Vector2(v.x, -v.y)));
  const dm = new THREE.Mesh(flatShape(drive, 0.13), fadeMat(0xb4b1a7, 0.3 + 0.42 * k, 0.4 + 0.42 * k));
  dm.receiveShadow = true; scene.add(dm);
  if (rnd() > 0.45) {
    const car = new THREE.Group(), col = pick([0x2b2f33, 0xd9dbd8, 0x8d9296, 0x3d4f66, 0x6b2a26, 0xeeeeea]);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.4), new THREE.MeshLambertMaterial({ color: col }));
    body.position.y = 0.55;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.3), new THREE.MeshLambertMaterial({ color: 0x2a3034 }));
    cab.position.set(0, 1.2, -0.2);
    car.add(body, cab); car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const cp = d0.clone().add(f.L.clone().multiplyScalar(3.4));
    car.position.set(cp.x, 0.13, cp.y); car.rotation.y = Math.atan2(f.L.x, f.L.y);
    scene.add(car); grows.push([car, 0.5 + 0.42 * k, 0.08, "all"]);
  }
  // stromy: jeden do ulice, jeden až dva v zahradě
  const st = fa.clone().add(fb).multiplyScalar(0.5).add(out.clone().multiplyScalar(1.1));
  trees.push([st.x, st.y, rr(1.5, 2.1), k]);
  for (let n = rnd() > 0.4 ? 2 : 1; n > 0; n--) {
    const t = f.c.clone().add(f.L.clone().multiplyScalar(f.tmax - rr(4, 9))).add(f.W.clone().multiplyScalar(rr(f.wmin + 3, f.wmax - 3)));
    trees.push([t.x, t.y, rr(1.7, 2.6), k]);
  }
}
for (const pub of PUBLIC) {
  const xs = pub.poly.map((q) => q[0]), zz = pub.poly.map((q) => q[1]);
  const n = pub.area > 1000 ? 16 : 5;
  for (let k = 0, tries = 0; k < n && tries < 500; tries++) {
    const pt = [rr(Math.min(...xs) + 4, Math.max(...xs) - 4), rr(Math.min(...zz) + 4, Math.max(...zz) - 4)];
    if (pointInPoly(pt, pub.poly)) { trees.push([pt[0], pt[1], rr(2.2, 3.4), order(pt[1])]); k++; }
  }
}
const CROWNS = [0x7f8f4a, 0x96974c, 0xa8964a, 0x6e8645, 0xb39a55, 0x88914c];
const crownGeo = new THREE.IcosahedronGeometry(1, 1), trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4f3e });
for (const [x, z, r, k] of trees) {
  const g = new THREE.Group();
  const hgt = r * 1.35, mat = new THREE.MeshLambertMaterial({ color: pick(CROWNS), flatShading: true });
  for (let n = 0; n < 2; n++) {
    const crown = new THREE.Mesh(crownGeo, mat);
    crown.position.set(rr(-0.35, 0.35) * r, hgt + r * (0.55 + n * 0.45), rr(-0.35, 0.35) * r);
    crown.scale.set(r * rr(0.75, 0.95), r * rr(0.8, 1.0), r * rr(0.75, 0.95));
    crown.rotation.y = rr(0, 3); crown.castShadow = true; g.add(crown);
  }
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = hgt / 2; trunk.scale.y = hgt; trunk.castShadow = true;
  g.add(trunk); g.position.set(x, 0.1, z);
  scene.add(g);
  grows.push([g, 0.58 + 0.3 * k, 0.12, "all"]);
}

// ---------- průběh výstavby ----------
function apply(t) {
  lineMat.opacity = 0.9 * smooth(t, 0, 0.06) * (1 - smooth(t, 0.3, 0.45));
  for (const [m, a, b] of fades) m.opacity = smooth(t, a, b), m.visible = m.opacity > 0.002;
  for (const [o, a, len, axis] of grows) {
    const s = easeOut(smooth(t, a, a + len));
    o.visible = s > 0.002;
    if (axis === "y") o.scale.set(1, Math.max(s, 0.001), 1); else o.scale.setScalar(Math.max(s, 0.001));
  }
}
window.setT = (t) => { apply(t); renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); };
apply(Number(Q.get("t") ?? 1));
renderer.render(scene, camera);
window.__ready = true;
