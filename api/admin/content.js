// PUT /api/admin/content – texty a obrázky webu {set:{klíč:hodnota}, hide:{klíč:true|false}, reset:[klíče]}.
import { update } from "../_lib/store.js";
import { json, body, log } from "../_lib/util.js";
import { requireAdmin } from "../_lib/auth.js";

const KEY = /^[a-z0-9][a-z0-9._-]{0,60}$/;

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "PUT") return json(res, 405, { error: "Jen PUT" });
  const b = await body(req).catch(() => ({}));
  const n = { set: 0, hide: 0, reset: 0 };
  const content = await update("content", {}, (c) => {
    for (const [k, v] of Object.entries(b.set || {})) if (KEY.test(k)) { c[k] = String(v).slice(0, 4000); n.set++; }
    for (const k of b.reset || []) if (KEY.test(k)) { delete c[k]; n.reset++; }
    return c;
  });
  const hidden = await update("hidden", {}, (h) => {
    for (const [k, v] of Object.entries(b.hide || {})) if (KEY.test(k)) { h[k] = !!v; n.hide++; }
    return h;
  });
  await log("Obsah webu upraven", `${n.set} změn, ${n.hide} viditelnost, ${n.reset} vráceno`);
  json(res, 200, { ok: true, content, hidden });
}
