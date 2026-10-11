// PUT /api/admin/plots – změna pozemku {id, status, price, note, reservedUntil, leadId} nebo hromadně {bulk:{status|clearPrices}}.
import { update } from "../_lib/store.js";
import { json, body, plotsMerged, PLOT_IDS, STATUSES, clip, log } from "../_lib/util.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "PUT") return json(res, 405, { error: "Jen PUT" });
  const b = await body(req).catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items : [b];
  const changes = [];
  await update("plots", {}, (all) => {
    for (const it of items) {
      const id = String(it.id || "").padStart(2, "0");
      if (!PLOT_IDS.has(id)) continue;
      const o = { ...(all[id] || {}) };
      if (it.status !== undefined && STATUSES.includes(it.status) && it.status !== (o.status || "volny")) {
        o.status = it.status;
        if (it.status === "rezervace") o.reservedAt = new Date().toISOString();
        if (it.status === "prodano") o.soldAt = new Date().toISOString();
        if (it.status === "volny") { o.leadId = ""; o.reservedAt = ""; o.soldAt = ""; }
      }
      if (it.price !== undefined) o.price = it.price ? Math.max(0, Math.round(Number(it.price))) : null;
      if (it.note !== undefined) o.note = clip(it.note, 500);
      if (it.reservedUntil !== undefined) o.reservedUntil = clip(it.reservedUntil, 10);
      if (it.leadId !== undefined) o.leadId = clip(it.leadId, 20);
      if (o.status !== "rezervace") { o.reservedUntil = o.status === "prodano" ? o.reservedUntil : ""; }
      o.updatedAt = new Date().toISOString();
      all[id] = o;
      changes.push(`${Number(id)}: ${o.status || "volny"}${it.price !== undefined ? `, cena ${o.price || "dle m²"}` : ""}`);
    }
    return all;
  });
  if (changes.length) await log("Pozemky upraveny", changes.join("; "));
  json(res, 200, { ok: true, plots: await plotsMerged() });
}
