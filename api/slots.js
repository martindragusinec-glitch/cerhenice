// GET /api/slots – volné termíny prohlídek na nejbližších 45 dní.
import { get, storeReady } from "./_lib/store.js";
import { json } from "./_lib/util.js";

export default async function handler(req, res) {
  if (!storeReady()) return json(res, 200, { slots: [] });
  const now = Date.now(), until = now + 45 * 86400e3;
  const slots = (await get("slots", []))
    .filter((s) => !s.leadId && s.state !== "zruseno" && Date.parse(s.start) > now + 2 * 3600e3 && Date.parse(s.start) < until)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 24)
    .map(({ id, start, dur }) => ({ id, start, dur }));
  json(res, 200, { slots }, { "Cache-Control": "no-store" });
}
