// Úložiště: na Vercelu Upstash Redis (REST), lokálně soubor .data/store.json.
// Každá kolekce je jeden JSON dokument (pozemky, poptávky, termíny, obsah…), objemy jsou malé.
import { promises as fs } from "node:fs";
import path from "node:path";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const storeKind = URL_ && TOKEN ? "redis" : process.env.VERCEL ? "none" : "file";
const FILE = path.join(process.cwd(), ".data", "store.json");
const PREFIX = "zk:";

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
let fileCache = null, fileMtime = 0;
async function readFile() {
  // soubor se znovu načte, když se změní na disku (ruční úprava, obnova zálohy)
  const mt = await fs.stat(FILE).then((s) => s.mtimeMs).catch(() => 0);
  if (fileCache && mt === fileMtime) return fileCache;
  try { fileCache = JSON.parse(await fs.readFile(FILE, "utf8")); } catch { fileCache = {}; }
  fileMtime = mt;
  return fileCache;
}
async function writeFile(d) {
  fileCache = d;
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(d, null, 1));
  fileMtime = await fs.stat(FILE).then((s) => s.mtimeMs).catch(() => 0);
}

export function storeReady() { return storeKind !== "none"; }

export async function get(key, fallback) {
  if (storeKind === "redis") { const v = await redis(["GET", PREFIX + key]); return v ? JSON.parse(v) : fallback; }
  if (storeKind === "file") { const d = await readFile(); return d[key] === undefined ? fallback : structuredClone(d[key]); }
  throw new Error("STORE_MISSING");
}
export async function set(key, value) {
  if (storeKind === "redis") return redis(["SET", PREFIX + key, JSON.stringify(value)]);
  if (storeKind === "file") { const d = await readFile(); d[key] = value; return writeFile(d); }
  throw new Error("STORE_MISSING");
}
// úprava dokumentu: načíst, změnit, uložit
export async function update(key, fallback, fn) {
  const cur = await get(key, fallback);
  const next = (await fn(cur)) ?? cur;
  await set(key, next);
  return next;
}

// jednoduché omezení počtu pokusů (formulář, přihlášení)
const mem = new Map();
export async function hit(key, ttlSec) {
  if (storeKind === "redis") {
    const n = await redis(["INCR", PREFIX + "rl:" + key]);
    if (n === 1) await redis(["EXPIRE", PREFIX + "rl:" + key, ttlSec]);
    return n;
  }
  const now = Date.now(), e = mem.get(key);
  if (!e || e.until < now) { mem.set(key, { n: 1, until: now + ttlSec * 1000 }); return 1; }
  e.n += 1;
  return e.n;
}
