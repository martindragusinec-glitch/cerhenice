// Společné funkce API: odpovědi, tělo požadavku, výchozí data, záznam změn, upozornění e-mailem.
import crypto from "node:crypto";
import { PARCELS } from "../../assets/data/parcels.js";
import { get, update } from "./store.js";

export const PLOT_IDS = new Set(PARCELS.map((p) => p.id));
export const PARCEL = Object.fromEntries(PARCELS.map((p) => [p.id, p]));
export const STATUSES = ["volny", "rezervace", "prodano"];
export const LEAD_STATES = ["nova", "kontaktovano", "prohlidka", "rezervace", "prodano", "ztraceno"];

export const DEFAULT_SETTINGS = {
  phone: "+420 123 456 789",
  email: "prodej@zakaplickou.cz",
  contactName: "Prodej pozemků Za Kapličkou",
  pricePerM2: null,
  showPrices: true,
  promo: { on: false, text: "", link: "#pozemky" },
  gtmId: "",
  metaPixelId: "",
  seo: { title: "", description: "" },
  reserveDays: 14,
};

export function json(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}
export async function body(req) {
  if (req.body !== undefined && req.body !== "") return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  let s = "";
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}
export const query = (req) => req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
export const ip = (req) => String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
export const clip = (v, n) => String(v ?? "").trim().slice(0, n);

export async function settings() { return { ...DEFAULT_SETTINGS, ...(await get("settings", {})) }; }

// pozemky: uložené změny nad daty z koordinační situace
export async function plotsMerged() {
  const st = await get("plots", {});
  const s = await settings();
  return PARCELS.map((p) => {
    const o = st[p.id] || {};
    const price = o.price || (s.pricePerM2 ? Math.round((p.area * s.pricePerM2) / 1000) * 1000 : null);
    return { id: p.id, area: p.area, etapa: p.etapa, w: p.w, d: p.d, row: p.row, status: o.status || "volny", price, priceOwn: !!o.price, note: o.note || "", reservedUntil: o.reservedUntil || "", leadId: o.leadId || "", reservedAt: o.reservedAt || "", soldAt: o.soldAt || "", updatedAt: o.updatedAt || "" };
  });
}

export async function log(what, detail = "") {
  await update("log", [], (l) => [{ t: new Date().toISOString(), what, detail }, ...l].slice(0, 300));
}

// e-mail o nové poptávce přes Resend (jen když je nastavený klíč)
export async function notifyLead(lead) {
  const key = process.env.RESEND_API_KEY, to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return false;
  const lines = [
    `Jméno: ${lead.name}`, `Telefon: ${lead.phone}`, `E-mail: ${lead.email || "-"}`,
    `Pozemek: ${lead.plots.length ? lead.plots.map((x) => Number(x)).join(", ") : "-"}`,
    `Prohlídka: ${lead.viewing ? new Date(lead.viewing).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : lead.when || "-"}`,
    `Zpráva: ${lead.message || "-"}`, `Zdroj: ${lead.utm?.source || lead.referrer || "přímo"} / ${lead.page}`,
  ];
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM || "Za Kapličkou <onboarding@resend.dev>", to: to.split(","), subject: `Nová poptávka: ${lead.name}${lead.plots[0] ? `, pozemek ${Number(lead.plots[0])}` : ""}`, text: lines.join("\n") }),
    });
    return true;
  } catch { return false; }
}
