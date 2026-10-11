// POST /api/admin/upload – nahrání obrázku {name, type, data(base64)}; lokálně do /uploads, na Vercelu do Vercel Blob.
import { promises as fs } from "node:fs";
import path from "node:path";
import { json, body, newId } from "../_lib/util.js";
import { requireAdmin } from "../_lib/auth.js";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "Jen POST" });
  const b = await body(req).catch(() => ({}));
  const ext = TYPES[b.type];
  if (!ext || !b.data) return json(res, 400, { error: "Podporované jsou JPG, PNG, WebP a SVG." });
  const buf = Buffer.from(b.data, "base64");
  if (buf.length > 4 * 1024 * 1024) return json(res, 413, { error: "Obrázek je větší než 4 MB." });
  const name = `${newId()}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const r = await fetch(`https://blob.vercel-storage.com/uploads/${name}`, { method: "PUT", body: buf, headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`, "x-api-version": "7", "x-content-type": b.type } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) return json(res, 502, { error: "Nahrání do Vercel Blob selhalo." });
    return json(res, 200, { ok: true, url: j.url });
  }
  if (process.env.VERCEL) return json(res, 503, { error: "Pro nahrávání obrázků připojte ve Vercelu úložiště Blob." });
  const dir = path.join(process.cwd(), "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buf);
  json(res, 200, { ok: true, url: `/uploads/${name}` });
}
