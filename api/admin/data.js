// GET /api/admin/data – vše pro administraci najednou.
import { get, storeKind, storeReady } from "../_lib/store.js";
import { json, settings, plotsMerged } from "../_lib/util.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!storeReady()) return json(res, 200, { store: storeKind, ready: false });
  json(res, 200, {
    store: storeKind, ready: true,
    plots: await plotsMerged(),
    leads: await get("leads", []),
    slots: await get("slots", []),
    settings: await settings(),
    content: await get("content", {}),
    hidden: await get("hidden", {}),
    log: (await get("log", [])).slice(0, 60),
  }, { "Cache-Control": "no-store" });
}
