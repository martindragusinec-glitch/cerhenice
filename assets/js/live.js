// Napojení webu na administraci: živé stavy a ceny pozemků, kontakty, texty a obrázky, akční lišta,
// měření (GTM / Meta Pixel se souhlasem), odeslání poptávky a termíny prohlídek.
import { STATUS, PRICE_OVERRIDE, CONTACT } from "./config.js";

const API = "/api";
const EDIT = /[?&]cms=edit\b/.test(location.search); // web otevřený v editoru administrace
export const live = { ready: false, settings: {}, content: {}, hidden: {} };

/* ---------- UTM a zdroj návštěvy (pro vyhodnocení kampaní) ---------- */
const UTM_KEY = "zk-utm";
(function captureUtm() {
  try {
    const q = new URLSearchParams(location.search);
    const utm = {};
    for (const k of ["source", "medium", "campaign", "content", "term"]) if (q.get("utm_" + k)) utm[k] = q.get("utm_" + k);
    if (q.get("gclid")) utm.source = utm.source || "google", utm.medium = utm.medium || "cpc";
    if (q.get("fbclid")) utm.source = utm.source || "facebook", utm.medium = utm.medium || "paid-social";
    if (Object.keys(utm).length) sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    if (!sessionStorage.getItem("zk-ref")) sessionStorage.setItem("zk-ref", document.referrer && !document.referrer.includes(location.host) ? document.referrer : "");
  } catch { /* prohlížeč bez úložiště */ }
})();
function attribution() {
  try { return { utm: JSON.parse(sessionStorage.getItem(UTM_KEY) || "{}"), referrer: sessionStorage.getItem("zk-ref") || "" }; }
  catch { return { utm: {}, referrer: "" }; }
}

/* ---------- obsah z administrace ---------- */
const ALLOWED = /^(em|strong|b|i|br|small|span)$/i;
function sanitize(html) {
  return String(html).replace(/<\/?([a-z0-9]+)[^>]*>/gi, (m, tag) => (ALLOWED.test(tag) ? m.replace(/\s[^>]*/, "").replace(/\/?>$/, ">").replace("<br>", "<br>") : ""));
}
export function applyContent(content = {}, hidden = {}, root = document) {
  for (const el of root.querySelectorAll("[data-cms]")) {
    const key = el.dataset.cms, v = content[key];
    if (v === undefined || v === null || v === "") continue;
    const type = el.dataset.cmsType || "text";
    if (type === "image") {
      el.src = v;
      el.removeAttribute("srcset");
      el.closest("picture")?.querySelectorAll("source").forEach((s) => s.remove());
    } else if (type === "html") el.innerHTML = sanitize(v);
    else el.textContent = v;
  }
  for (const el of root.querySelectorAll("[data-cms-item]")) {
    const key = el.dataset.cmsItem;
    if (key in hidden) el.hidden = !!hidden[key];
  }
}

function applyContacts(s) {
  if (s.phone) {
    const tel = s.phone.replace(/[^\d+]/g, "");
    CONTACT.phone = s.phone;
    for (const a of document.querySelectorAll('[data-contact="phone"]')) {
      a.href = `tel:${tel}`;
      const label = a.querySelector("span") || a;
      for (const n of label.childNodes) if (n.nodeType === 3 && /\d{3}/.test(n.textContent)) n.textContent = s.phone;
      if (a.getAttribute("aria-label") === null && !label.childNodes.length) a.textContent = s.phone;
    }
  }
  if (s.email) {
    CONTACT.email = s.email;
    for (const a of document.querySelectorAll('[data-contact="email"]')) {
      a.href = `mailto:${s.email}`;
      for (const n of a.childNodes) if (n.nodeType === 3 && n.textContent.includes("@")) n.textContent = s.email;
    }
  }
}

function applyPromo(p) {
  if (!p?.on || !p.text) return;
  const bar = document.createElement("div");
  bar.className = "promo";
  bar.innerHTML = `<span></span>${p.link ? '<a class="promo-link"></a>' : ""}<button type="button" aria-label="Skrýt oznámení">×</button>`;
  bar.querySelector("span").textContent = p.text;
  if (p.link) { const a = bar.querySelector("a"); a.href = p.link; a.textContent = "Více"; }
  bar.querySelector("button").addEventListener("click", () => { bar.remove(); document.documentElement.classList.remove("has-promo"); try { sessionStorage.setItem("zk-promo-off", p.text); } catch {} });
  try { if (sessionStorage.getItem("zk-promo-off") === p.text) return; } catch {}
  document.body.prepend(bar);
  document.documentElement.classList.add("has-promo");
}

function applySeo(seo) {
  if (!seo || document.body.dataset.page !== "home") return;
  if (seo.title) document.title = seo.title;
  if (seo.description) document.querySelector('meta[name="description"]')?.setAttribute("content", seo.description);
}

/* ---------- měření se souhlasem ---------- */
function loadTracking(s) {
  const gtm = s.gtmId, px = s.metaPixelId;
  if (!gtm && !px) return;
  let consent = null;
  try { consent = localStorage.getItem("zk-consent"); } catch {}
  const enable = () => {
    if (gtm && !window.__zkGtm) {
      window.__zkGtm = true;
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      const sc = document.createElement("script"); sc.async = true; sc.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`; document.head.append(sc);
    }
    if (px && !window.fbq) {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      window.fbq("init", px); window.fbq("track", "PageView");
    }
  };
  if (consent === "all") return enable();
  if (consent === "necessary") return;
  const bar = document.createElement("div");
  bar.className = "consent-bar";
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Souhlas s cookies");
  bar.innerHTML = `<p>Měříme návštěvnost a účinnost reklam, abychom web zlepšovali. Souhlasíte s analytickými a marketingovými cookies?</p><div><button type="button" class="btn btn-ghost btn-sm" data-c="necessary">Jen nezbytné</button><button type="button" class="btn btn-accent btn-sm" data-c="all">Povolit vše</button></div>`;
  bar.addEventListener("click", (e) => {
    const c = e.target.closest("[data-c]")?.dataset.c;
    if (!c) return;
    try { localStorage.setItem("zk-consent", c); } catch {}
    bar.remove();
    if (c === "all") enable();
  });
  document.body.append(bar);
}
export function trackLead(data) {
  (window.dataLayer = window.dataLayer || []).push({ event: "lead_submit", ...data });
  if (window.fbq) window.fbq("track", "Lead", { content_name: data.plot_id || "" });
}

/* ---------- načtení živých dat ---------- */
export async function loadLive({ timeout = 1500 } = {}) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const r = await fetch(`${API}/public`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return false;
    const j = await r.json();
    if (!j.live) return false;
    for (const k of Object.keys(STATUS)) delete STATUS[k];
    for (const k of Object.keys(PRICE_OVERRIDE)) delete PRICE_OVERRIDE[k];
    for (const [id, v] of Object.entries(j.plots || {})) {
      if (v.status && v.status !== "volny") STATUS[id] = v.status;
      if (v.price) PRICE_OVERRIDE[id] = v.price;
    }
    Object.assign(live, { ready: true, settings: j.settings || {}, content: j.content || {}, hidden: j.hidden || {} });
    applyContent(live.content, live.hidden);
    applyContacts(live.settings);
    applyPromo(live.settings.promo);
    applySeo(live.settings.seo);
    if (!EDIT) loadTracking(live.settings);
    document.dispatchEvent(new CustomEvent("zk:live", { detail: live }));
    return true;
  } catch {
    return false;
  } finally {
    document.documentElement.dataset.live = live.ready ? "1" : "0";
  }
}

/* ---------- poptávka a termíny ---------- */
export async function submitLead(payload) {
  const a = attribution();
  try {
    const r = await fetch(`${API}/lead`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, page: location.pathname, referrer: a.referrer, utm: a.utm }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return { ok: true, viewing: j.viewing };
    return { ok: false, error: j.error || "Odeslání se nepovedlo.", errors: j.errors || {} };
  } catch {
    return { ok: false, offline: true, error: "Nepodařilo se spojit se serverem." };
  }
}

const dayFmt = new Intl.DateTimeFormat("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", timeZone: "Europe/Prague" });
const timeFmt = new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
export const fmtSlot = (iso) => `${dayFmt.format(new Date(iso))} ${timeFmt.format(new Date(iso))}`;

// Nahradí výběr „Prohlídka“ volnými termíny z administrace (pokud nějaké jsou).
export async function mountSlotPicker(select) {
  if (!select) return null;
  let slots = [];
  try { const r = await fetch(`${API}/slots`, { cache: "no-store" }); if (r.ok) slots = (await r.json()).slots || []; } catch { return null; }
  if (!slots.length) return null;
  const field = select.closest(".field");
  const box = document.createElement("div");
  box.className = "slot-picker";
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", "Termín prohlídky");
  const opt = (value, label, checked) => `<label class="slot"><input type="radio" name="slot" value="${value}"${checked ? " checked" : ""}><span>${label}</span></label>`;
  box.innerHTML = opt("", "Zatím jen ceník", true) + slots.slice(0, 9).map((s) => opt(s.id, fmtSlot(s.start))).join("") + opt("jiny", "Jiný termín");
  field.querySelector("label[for]").textContent = "Termín prohlídky";
  select.hidden = true;
  field.append(box);
  return {
    value() { const v = box.querySelector("input:checked")?.value || ""; return { slotId: v && v !== "jiny" ? v : "", when: v === "jiny" ? "Jiný termín" : v ? "" : "Zatím jen ceník" }; },
    select(id) { const i = box.querySelector(`input[value="${id}"]`); if (i) i.checked = true; },
  };
}
