// Ilustrační typy domů podle pravidel zástavby (max 2 NP, sedlová střecha 40–50°, max 20 % pozemku).
// Lokální souřadnice domu: osa X = délka hlavní hmoty (hřeben), osa Z = hloubka, +Z = strana do ulice (vstup).
import * as THREE from "three";

export const TYPES = {
  bungalov: { name: "Bungalov", short: "1 podlaží", L: 16, D: 10, wall: 3.0, pitch: 40, attic: false, floors: 1, usable: 125, rooms: "4+kk", note: "Vše na jednom podlaží, nižší střecha." },
  podkrovi: { name: "Dům s podkrovím", short: "přízemí a podkroví", L: 12, D: 9, wall: 3.5, pitch: 45, attic: true, floors: 1, usable: 150, rooms: "5+kk", note: "Klasický tvar, ložnice v podkroví." },
  patrovy: { name: "Patrový dům", short: "2 plná podlaží", L: 11, D: 9, wall: 6.1, pitch: 40, attic: false, floors: 2, usable: 165, rooms: "5+kk", note: "Nejmenší zastavěná plocha, nejvíc zahrady." },
  ldum: { name: "Dům s garáží do L", short: "podkroví a garáž", L: 12, D: 9, wall: 3.5, pitch: 45, attic: true, floors: 1, usable: 150, rooms: "5+kk a garáž", note: "Garážové křídlo uzavírá dvůr u vstupu.", wing: { W: 6.5, Len: 7 } },
};

const MAT = {
  wall: new THREE.MeshLambertMaterial({ color: 0xfbfbf6 }),
  roof: new THREE.MeshLambertMaterial({ color: 0xb8644a }),
  glass: new THREE.MeshLambertMaterial({ color: 0x2e3a36 }),
  frame: new THREE.MeshLambertMaterial({ color: 0x3d4a42 }),
  wood: new THREE.MeshLambertMaterial({ color: 0xb98d62 }),
  plinth: new THREE.MeshLambertMaterial({ color: 0xd9dcd2 }),
  door: new THREE.MeshLambertMaterial({ color: 0x5b4636 }),
};
const rad = (d) => (d * Math.PI) / 180;

// hmota se štíty: hřeben souběžně s X, délka L, hloubka D, stěna "wall", sklon "pitch"
function gableMass(L, D, wall, pitch, y0) {
  const g = new THREE.Group();
  const rise = (D / 2) * Math.tan(rad(pitch));
  const s = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(D / 2, wall), new THREE.Vector2(0, wall + rise), new THREE.Vector2(-D / 2, wall)]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  geo.rotateY(Math.PI / 2);
  const body = new THREE.Mesh(geo, MAT.wall);
  body.position.y = y0;
  g.add(body);
  const ang = Math.atan2(rise, D / 2), ov = 0.55, th = 0.26;
  const len = Math.hypot(D / 2, rise) + ov;
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(L + 0.8, th, len), MAT.roof);
    slab.rotation.x = side * ang;
    // střed desky: od hřebene po spádu o polovinu délky, nadzvednutý o polovinu tloušťky
    const z = side * (Math.cos(ang) * len / 2 + Math.sin(ang) * th / 2);
    const y = y0 + wall + rise - Math.sin(ang) * len / 2 + Math.cos(ang) * th / 2;
    slab.position.set(0, y, z);
    g.add(slab);
  }
  return { group: g, rise, ang };
}

function win(x, y, z, w, h, rotY) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.08), MAT.frame));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.11), MAT.glass));
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

export function buildHouse(key, { ridgeAlongStreet = true, garageRight = true } = {}) {
  const t = TYPES[key];
  const y0 = 0.4;
  const house = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(t.L + 0.3, y0, t.D + 0.3), MAT.plinth);
  plinth.position.y = y0 / 2;
  house.add(plinth);
  const { group, rise, ang } = gableMass(t.L, t.D, t.wall, t.pitch, y0);
  house.add(group);

  // okna na dlouhých fasádách (+Z vstup, -Z zahrada)
  const n = Math.max(2, Math.floor(t.L / 3.2));
  for (const side of [1, -1]) {
    const z = side * (t.D / 2 + 0.05);
    for (let f = 0; f < t.floors; f++) {
      for (let i = 0; i < n; i++) {
        const x = -t.L / 2 + (t.L / n) * (i + 0.5);
        if (side > 0 && f === 0 && i === Math.floor(n / 2)) {
          const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.25, 0.12), MAT.door);
          d.position.set(x, y0 + 1.13, z);
          house.add(d);
          continue;
        }
        const big = side < 0 && f === 0 && (i === 0 || i === n - 1);
        const y = big ? y0 + 1.25 : y0 + 1.75 + f * 2.95;
        house.add(win(x, y, z, big ? 2.3 : 1.3, big ? 2.25 : 1.35, side > 0 ? 0 : Math.PI));
      }
    }
  }
  // okna ve štítech
  for (const sx of [-1, 1]) {
    house.add(win(sx * (t.L / 2 + 0.05), y0 + 1.75, 0, 1.25, 1.35, sx * Math.PI / 2));
    if (t.attic || t.floors === 2) house.add(win(sx * (t.L / 2 + 0.05), y0 + t.wall + Math.min(1.5, rise * 0.32), 0, 1.05, 1.2, sx * Math.PI / 2));
  }
  // střešní okna
  if (t.attic) {
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 1.3), MAT.glass);
      w.rotation.x = side * ang;
      w.position.set(-t.L / 2 + (t.L / 3) * (i + 0.5), y0 + t.wall + rise / 2 + 0.22, side * (t.D / 4));
      house.add(w);
    }
  }
  // komín
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.7, 0.6), MAT.wall);
  ch.position.set(t.L * 0.22, y0 + t.wall + rise * 0.76 + 0.45, -t.D * 0.12);
  house.add(ch);
  // terasa do zahrady
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(Math.min(8, t.L * 0.6), 0.22, 3.6), MAT.wood);
  terrace.position.set(-t.L * 0.12, 0.11, -(t.D / 2 + 1.8));
  house.add(terrace);

  let footprint = t.L * t.D;
  let front = t.D / 2;
  // garážové křídlo směrem k ulici
  if (t.wing) {
    const { W, Len } = t.wing;
    const wm = gableMass(Len, W, 2.9, t.pitch, 0.25).group;
    wm.rotation.y = Math.PI / 2;
    const sx = garageRight ? 1 : -1;
    const wx = sx * (t.L / 2 - W / 2);
    wm.position.set(wx, 0, t.D / 2 + Len / 2);
    house.add(wm);
    const gate = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.2, 0.12), MAT.frame);
    gate.position.set(wx, 1.35, t.D / 2 + Len + 0.06);
    house.add(gate);
    footprint += W * Len;
    front += Len;
  }
  house.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // natočení: štítem do ulice = lokální +X míří k ulici
  const root = new THREE.Group();
  root.add(house);
  let across = t.L, frontExt = front, backExt = t.D / 2 + 3.6;
  if (!ridgeAlongStreet && !t.wing) {
    house.rotation.y = -Math.PI / 2;
    across = t.D; frontExt = t.L / 2; backExt = t.L / 2 + 0.5;
  }
  return { group: root, footprint, ridge: y0 + t.wall + rise, across, front: frontExt, back: backExt, type: t };
}
