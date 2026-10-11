// GET /api/public – živá data pro web: stavy a ceny pozemků, kontakt, akce, obsah z administrace.
import { get, storeReady } from "./_lib/store.js";
import { json, settings, plotsMerged } from "./_lib/util.js";

export default async function handler(req, res) {
  if (!storeReady()) return json(res, 200, { live: false });
  try {
    const s = await settings();
    const plots = {};
    for (const p of await plotsMerged()) {
      const o = {};
      if (p.status !== "volny") o.status = p.status;
      if (s.showPrices && p.price) o.price = p.price;
      if (Object.keys(o).length) plots[p.id] = o;
    }
    const content = await get("content", {});
    const hidden = await get("hidden", {});
    json(res, 200, {
      live: true, plots, content, hidden,
      settings: { phone: s.phone, email: s.email, contactName: s.contactName, showPrices: s.showPrices, promo: s.promo, gtmId: s.gtmId, metaPixelId: s.metaPixelId, seo: s.seo },
    }, { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" });
  } catch (e) {
    json(res, 200, { live: false, error: String(e.message || e) });
  }
}
