// /api/admin/leads – PATCH změna stavu / poznámka, DELETE smazání (GDPR), GET ?format=csv export.
import { get, set, update } from "../_lib/store.js";
import { json, body, query, clip, LEAD_STATES, log } from "../_lib/util.js";
import { requireAdmin } from "../_lib/auth.js";

const STATE_TXT = { nova: "Nová", kontaktovano: "Kontaktováno", prohlidka: "Prohlídka", rezervace: "Rezervace", prodano: "Prodáno", ztraceno: "Ztraceno" };
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method === "GET") {
    const leads = await get("leads", []);
    const head = ["Datum", "Stav", "Jméno", "Telefon", "E-mail", "Pozemky", "Prohlídka", "Zpráva", "Zdroj", "Médium", "Kampaň", "Stránka", "Poznámky"];
    const rows = leads.map((l) => [new Date(l.createdAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }), l.state, l.name, l.phone, l.email, l.plots.map(Number).join(" "), l.viewing ? new Date(l.viewing).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : l.when, l.message, l.utm?.source || l.referrer, l.utm?.medium, l.utm?.campaign, l.page, (l.notes || []).map((n) => n.text).join(" | ")]);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="poptavky-za-kaplickou-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.end("﻿" + [head, ...rows].map((r) => r.map(esc).join(";")).join("\n"));
  }
  const b = await body(req).catch(() => ({}));
  const q = query(req);
  if (req.method === "DELETE") {
    const id = q.id || b.id;
    const leads = await get("leads", []);
    const l = leads.find((x) => x.id === id);
    await set("leads", leads.filter((x) => x.id !== id));
    await update("slots", [], (s) => s.map((x) => (x.leadId === id ? { ...x, leadId: "", state: "volno" } : x)));
    await log("Poptávka smazána", l ? l.name : id);
    return json(res, 200, { ok: true });
  }
  if (req.method !== "PATCH") return json(res, 405, { error: "Nepodporováno" });
  let changed = null;
  const leads = await update("leads", [], (all) => all.map((l) => {
    if (l.id !== b.id) return l;
    const n = { ...l, notes: [...(l.notes || [])] };
    if (b.state && LEAD_STATES.includes(b.state) && b.state !== l.state) { n.state = b.state; n.notes.unshift({ t: new Date().toISOString(), text: `Stav: ${STATE_TXT[b.state]}`, auto: true }); if (!l.firstContactAt && b.state !== "nova") n.firstContactAt = new Date().toISOString(); }
    if (b.note) n.notes.unshift({ t: new Date().toISOString(), text: clip(b.note, 1000) });
    if (b.value !== undefined) n.value = Math.max(0, Number(b.value) || 0);
    changed = n;
    return n;
  }));
  if (!changed) return json(res, 404, { error: "Poptávka nenalezena" });
  if (b.state) await log("Poptávka", `${changed.name}: ${STATE_TXT[b.state]}`);
  json(res, 200, { ok: true, lead: changed, leads });
}
