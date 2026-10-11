// POST /api/lead – poptávka z webu (formulář, porovnání, stránka pozemku, dům na pozemku), volitelně s termínem prohlídky.
import { get, set, update, hit, storeReady } from "./_lib/store.js";
import { json, body, ip, newId, clip, PLOT_IDS, notifyLead, log } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Jen POST" });
  if (!storeReady()) return json(res, 503, { error: "Poptávku teď nejde odeslat. Zavolejte nám prosím, rádi vše domluvíme po telefonu." });
  let b;
  try { b = await body(req); } catch { return json(res, 400, { error: "Neplatná data" }); }
  if (b.web) return json(res, 200, { ok: true }); // past na roboty
  if ((await hit("lead:" + ip(req), 3600)) > 10) return json(res, 429, { error: "Příliš mnoho odeslání, zkuste to prosím později nebo zavolejte." });
  const name = clip(b.name, 100), phone = clip(b.phone, 40), email = clip(b.email, 120);
  const errors = {};
  if (name.length < 2) errors.name = "Vyplňte prosím jméno.";
  if (phone.replace(/\D/g, "").length < 9) errors.phone = "Zadejte telefon.";
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.email = "Zkontrolujte e-mail.";
  if (!b.consent) errors.consent = "Potřebujeme souhlas se zpracováním údajů.";
  if (Object.keys(errors).length) return json(res, 422, { error: "Zkontrolujte formulář", errors });

  const plots = [...new Set([b.plot, ...(Array.isArray(b.plots) ? b.plots : [])].map((x) => String(x || "").padStart(2, "0")).filter((x) => PLOT_IDS.has(x)))].slice(0, 6);
  const lead = {
    id: newId(), createdAt: new Date().toISOString(), state: "nova",
    name, phone, email, plots, when: clip(b.when, 60), message: clip(b.message, 2000),
    page: clip(b.page, 120), referrer: clip(b.referrer, 200),
    utm: Object.fromEntries(Object.entries(b.utm || {}).filter(([k]) => ["source", "medium", "campaign", "content", "term"].includes(k)).map(([k, v]) => [k, clip(v, 80)])),
    house: b.house ? { type: clip(b.house.type, 20), plot: clip(b.house.plot, 3) } : null,
    notes: [], viewing: null, slotId: null,
  };
  // termín prohlídky
  if (b.slotId) {
    const slots = await get("slots", []);
    const s = slots.find((x) => x.id === b.slotId && !x.leadId && x.state !== "zruseno");
    if (s) { s.leadId = lead.id; s.state = "rezervovano"; lead.viewing = s.start; lead.slotId = s.id; lead.state = "prohlidka"; await set("slots", slots); }
  }
  await update("leads", [], (l) => [lead, ...l]);
  await log("Nová poptávka", `${name}${plots.length ? `, pozemek ${plots.map(Number).join(", ")}` : ""}`);
  await notifyLead(lead);
  json(res, 200, { ok: true, viewing: lead.viewing });
}
