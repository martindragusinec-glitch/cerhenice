// Okolí lokality ve 3D: budovy, ulice, železnice, pole, lesy a voda z OpenStreetMap (assets/data/context3d.js).
// Vše se slučuje do pár geometrií, aby model zůstal rychlý i na mobilu.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { CONTEXT } from "../data/context3d.js";

const pairs = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
function shape(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
}
function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
function flatGeo(pts, y, color) {
  const g = new THREE.ShapeGeometry(shape(pts));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  g.deleteAttribute("uv");
  return paint(g, color);
}
// pás silnice podél lomené čáry (normály nahoru)
function ribbon(pts, w, y) {
  const pos = [], idx = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    pos.push(pts[i][0] + (nx * w) / 2, y, pts[i][1] + (nz * w) / 2, pts[i][0] - (nx * w) / 2, y, pts[i][1] - (nz * w) / 2);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}
function pointIn([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function buildContext(scene, { mobile = false } = {}) {
  const group = new THREE.Group();
  group.name = "okoli";
  const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

  // pole, louky, zahrady obce, lesy, voda
  const fields = ["#e2e3cb", "#d6ddc3", "#e5e4cf", "#d1d9bd", "#dcdfc7", "#cfd8bb", "#e0e2c9"];
  const flats = [];
  CONTEXT.farm.forEach((a, i) => flats.push(flatGeo(pairs(a), -0.2, fields[i % fields.length])));
  CONTEXT.resi.forEach((a) => flats.push(flatGeo(pairs(a), -0.16, "#e9ebe2")));
  CONTEXT.wood.forEach((a) => flats.push(flatGeo(pairs(a), -0.12, "#a9c08f")));
  CONTEXT.water.forEach((a) => flats.push(flatGeo(pairs(a), -0.08, "#bcd3cc")));
  if (flats.length) group.add(new THREE.Mesh(mergeGeometries(flats), flatMat));

  // silnice a železnice
  const roadGeos = [];
  const add = (list, w, y, color) => list.forEach((a) => roadGeos.push(paint(ribbon(pairs(a), w, y), color)));
  add(CONTEXT.track, 2.6, 0.02, "#e2e0d2");
  add(CONTEXT.minor, 5, 0.06, "#f6f6f1");
  add(CONTEXT.major, 7, 0.1, "#cfd3c8");
  add(CONTEXT.rail, 3.2, 0.12, "#9aa197");
  if (roadGeos.length) group.add(new THREE.Mesh(mergeGeometries(roadGeos), new THREE.MeshLambertMaterial({ vertexColors: true })));

  // budovy: bílé makety jako ve vizualizacích
  const bGeos = [];
  for (const b of CONTEXT.b) {
    const pts = pairs(b.p);
    if (pts.length < 3) continue;
    const g = new THREE.ExtrudeGeometry(shape(pts), { depth: b.h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute("uv");
    bGeos.push(g);
  }
  if (bGeos.length) {
    const houses = new THREE.Mesh(mergeGeometries(bGeos), new THREE.MeshLambertMaterial({ color: 0xf4f4ee }));
    group.add(houses);
  }

  // stromy v lesích a sadech
  const trees = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const budget = mobile ? 350 : 900;
  const woods = CONTEXT.wood.map(pairs);
  const areas = woods.map((w) => Math.abs(w.reduce((s, p, i) => { const q = w[(i + 1) % w.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2));
  const total = areas.reduce((a, b) => a + b, 0) || 1;
  woods.forEach((w, i) => {
    const n = Math.round((areas[i] / total) * budget);
    const xs = w.map((p) => p[0]), zs = w.map((p) => p[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    for (let k = 0, t = 0; k < n && t < n * 8; t++) {
      const p = [x0 + (x1 - x0) * rnd(), z0 + (z1 - z0) * rnd()];
      if (pointIn(p, w)) { trees.push([p[0], p[1], 2.6 + rnd() * 2.2]); k++; }
    }
  });
  if (trees.length) {
    const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const tones = [0x7ea866, 0x8db275, 0x6f9a5a];
    trees.forEach(([x, z, r], i) => { p.set(x, r * 1.1, z); s.set(r, r * 1.25, r); m4.compose(p, q, s); inst.setMatrixAt(i, m4); inst.setColorAt(i, c.set(tones[i % 3])); });
    inst.raycast = () => {};
    group.add(inst);
  }

  // popisky míst
  for (const l of CONTEXT.labels) {
    const el = document.createElement("div");
    el.className = "ctx-label";
    el.textContent = l.t;
    const o = new CSS2DObject(el);
    o.position.set(l.x, 14, l.z);
    group.add(o);
  }

  group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; if (o.isMesh) o.raycast = () => {}; });
  scene.add(group);
  return group;
}

// body pro pohled „Okolí“ (lokalita + popisky obce)
export const CONTEXT_FOCUS = CONTEXT.labels.map((l) => [l.x, l.z]);
