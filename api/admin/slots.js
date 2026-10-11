// /api/admin/slots – POST přidání termínů {slots:[{start,dur}]}, DELETE ?id=, PATCH {id,state}.
import { update } from "../_lib/store.js";
import { json, body, query, newId, log } from "../_lib/util.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const b = await body(req).catch(() => ({}));
  if (req.method === "POST") {
    const add = (Array.isArray(b.slots) ? b.slots : []).filter((s) => !Number.isNaN(Date.parse(s.start))).slice(0, 200);
    const slots = await update("slots", [], (all) => {
      const have = new Set(all.map((s) => s.start));
      for (const s of add) if (!have.has(new Date(s.start).toISOString())) all.push({ id: newId(), start: new Date(s.start).toISOString(), dur: Math.min(240, Math.max(15, Number(s.dur) || 30)), leadId: "", state: "volno" });
      return all.sort((a, c) => a.start.localeCompare(c.start));
    });
    await log("Termíny prohlídek přidány", `${add.length}×`);
    return json(res, 200, { ok: true, slots });
  }
  if (req.method === "DELETE") {
    const id = query(req).id || b.id;
    let removed = null;
    const slots = await update("slots", [], (all) => all.filter((s) => (s.id === id ? ((removed = s), false) : true)));
    if (removed?.leadId) await update("leads", [], (l) => l.map((x) => (x.id === removed.leadId ? { ...x, viewing: null, slotId: null } : x)));
    return json(res, 200, { ok: true, slots });
  }
  if (req.method === "PATCH") {
    const slots = await update("slots", [], (all) => all.map((s) => (s.id === b.id ? { ...s, state: b.state || s.state, leadId: b.leadId !== undefined ? b.leadId : s.leadId } : s)));
    return json(res, 200, { ok: true, slots });
  }
  json(res, 405, { error: "Nepodporováno" });
}
