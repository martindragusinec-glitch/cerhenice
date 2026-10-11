// /api/admin/login – GET stav přihlášení, POST přihlášení heslem, DELETE odhlášení.
import { hit, storeKind } from "../_lib/store.js";
import { json, body, ip } from "../_lib/util.js";
import { isAdmin, passwordOk, passwordConfigured, sessionCookie, clearCookie } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method === "GET") return json(res, 200, { authed: isAdmin(req), configured: passwordConfigured(), store: storeKind }, { "Cache-Control": "no-store" });
  if (req.method === "DELETE") return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
  if (req.method !== "POST") return json(res, 405, { error: "Nepodporováno" });
  if (!passwordConfigured()) return json(res, 503, { error: "Heslo není nastavené (proměnná ADMIN_PASSWORD)." });
  if ((await hit("login:" + ip(req), 900)) > 8) return json(res, 429, { error: "Příliš mnoho pokusů. Zkuste to za 15 minut." });
  const b = await body(req).catch(() => ({}));
  if (!passwordOk(b.password)) return json(res, 401, { error: "Špatné heslo" });
  json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie() });
}
