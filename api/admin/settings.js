// PUT /api/admin/settings – kontakt, ceny, akční lišta, měření, SEO.
import { update } from "../_lib/store.js";
import { json, body, clip, settings, DEFAULT_SETTINGS, log } from "../_lib/util.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "PUT") return json(res, 405, { error: "Jen PUT" });
  const b = await body(req).catch(() => ({}));
  await update("settings", {}, (s) => {
    const n = { ...DEFAULT_SETTINGS, ...s };
    for (const k of ["phone", "email", "contactName"]) if (b[k] !== undefined) n[k] = clip(b[k], 120);
    if (b.pricePerM2 !== undefined) n.pricePerM2 = b.pricePerM2 ? Math.max(0, Number(b.pricePerM2)) : null;
    if (b.showPrices !== undefined) n.showPrices = !!b.showPrices;
    if (b.reserveDays !== undefined) n.reserveDays = Math.min(120, Math.max(1, Number(b.reserveDays) || 14));
    if (b.promo) n.promo = { on: !!b.promo.on, text: clip(b.promo.text, 160), link: clip(b.promo.link, 200) };
    if (b.gtmId !== undefined) n.gtmId = /^(GTM-[A-Z0-9]+)?$/.test(b.gtmId.trim()) ? b.gtmId.trim() : n.gtmId;
    if (b.metaPixelId !== undefined) n.metaPixelId = /^\d{0,20}$/.test(b.metaPixelId.trim()) ? b.metaPixelId.trim() : n.metaPixelId;
    if (b.seo) n.seo = { title: clip(b.seo.title, 90), description: clip(b.seo.description, 200) };
    return n;
  });
  await log("Nastavení uloženo");
  json(res, 200, { ok: true, settings: await settings() });
}
