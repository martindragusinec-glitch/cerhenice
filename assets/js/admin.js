// Administrace Za Kapličkou: přehled prodeje, pozemky, poptávky (CRM), prohlídky, vizuální editor webu, nastavení.
import { PARCELS, SITE } from "../data/parcels.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => new Intl.NumberFormat("cs-CZ").format(Math.round(n || 0));
const kc = (n) => (n ? `${fmt(n)} Kč` : "–");
const mkc = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} mil. Kč` : kc(n));
const num = (id) => String(Number(id));
const dt = (iso) => (iso ? new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const dd = (iso) => (iso ? new Date(iso).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" }) : "");
const tm = (iso) => new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
const ago = (iso) => { const h = (Date.now() - Date.parse(iso)) / 3600e3; return h < 1 ? "před chvílí" : h < 24 ? `před ${Math.floor(h)} h` : `před ${Math.floor(h / 24)} d`; };
const plural = (n, a, b, c) => (n === 1 ? a : n > 1 && n < 5 ? b : c);
const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#${id}"/></svg>`;
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
const hue = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (name, lg) => `<span class="av${lg ? " lg" : ""}" style="--h:${hue(name)}">${esc(initials(name))}</span>`;
const datebox = (iso) => { const d = new Date(iso); return `<span class="datebox"><b>${d.getDate()}</b><small>${d.toLocaleDateString("cs-CZ", { weekday: "short" })}</small></span>`; };
const STATUS_TXT = { volny: "Volný", rezervace: "Rezervace", prodano: "Prodáno" };
const LEAD_TXT = { nova: "Nová", kontaktovano: "Kontaktováno", prohlidka: "Prohlídka", rezervace: "Rezervace", prodano: "Prodáno", ztraceno: "Ztraceno" };
const FLOW = ["nova", "kontaktovano", "prohlidka", "rezervace", "prodano"];
const COLORS = { volny: "#c4dcae", rezervace: "#e4cb3c", prodano: "#2f4436" };
const TABS = { prehled: ["Prodej", "Přehled"], pozemky: ["Prodej", "Pozemky"], poptavky: ["Obchod", "Poptávky"], prohlidky: ["Obchod", "Prohlídky"], obsah: ["Web", "Obsah webu"], nastaveni: ["Web", "Nastavení"] };

let D = null, lastTab = "";
let tab = TABS[location.hash.slice(1)] ? location.hash.slice(1) : "prehled";

/* ---------- API ---------- */
async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(`/api/${path}`, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && path !== "admin/login") { showLogin("Přihlášení vypršelo, přihlaste se znovu."); throw new Error("Nepřihlášeno"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Něco se nepovedlo");
  return j;
}
function toast(m, kind = "ok") {
  const t = $("#toast");
  t.querySelector("span").textContent = m;
  t.querySelector("use").setAttribute("href", kind === "err" ? "#a-x" : "#a-check");
  t.classList.toggle("err", kind === "err");
  t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400);
}
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { if (e.message !== "Nepřihlášeno") toast(e.message, "err"); } };

/* ---------- přihlášení ---------- */
const PHOTOS = ["render-dron", "hero", "render-ulice", "render-park"];
function showLogin(msg) {
  document.body.classList.remove("editing");
  $("#app").hidden = true;
  $("#login").hidden = false;
  const h = new Date().getHours();
  $("#login-hello").textContent = h < 10 ? "Dobré ráno" : h < 18 ? "Dobrý den" : "Dobrý večer";
  try { const i = (Number(localStorage.getItem("zk-admin-photo")) + 1) % PHOTOS.length || 0; localStorage.setItem("zk-admin-photo", i); $("#login-photo").src = `assets/img/${PHOTOS[i]}.webp`; } catch {}
  if (msg) { $("#login-err").hidden = false; $("#login-err").textContent = msg; }
  $("#pw").focus();
}
$("#pw-eye").addEventListener("click", () => {
  const on = $("#pw").type === "password";
  $("#pw").type = on ? "text" : "password";
  $("#pw-eye").setAttribute("aria-pressed", on);
  $("#pw-eye").setAttribute("aria-label", on ? "Skrýt heslo" : "Zobrazit heslo");
  $("#pw-eye use").setAttribute("href", on ? "#i-eye-slash" : "#i-eye");
  $("#pw").focus();
});
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const go = $(".login-go"), card = $("#login-form");
  go.disabled = true;
  try {
    await api("admin/login", { method: "POST", body: { password: $("#pw").value } });
    $("#pw").value = "";
    $("#login-err").hidden = true;
    $("#login").hidden = true;
    await load();
  } catch (err) {
    $("#login-err").hidden = false; $("#login-err").textContent = err.message;
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    $("#pw").select();
  } finally { go.disabled = false; }
});
$("#logout").addEventListener("click", async () => { await api("admin/login", { method: "DELETE" }).catch(() => {}); showLogin(); });

async function load() {
  D = await api("admin/data");
  $("#app").hidden = false;
  const st = $("#store-info");
  st.className = `store ${D.store}`;
  st.querySelector("span").textContent = { redis: "Upstash Redis · živá data", file: "Lokální soubor · vývoj", none: "Úložiště nepřipojeno" }[D.store] || "";
  render();
}
async function boot() {
  const s = await fetch("/api/admin/login", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
  if (!s) return showLogin("Server administrace neběží.");
  if (!s.configured) return showLogin("Heslo není nastavené. Doplňte proměnnou ADMIN_PASSWORD.");
  if (!s.authed) return showLogin();
  await load();
}

/* ---------- navigace ---------- */
function go(t) { tab = t; history.replaceState(null, "", `#${t}`); closeSheet(); render(); scrollTo(0, 0); }
$$(".side-nav [data-tab]").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
addEventListener("scroll", () => $("#top").classList.toggle("scrolled", scrollY > 4), { passive: true });
function render() {
  document.body.classList.remove("editing");
  $$(".side-nav [data-tab]").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  const fresh = D.leads ? D.leads.filter((l) => l.state === "nova").length : 0;
  $("#badge-leads").hidden = !fresh; $("#badge-leads").textContent = fresh;
  const booked = D.slots ? D.slots.filter((s) => s.leadId && Date.parse(s.start) > Date.now()).length : 0;
  $("#badge-slots").hidden = !booked; $("#badge-slots").textContent = booked;
  $("#dot-draft").hidden = !dirtyN();
  $("#tab-eyebrow").textContent = TABS[tab][0];
  $("#tab-title").textContent = TABS[tab][1];
  $("#top-actions").innerHTML = "";
  const v = $("#view");
  if (lastTab !== tab) { v.style.animation = "none"; void v.offsetWidth; v.style.animation = ""; lastTab = tab; }
  if (!D.ready) {
    v.innerHTML = `<div class="warn-box"><b>Úložiště není připojené.</b><br>Ve Vercelu přidejte v záložce Storage integraci <b>Upstash for Redis</b> a připojte ji k projektu. Proměnné se doplní samy, pak web znovu nasaďte.</div>`;
    return;
  }
  ({ prehled, pozemky, poptavky, prohlidky, obsah, nastaveni })[tab](v);
}

/* ---------- plánek lokality ---------- */
const pathOf = (pts) => pts.map(([x, z], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${z.toFixed(1)}`).join("") + "Z";
function mapSvg(colorOf, labelOf = (p) => num(p.id), inkOf = () => "#132019") {
  const xs = SITE.outline.map((q) => q[0]), zs = SITE.outline.map((q) => q[1]);
  const vb = [Math.min(...xs) - 6, Math.min(...zs) - 6, Math.max(...xs) - Math.min(...xs) + 12, Math.max(...zs) - Math.min(...zs) + 12];
  let g = `<path d="${pathOf(SITE.outline)}" fill="#eef1e8" stroke="rgba(19,32,25,.12)"/>`;
  for (const p of PARCELS) g += `<g class="p" data-plot="${p.id}"><title>Pozemek ${num(p.id)} · ${fmt(p.area)} m²</title><path d="${pathOf(p.poly)}" fill="${colorOf(p)}" stroke="#fbfcf8" stroke-width="1.4"/><text x="${p.c[0]}" y="${p.c[1] + 2.2}" text-anchor="middle" font-size="6.2" font-weight="600" font-family="Geist Mono, monospace" fill="${inkOf(p)}" pointer-events="none">${labelOf(p)}</text></g>`;
  return `<svg viewBox="${vb.join(" ")}" role="img" aria-label="Plán lokality">${g}</svg>`;
}

/* ---------- metriky ---------- */
function metrics() {
  const P = D.plots, L = D.leads;
  const by = (s) => P.filter((p) => p.status === s);
  const sold = by("prodano"), res = by("rezervace"), free = by("volny");
  const now = Date.now(), d30 = now - 30 * 864e5, d60 = now - 60 * 864e5;
  const l30 = L.filter((l) => Date.parse(l.createdAt) > d30).length;
  const lPrev = L.filter((l) => Date.parse(l.createdAt) > d60 && Date.parse(l.createdAt) <= d30).length;
  const fresh = L.filter((l) => l.state === "nova");
  const waitingL = fresh.filter((l) => now - Date.parse(l.createdAt) > 24 * 3600e3);
  const won = L.filter((l) => ["rezervace", "prodano"].includes(l.state)).length;
  const resp = L.filter((l) => l.firstContactAt).map((l) => (Date.parse(l.firstContactAt) - Date.parse(l.createdAt)) / 3600e3).sort((a, b) => a - b);
  const median = resp.length ? resp[Math.floor(resp.length / 2)] : null;
  const interest = {};
  for (const l of L) for (const id of l.plots) interest[id] = (interest[id] || 0) + 1;
  const days = Array.from({ length: 30 }, (_, i) => { const a = now - (30 - i) * 864e5, b = a + 864e5; return L.filter((l) => { const t = Date.parse(l.createdAt); return t > a && t <= b; }).length; });
  return {
    sold, res, free, l30, lPrev, fresh, waiting: waitingL.length, oldest: waitingL.at(-1)?.createdAt, won, median, interest, days,
    soldValue: sold.reduce((s, p) => s + (p.price || 0), 0),
    resValue: res.reduce((s, p) => s + (p.price || 0), 0),
    freeValue: free.reduce((s, p) => s + (p.price || 0), 0),
    conv: L.length ? Math.round((won / L.length) * 100) : 0,
  };
}
function spark(days) {
  const max = Math.max(1, ...days), W = 4, G = 2.2;
  return `<svg class="spark" viewBox="0 0 ${days.length * (W + G)} 34" preserveAspectRatio="none" aria-hidden="true">${days.map((n, i) => { const h = n ? Math.max(5, (n / max) * 34) : 3; return `<rect x="${i * (W + G)}" y="${34 - h}" width="${W}" height="${h}" rx="1.5"${n ? ' class="on"' : ""}/>`; }).join("")}</svg>`;
}

/* ---------- PŘEHLED ---------- */
let mapMode = "stav";
function prehled(v) {
  const m = metrics();
  const area = (a) => fmt(a.reduce((s, p) => s + p.area, 0));
  const trend = m.lPrev ? Math.round(((m.l30 - m.lPrev) / m.lPrev) * 100) : null;
  const now = Date.now(), today = new Date().toDateString();
  const upcoming = D.slots.filter((s) => s.leadId && Date.parse(s.start) > now).slice(0, 5);
  const leadOf = (id) => D.leads.find((l) => l.id === id);
  const todo = [
    ...m.fresh.map((l) => ({ t: Date.parse(l.createdAt), hot: now - Date.parse(l.createdAt) > 24 * 3600e3, icon: "a-phone", tone: "", title: `Zavolat: ${l.name}`, sub: [l.plots.length ? `pozemek ${l.plots.map(Number).join(", ")}` : "", l.phone].filter(Boolean).join(" · "), meta: ago(l.createdAt), lead: l.id })),
    ...D.slots.filter((s) => s.leadId && new Date(s.start).toDateString() === today).map((s) => ({ t: Date.parse(s.start), icon: "a-calendar", tone: "blue", title: `Prohlídka dnes v ${tm(s.start)}`, sub: `${leadOf(s.leadId)?.name || ""} · ${leadOf(s.leadId)?.phone || ""}`, meta: "dnes", lead: s.leadId })),
    ...D.plots.filter((p) => p.status === "rezervace" && p.reservedUntil).map((p) => ({ p, days: Math.ceil((Date.parse(p.reservedUntil + "T23:59:59") - now) / 864e5) })).filter((x) => x.days <= 3).map(({ p, days }) => ({ t: 0, hot: days < 0, icon: "a-clock", tone: days < 0 ? "red" : "", title: `${days < 0 ? "Rezervace vypršela" : "Končí rezervace"}: pozemek ${num(p.id)}`, sub: p.leadId ? leadOf(p.leadId)?.name || "" : "bez přiřazeného zájemce", meta: days < 0 ? `před ${-days} d` : days === 0 ? "dnes" : `za ${days} d`, plot: p.id })),
  ].sort((a, b) => (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || a.t - b.t).slice(0, 6);
  const sold90 = m.sold.filter((p) => p.soldAt && now - Date.parse(p.soldAt) < 90 * 864e5).length + m.res.filter((p) => p.reservedAt && now - Date.parse(p.reservedAt) < 90 * 864e5).length;
  const pace = sold90 >= 3 ? sold90 / 3 : 0; // odhad až z aspoň 3 obchodů, jinak zavádí
  const left = pace ? Math.ceil(m.free.length / pace) : null;
  const srcMap = {};
  for (const l of D.leads) {
    const host = (() => { try { return new URL(l.referrer).hostname.replace("www.", ""); } catch { return ""; } })();
    const k = l.utm?.source ? `${l.utm.source}${l.utm.medium ? ` / ${l.utm.medium}` : ""}` : host || "přímo / neznámo";
    srcMap[k] = srcMap[k] || { n: 0, won: 0 };
    srcMap[k].n++;
    if (["rezervace", "prodano"].includes(l.state)) srcMap[k].won++;
  }
  const src = Object.entries(srcMap).sort((a, b) => b[1].n - a[1].n).slice(0, 7);
  const camp = {};
  for (const l of D.leads) if (l.utm?.campaign) camp[l.utm.campaign] = (camp[l.utm.campaign] || 0) + 1;
  const funnel = Object.keys(LEAD_TXT).map((k) => [k, D.leads.filter((l) => l.state === k).length]);
  const maxF = Math.max(1, ...funnel.map((f) => f[1]));
  const maxS = Math.max(1, ...src.map((s) => s[1].n));
  const maxI = Math.max(1, ...Object.values(m.interest));
  const heat = (n) => (n ? `rgba(228, 203, 60, ${0.3 + 0.7 * (n / maxI)})` : "#e3e8db");
  const seg = (cls, n) => (n ? `<span class="${cls}" style="width:${(n / 45) * 100}%"></span>` : "");
  const leg = (cls, label, list, value) => `<div><b><i style="background:var(--c-${cls})"></i>${label} ${list.length}</b><span>${area(list)} m²${value ? ` · ${mkc(value)}` : ""}</span></div>`;
  const logKind = (w) => (/poptáv/i.test(w) ? "lead" : /pozem/i.test(w) ? "plot" : /obsah|nastav|termín/i.test(w) ? "web" : "");
  v.innerHTML = `
  <div class="grid kpis">
    <div class="kpi kpi-hero">
      <span class="lbl">Prodej lokality</span>
      <span class="v">${m.sold.length + m.res.length}<small>z 45 pozemků prodáno nebo rezervováno</small></span>
      <div class="stackbar" role="img" aria-label="Prodáno ${m.sold.length}, rezervace ${m.res.length}, volné ${m.free.length}">${seg("sold", m.sold.length)}${seg("res", m.res.length)}${seg("free", m.free.length)}</div>
      <div class="kpi-legend">${leg("sold", "Prodáno", m.sold, m.soldValue)}${leg("res", "Rezervace", m.res, m.resValue)}${leg("free", "Volné", m.free, m.freeValue)}</div>
      ${pace ? `<span class="s">Tempo ${pace.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} pozemku měsíčně · při něm vyprodáno zhruba za ${left} měs.</span>` : ""}
    </div>
    <div class="kpi"><span class="lbl">Poptávky · 30 dní</span><span class="v">${m.l30}${trend !== null ? `<span class="trend ${trend >= 0 ? "up" : "down"}">${trend >= 0 ? "+" : ""}${trend} %</span>` : ""}</span>${spark(m.days)}</div>
    <div class="kpi ${m.waiting ? "warn" : ""}"><span class="lbl">Čeká na reakci</span><span class="v">${m.waiting}</span><span class="s">${m.waiting ? `nejstarší ${ago(m.oldest)}, volejte do 24 h` : m.fresh.length ? `${m.fresh.length} ${plural(m.fresh.length, "nová poptávka", "nové poptávky", "nových poptávek")}, vše do 24 h` : "všechny poptávky jsou vyřízené"}</span></div>
    <div class="kpi"><span class="lbl">Konverze</span><span class="v">${m.conv}<small>%</small></span><span class="s">poptávka → rezervace${m.median !== null ? ` · reakce ${m.median < 1 ? "do hodiny" : `za ${Math.round(m.median)} h`}` : ""}</span></div>
  </div>
  <div class="grid dash">
    <section class="card map">
      <div class="card-h"><div><h2>Lokalita</h2><p>${mapMode === "stav" ? "Klikem na pozemek změníte stav, cenu nebo rezervaci." : "Kolik poptávek míří na který pozemek. Kde je zájem největší, zvažte cenu."}</p></div><span class="seg"><button type="button" data-mm="stav" aria-pressed="${mapMode === "stav"}">Stav</button><button type="button" data-mm="zajem" aria-pressed="${mapMode === "zajem"}">Zájem</button></span></div>
      ${mapMode === "stav" ? mapSvg((p) => COLORS[D.plots.find((x) => x.id === p.id).status], undefined, (p) => (D.plots.find((x) => x.id === p.id).status === "prodano" ? "#f2f4ee" : "#132019")) : mapSvg((p) => heat(m.interest[p.id]), (p) => (m.interest[p.id] ? `${num(p.id)}·${m.interest[p.id]}` : num(p.id)))}
      <div class="legend">${mapMode === "stav" ? `<span><i style="background:${COLORS.volny}"></i>Volný</span><span><i style="background:${COLORS.rezervace}"></i>Rezervace</span><span><i style="background:${COLORS.prodano}"></i>Prodáno</span>` : `<span><i style="background:#e3e8db"></i>Bez poptávky</span><span><i style="background:rgba(228,203,60,.55)"></i>Zájem</span><span><i style="background:rgba(228,203,60,1)"></i>Největší zájem</span><span class="tip">číslo · počet poptávek</span>`}</div>
    </section>
    <div class="stack">
      <section class="card todo"><div class="card-h"><div><h2>Co je potřeba udělat</h2><p>Nové poptávky, dnešní prohlídky a končící rezervace</p></div><span class="count${todo.length ? "" : " zero"}">${todo.length || "✓"}</span></div><div class="list">${todo.map((x) => `<button type="button" class="${x.hot ? "hot" : ""}" ${x.lead ? `data-lead="${x.lead}"` : `data-plot="${x.plot}"`}><span class="t-ic ${x.tone}">${ic(x.icon)}</span><span class="t-txt"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></span><span class="t-meta">${x.meta}</span></button>`).join("") || `<p class="empty">${ic("a-check")}Všechno vyřízeno.</p>`}</div></section>
      <section class="card"><div class="card-h"><div><h2>Obchodní trychtýř</h2><p>Kde jsou rozpracované poptávky</p></div><button class="btn btn-quiet btn-sm" data-go="poptavky">Poptávky ${ic("a-arrow")}</button></div><div class="bars funnel">${funnel.map(([k, n]) => `<div class="bar"><b>${LEAD_TXT[k]}</b><span class="track"><span style="width:${n ? Math.max(3, (n / maxF) * 100) : 0}%"></span></span><em>${n}</em></div>`).join("")}</div></section>
      <section class="card"><div class="card-h"><div><h2>Odkud chodí poptávky</h2><p>Podle UTM parametrů z reklam a odkazů</p></div></div>${src.length ? `<div class="bars">${src.map(([k, s]) => `<div class="bar"><b title="${esc(k)}">${esc(k)}</b><span class="track"><span style="width:${(s.n / maxS) * 100}%"></span></span><em>${s.n}${s.won ? `·${s.won}` : ""}</em></div>`).join("")}</div><p class="note-s">Číslo za tečkou = rezervace a prodeje z daného zdroje.${Object.keys(camp).length ? ` Kampaně: ${Object.entries(camp).map(([c, n]) => `${esc(c)} (${n})`).join(", ")}.` : ""}</p>` : `<p class="empty">Zatím žádné poptávky.</p>`}</section>
    </div>
  </div>
  <div class="grid dash">
    <section class="card"><div class="card-h"><div><h2>Nejbližší prohlídky</h2><p>Termíny, které si zájemci vybrali na webu</p></div><button class="btn btn-ghost btn-sm" data-go="prohlidky">${ic("a-calendar")}Kalendář</button></div><div class="viewings">${upcoming.length ? upcoming.map((s) => { const l = leadOf(s.leadId); return `<div>${datebox(s.start)}<span class="who"><div><b>${esc(l?.name || "")}</b><small>${esc(l?.phone || "")}${l?.plots.length ? ` · pozemek ${l.plots.map(Number).join(", ")}` : ""}</small></div></span><span class="mono">${tm(s.start)}</span></div>`; }).join("") : `<p class="empty">${ic("a-calendar")}Žádná domluvená prohlídka.<br>Vypište termíny v sekci Prohlídky.</p>`}</div></section>
    <section class="card"><div class="card-h"><div><h2>Poslední změny</h2><p>Kdo co upravil v administraci a co přišlo z webu</p></div></div><div class="timeline">${D.log.slice(0, 8).map((x) => `<div><i class="${logKind(x.what)}"></i><span>${esc(x.what)}${x.detail ? `<small>${esc(x.detail)}</small>` : ""}</span><time>${ago(x.t)}</time></div>`).join("") || `<p class="empty">Zatím nic.</p>`}</div></section>
  </div>`;
  $$("[data-mm]", v).forEach((b) => b.addEventListener("click", () => { mapMode = b.dataset.mm; prehled(v); }));
  $$(".map .p, .todo [data-plot]", v).forEach((g) => g.addEventListener("click", () => openPlot(g.dataset.plot)));
  $$(".todo [data-lead]", v).forEach((b) => b.addEventListener("click", () => openLead(b.dataset.lead)));
  $$("[data-go]", v).forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
}

/* ---------- POZEMKY ---------- */
let plotFilter = "all", plotEtapa = "all", plotQuery = "";
function pozemky(v) {
  const m = metrics();
  $("#top-actions").innerHTML = `<span class="muted" style="font-size:13px">Výchozí cena <b class="mono" style="color:var(--ink)">${D.settings.pricePerM2 ? `${fmt(D.settings.pricePerM2)} Kč/m²` : "neuvedena"}</b> · ceny ${D.settings.showPrices ? "se na webu zobrazují" : "jsou na webu skryté"}</span><button class="btn btn-ghost btn-sm" data-go="nastaveni">${ic("a-sliders")}Ceny a rezervace</button>`;
  $("#top-actions [data-go]").addEventListener("click", () => go("nastaveni"));
  const rows = D.plots.filter((p) => (plotFilter === "all" || p.status === plotFilter) && (plotEtapa === "all" || String(p.etapa) === plotEtapa) && (!plotQuery || num(p.id) === plotQuery.trim() || (p.note || "").toLowerCase().includes(plotQuery)));
  const leadOpts = (sel) => `<option value="">–</option>` + D.leads.map((l) => `<option value="${l.id}"${l.id === sel ? " selected" : ""}>${esc(l.name)}</option>`).join("");
  const chip = (k, t, n, color) => `<button class="chip" data-f="${k}" aria-pressed="${plotFilter === k}">${color ? `<i style="background:${color}"></i>` : ""}${t}<b>${n}</b></button>`;
  v.innerHTML = `
  <div class="toolbar">
    <div class="chips">${chip("all", "Vše", D.plots.length)}${chip("volny", "Volné", m.free.length, COLORS.volny)}${chip("rezervace", "Rezervace", m.res.length, COLORS.rezervace)}${chip("prodano", "Prodáno", m.sold.length, COLORS.prodano)}</div>
    <span class="seg"><button type="button" data-e="all" aria-pressed="${plotEtapa === "all"}">Obě etapy</button><button type="button" data-e="1" aria-pressed="${plotEtapa === "1"}">Etapa 1</button><button type="button" data-e="2" aria-pressed="${plotEtapa === "2"}">Etapa 2</button></span>
    <span class="grow"></span>
    <label class="search">${ic("a-search")}<input type="search" id="pq" placeholder="Číslo nebo poznámka" value="${esc(plotQuery)}" aria-label="Hledat pozemek"></label>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Č.</th><th>Výměra</th><th>Etapa</th><th>Stav</th><th class="r" style="min-width:130px">Cena Kč</th><th class="r">Kč/m²</th><th>Rezervace do</th><th style="min-width:150px">Zájemce</th><th style="min-width:170px">Interní poznámka</th><th>Zájem</th><th></th></tr></thead>
    <tbody>${rows.map((p) => `<tr data-id="${p.id}">
      <td class="num"><span class="pid">${num(p.id)}</span></td>
      <td>${fmt(p.area)} m²<span class="hint">${p.w} × ${p.d} m</span></td>
      <td class="muted">${p.etapa}</td>
      <td><select class="cell st st-${p.status}" data-k="status" aria-label="Stav pozemku ${num(p.id)}">${Object.entries(STATUS_TXT).map(([k, t]) => `<option value="${k}"${p.status === k ? " selected" : ""}>${t}</option>`).join("")}</select></td>
      <td class="r"><input class="cell money" type="number" min="0" step="1000" data-k="price" value="${p.priceOwn ? p.price : ""}" placeholder="${p.price ? fmt(p.price) : "na dotaz"}" aria-label="Cena pozemku ${num(p.id)}"></td>
      <td class="r mono muted" style="font-size:12.5px">${p.price ? fmt(p.price / p.area) : "–"}${p.price && !p.priceOwn ? `<span class="hint">výchozí</span>` : ""}</td>
      <td><input class="cell" type="date" data-k="reservedUntil" value="${p.reservedUntil}"${p.status === "rezervace" ? "" : " disabled"} aria-label="Rezervace do"></td>
      <td><select class="cell" data-k="leadId" aria-label="Zájemce">${leadOpts(p.leadId)}</select></td>
      <td><input class="cell" type="text" data-k="note" value="${esc(p.note)}" placeholder="Přidat poznámku" aria-label="Poznámka"></td>
      <td>${m.interest[p.id] ? `<span class="heat">${m.interest[p.id]}</span>` : `<span class="muted">–</span>`}</td>
      <td><button class="btn btn-quiet btn-sm btn-icon" data-open="${p.id}" aria-label="Detail pozemku ${num(p.id)}">${ic("a-arrow")}</button></td></tr>`).join("") || `<tr><td colspan="11"><p class="empty">${ic("a-search")}Žádný pozemek neodpovídá filtru.</p></td></tr>`}</tbody>
  </table></div>`;
  $$("[data-f]", v).forEach((b) => b.addEventListener("click", () => { plotFilter = b.dataset.f; pozemky(v); }));
  $$("[data-e]", v).forEach((b) => b.addEventListener("click", () => { plotEtapa = b.dataset.e; pozemky(v); }));
  $("#pq").addEventListener("input", (e) => { plotQuery = e.target.value.toLowerCase(); clearTimeout(pozemky.t); pozemky.t = setTimeout(() => { pozemky(v); const i = $("#pq"); i.focus(); i.setSelectionRange(99, 99); }, 220); });
  $$("[data-open]", v).forEach((b) => b.addEventListener("click", () => openPlot(b.dataset.open)));
  $$("tbody [data-k]", v).forEach((el) => el.addEventListener("change", safe(async () => {
    const tr = el.closest("tr"), id = tr.dataset.id, k = el.dataset.k;
    const body = { id, [k]: el.value };
    if (k === "status" && el.value === "rezervace" && !D.plots.find((p) => p.id === id).reservedUntil) body.reservedUntil = new Date(Date.now() + (D.settings.reserveDays || 14) * 864e5).toISOString().slice(0, 10);
    const r = await api("admin/plots", { method: "PUT", body });
    D.plots = r.plots;
    toast(`Pozemek ${num(id)} uložen`);
    if (k === "status" || k === "price") { pozemky(v); $(`tr[data-id="${id}"]`, v)?.classList.add("saved"); }
    else { tr.classList.remove("saved"); void tr.offsetWidth; tr.classList.add("saved"); }
  })));
}
function openPlot(id) {
  const p = D.plots.find((x) => x.id === id);
  const leads = D.leads.filter((l) => l.plots.includes(id));
  sheet(`
    <div class="sheet-head"><div class="who"><span class="datebox" style="width:48px;height:48px"><b>${num(id)}</b><small>poz.</small></span><div><p class="eyebrow">Etapa ${p.etapa} · ${p.w} × ${p.d} m</p><h2>Pozemek ${num(id)} · ${fmt(p.area)} m²</h2></div></div><button class="x" data-close aria-label="Zavřít">${ic("a-x")}</button></div>
    <div class="sheet-body">
      <div class="row">
        <div class="field"><label for="pp-status">Stav</label><select id="pp-status">${Object.entries(STATUS_TXT).map(([k, t]) => `<option value="${k}"${p.status === k ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label for="pp-price">Cena Kč</label><input id="pp-price" type="number" step="1000" value="${p.priceOwn ? p.price : ""}" placeholder="${p.price ? fmt(p.price) : "na dotaz"}"></div>
        <div class="field"><label for="pp-until">Rezervace do</label><input id="pp-until" type="date" value="${p.reservedUntil}"></div>
      </div>
      <div class="field"><label for="pp-note">Interní poznámka</label><input id="pp-note" value="${esc(p.note)}" placeholder="Např. sousedé chtějí koupit i 13"></div>
      <div><p class="sec-t">Poptávky na tento pozemek · ${leads.length}</p><div class="list">${leads.map((l) => `<div><span class="who">${avatar(l.name)}<div><b>${esc(l.name)}</b><small>${ago(l.createdAt)}</small></div></span><span class="actions"><span class="pill ls-${l.state}">${LEAD_TXT[l.state]}</span><button class="btn btn-ghost btn-sm" data-lead="${l.id}">Otevřít</button></span></div>`).join("") || `<p class="empty">Zatím žádné.</p>`}</div></div>
    </div>
    <div class="sheet-foot"><a class="btn btn-quiet btn-sm" href="pozemky/${num(id)}" target="_blank" rel="noopener">${ic("a-ext")}Stránka pozemku</a><button class="btn btn-ink" id="pp-save">${ic("a-check")}Uložit</button></div>`);
  $("#pp-save").addEventListener("click", safe(async () => {
    const r = await api("admin/plots", { method: "PUT", body: { id, status: $("#pp-status").value, price: $("#pp-price").value, reservedUntil: $("#pp-until").value, note: $("#pp-note").value } });
    D.plots = r.plots; closeSheet(); toast(`Pozemek ${num(id)} uložen`); render();
  }));
  $$("#sheet [data-lead]").forEach((b) => b.addEventListener("click", () => openLead(b.dataset.lead)));
}

/* ---------- POPTÁVKY ---------- */
let leadFilter = "aktivni", leadQuery = "";
function poptavky(v) {
  $("#top-actions").innerHTML = `<a class="btn btn-ghost btn-sm" href="/api/admin/leads?format=csv">${ic("a-download")}Export do Excelu</a>`;
  const active = (l) => !["prodano", "ztraceno"].includes(l.state);
  const list = D.leads.filter((l) => (leadFilter === "vse" || (leadFilter === "aktivni" ? active(l) : l.state === leadFilter)) && (!leadQuery || `${l.name} ${l.phone} ${l.email} ${l.plots.map(Number).join(" ")}`.toLowerCase().includes(leadQuery)));
  const counts = { aktivni: D.leads.filter(active).length, vse: D.leads.length };
  for (const k of Object.keys(LEAD_TXT)) counts[k] = D.leads.filter((l) => l.state === k).length;
  v.innerHTML = `
  <div class="toolbar"><div class="chips">${[["aktivni", "Rozpracované"], ...Object.entries(LEAD_TXT), ["vse", "Všechny"]].map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${leadFilter === k}">${t}<b>${counts[k]}</b></button>`).join("")}</div><span class="grow"></span><label class="search">${ic("a-search")}<input type="search" id="lq" placeholder="Jméno, telefon, pozemek" value="${esc(leadQuery)}" aria-label="Hledat poptávku"></label></div>
  <div class="table-wrap"><table>
    <thead><tr><th>Zájemce</th><th>Telefon</th><th>Pozemky</th><th>Prohlídka</th><th>Zdroj</th><th>Stav</th><th class="r">Přišla</th></tr></thead>
    <tbody>${list.map((l) => `<tr class="click" data-lead="${l.id}">
      <td><span class="who">${avatar(l.name)}<div><b>${l.state === "nova" ? '<i class="new-dot" style="display:inline-block;margin-right:6px;vertical-align:1px"></i>' : ""}${esc(l.name)}</b><small>${esc(l.email || "bez e-mailu")}</small></div></span></td>
      <td class="mono" style="font-size:13px">${esc(l.phone)}</td>
      <td>${l.plots.map((p) => `<span class="tag">${num(p)}</span>`).join("") || `<span class="muted">–</span>`}</td>
      <td>${l.viewing ? `<b>${dt(l.viewing)}</b>` : `<span class="muted">${esc(l.when || "–")}</span>`}</td>
      <td>${esc(l.utm?.source || (l.referrer ? "odkaz" : "přímo"))}${l.utm?.campaign ? `<span class="hint">${esc(l.utm.campaign)}</span>` : ""}</td>
      <td><span class="pill ls-${l.state}">${LEAD_TXT[l.state]}</span></td>
      <td class="r"><span class="mono" style="font-size:12px">${dt(l.createdAt)}</span><span class="hint">${ago(l.createdAt)}</span></td></tr>`).join("") || `<tr><td colspan="7"><p class="empty">${ic("a-inbox")}Žádné poptávky v tomto filtru.</p></td></tr>`}</tbody>
  </table></div>`;
  $$("[data-f]", v).forEach((b) => b.addEventListener("click", () => { leadFilter = b.dataset.f; poptavky(v); }));
  $("#lq").addEventListener("input", (e) => { leadQuery = e.target.value.toLowerCase(); clearTimeout(poptavky.t); poptavky.t = setTimeout(() => { poptavky(v); const i = $("#lq"); i.focus(); i.setSelectionRange(99, 99); }, 220); });
  $$("tr[data-lead]", v).forEach((r) => r.addEventListener("click", () => openLead(r.dataset.lead)));
}
function openLead(id) {
  const l = D.leads.find((x) => x.id === id);
  if (!l) return;
  const cur = FLOW.indexOf(l.state), lost = l.state === "ztraceno";
  const plotRows = l.plots.map((pid) => {
    const p = D.plots.find((x) => x.id === pid);
    const act = p.status === "volny" ? `<button class="btn btn-accent btn-sm" data-reserve="${pid}">Rezervovat na ${D.settings.reserveDays || 14} dní</button>`
      : p.status === "rezervace" && p.leadId === l.id ? `<button class="btn btn-ink btn-sm" data-sell="${pid}">${ic("a-check")}Prodáno</button>`
      : "";
    return `<div class="plot-act"><span><span class="tag">${num(pid)}</span> ${fmt(p.area)} m²${p.price ? ` · ${kc(p.price)}` : ""} <span class="pill st-${p.status}">${STATUS_TXT[p.status]}${p.status === "rezervace" && p.reservedUntil ? ` do ${new Date(p.reservedUntil).toLocaleDateString("cs-CZ")}` : ""}</span></span>${act}</div>`;
  }).join("");
  const noteTxt = (n) => (n.auto ? n.text.replace(/^Stav: (\w+)$/, (mm, k) => `Stav: ${LEAD_TXT[k] || k}`) : n.text);
  sheet(`
    <div class="sheet-head"><div class="who">${avatar(l.name, true)}<div><p class="eyebrow">Poptávka · ${dt(l.createdAt)} · ${ago(l.createdAt)}</p><h2>${esc(l.name)}</h2></div></div><button class="x" data-close aria-label="Zavřít">${ic("a-x")}</button></div>
    <div class="sheet-body">
      <div class="actions"><a class="btn btn-ink" href="tel:${esc(l.phone.replace(/[^\d+]/g, ""))}">${ic("a-phone")}${esc(l.phone)}</a>${l.email ? `<a class="btn btn-ghost" href="mailto:${esc(l.email)}?subject=${encodeURIComponent("Pozemky Za Kapličkou")}">${ic("a-mail")}Napsat e-mail</a>` : ""}<button class="btn btn-quiet btn-sm" type="button" data-copy="${esc(l.phone)}">Kopírovat číslo</button></div>
      <div><p class="sec-t">Stav obchodu</p><div class="stepper${lost ? " lost" : ""}">${FLOW.map((k, i) => `<button type="button" data-state="${k}" class="${!lost && i < cur ? "done" : !lost && i === cur ? "cur" : ""}">${LEAD_TXT[k]}</button>`).join("")}</div><div class="lost-row"><span>${lost ? "Obchod je označený jako ztracený." : "Klikem posunete obchod do dalšího kroku."}</span><button class="btn btn-quiet btn-sm" type="button" data-state="${lost ? "nova" : "ztraceno"}">${lost ? "Obnovit poptávku" : "Ztraceno"}</button></div></div>
      <div><p class="sec-t">Pozemky</p>${plotRows ? `<div class="plot-acts">${plotRows}</div>` : `<p class="muted" style="margin:0;font-size:13.5px">Zájemce nevybral konkrétní pozemek.</p>`}</div>
      <div><p class="sec-t">Detail</p><dl class="kv">
        <dt>Prohlídka</dt><dd>${l.viewing ? `<b>${dt(l.viewing)}</b>` : esc(l.when || "–")}</dd>
        <dt>E-mail</dt><dd>${esc(l.email || "–")}</dd>
        <dt>Zpráva</dt><dd>${esc(l.message || "–")}</dd>
        <dt>Zdroj</dt><dd>${esc([l.utm?.source, l.utm?.medium, l.utm?.campaign].filter(Boolean).join(" / ") || l.referrer || "přímo")}</dd>
        <dt>Stránka</dt><dd>${esc(l.page || "–")}${l.house ? ` · dům ${esc(l.house.type)}` : ""}</dd>
      </dl></div>
      <div><p class="sec-t">Poznámky</p><div class="composer"><textarea id="ln" rows="2" placeholder="Např. volal 9. 10., chce ceník na 12 a 13, financování přes hypotéku"></textarea><div><span><span class="kbd">⌘</span> <span class="kbd">Enter</span> uloží</span><button class="btn btn-ink btn-sm" id="ln-add" type="button">Přidat</button></div></div>
      <div class="notes" style="margin-top:10px">${(l.notes || []).map((n) => `<div class="note${n.auto ? " auto" : ""}"><small>${dt(n.t)}</small>${esc(noteTxt(n))}</div>`).join("")}</div></div>
    </div>
    <div class="sheet-foot"><button class="btn btn-danger btn-sm" id="l-del" type="button">${ic("a-trash")}Smazat (GDPR)</button><button class="btn btn-ghost btn-sm" data-close type="button">Zavřít</button></div>`);
  const patch = async (body) => { const r = await api("admin/leads", { method: "PATCH", body: { id, ...body } }); D.leads = r.leads; };
  $$("#sheet [data-state]").forEach((b) => b.addEventListener("click", safe(async () => { if (b.dataset.state === l.state) return; await patch({ state: b.dataset.state }); toast(`Stav: ${LEAD_TXT[b.dataset.state]}`); openLead(id); render(); })));
  $("#sheet [data-copy]").addEventListener("click", (e) => { navigator.clipboard?.writeText(e.currentTarget.dataset.copy).then(() => toast("Číslo zkopírováno")); });
  const addNote = safe(async () => { const t = $("#ln").value.trim(); if (!t) return; await patch({ note: t }); openLead(id); toast("Poznámka přidána"); });
  $("#ln-add").addEventListener("click", addNote);
  $("#ln").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote(); } });
  $$("#sheet [data-reserve]").forEach((b) => b.addEventListener("click", safe(async () => {
    const pid = b.dataset.reserve;
    const until = new Date(Date.now() + (D.settings.reserveDays || 14) * 864e5).toISOString().slice(0, 10);
    D.plots = (await api("admin/plots", { method: "PUT", body: { id: pid, status: "rezervace", leadId: id, reservedUntil: until } })).plots;
    await patch({ state: "rezervace", note: `Rezervace pozemku ${num(pid)} do ${new Date(until).toLocaleDateString("cs-CZ")}` });
    toast(`Pozemek ${num(pid)} rezervován`); openLead(id); render();
  })));
  $$("#sheet [data-sell]").forEach((b) => b.addEventListener("click", safe(async () => {
    const pid = b.dataset.sell;
    if (!confirm(`Označit pozemek ${num(pid)} jako prodaný?`)) return;
    D.plots = (await api("admin/plots", { method: "PUT", body: { id: pid, status: "prodano", leadId: id } })).plots;
    await patch({ state: "prodano", note: `Pozemek ${num(pid)} prodán` });
    toast(`Pozemek ${num(pid)} prodán`); openLead(id); render();
  })));
  $("#l-del").addEventListener("click", safe(async () => {
    if (!confirm(`Opravdu smazat poptávku ${l.name}? Smaže se i z kalendáře prohlídek.`)) return;
    await api(`admin/leads?id=${id}`, { method: "DELETE" });
    D = await api("admin/data"); closeSheet(); toast("Poptávka smazána"); render();
  }));
}

/* ---------- PROHLÍDKY ---------- */
let showPast = false;
function prohlidky(v) {
  const now = Date.now();
  const future = D.slots.filter((s) => Date.parse(s.start) >= now - 3600e3);
  const past = D.slots.filter((s) => Date.parse(s.start) < now - 3600e3);
  const groups = {};
  for (const s of showPast ? D.slots : future) (groups[s.start.slice(0, 10)] = groups[s.start.slice(0, 10)] || []).push(s);
  const nextSat = (() => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); })();
  const booked = future.filter((s) => s.leadId).length;
  v.innerHTML = `
  <section class="card"><div class="card-h"><div><h2>Vypsat termíny prohlídek</h2><p>Volné termíny se hned nabídnou ve formulářích na webu. Zájemce si vybere a uvidíte ho tady i u poptávky.</p></div></div>
    <div class="slot-form">
      <div class="field"><label for="sd">Den</label><input id="sd" type="date" value="${nextSat}"></div>
      <div class="field"><label for="sf">Od</label><input id="sf" type="time" value="10:00"></div>
      <div class="field"><label for="st">Do</label><input id="st" type="time" value="12:00"></div>
      <div class="field"><label for="si">Délka prohlídky</label><select id="si"><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></div>
      <div class="field"><label for="sr">Opakovat</label><select id="sr"><option value="1">jen tento den</option><option value="2">2 týdny po sobě</option><option value="4">4 týdny po sobě</option><option value="8">8 týdnů po sobě</option></select></div>
      <button class="btn btn-ink" id="s-add" style="height:40px">${ic("a-plus")}Přidat termíny</button>
    </div>
  </section>
  <div class="toolbar" style="margin-top:18px"><span class="muted" style="font-size:13.5px"><b style="color:var(--ink)">${booked}</b> ${plural(booked, "domluvená prohlídka", "domluvené prohlídky", "domluvených prohlídek")} z ${future.length} ${plural(future.length, "vypsaného termínu", "vypsaných termínů", "vypsaných termínů")}</span><span class="grow"></span>${past.length ? `<button class="chip" id="s-past" aria-pressed="${showPast}">Proběhlé<b>${past.length}</b></button>` : ""}</div>
  <div class="days">${Object.entries(groups).map(([day, ss]) => `<section class="day">${datebox(day + "T12:00:00")}<div><h3>${dd(day + "T12:00:00")}<small>${ss.filter((s) => s.leadId).length}/${ss.length} obsazeno</small></h3><div class="slots">${ss.map((s) => { const l = D.leads.find((x) => x.id === s.leadId); return `<div class="slot${l ? " booked" : ""}"><div><b>${tm(s.start)}</b> <span class="muted" style="font-size:12px">${s.dur} min</span>${l ? `<small>${esc(l.name)} · ${esc(l.phone)}</small>` : `<small class="muted">volno</small>`}</div><div class="actions">${l ? `<button class="btn btn-ghost btn-sm" data-lead="${l.id}">Detail</button>` : ""}<button class="btn btn-quiet btn-sm btn-icon" data-del="${s.id}" aria-label="Smazat termín" title="Smazat termín">${ic("a-trash")}</button></div></div>`; }).join("")}</div></div></section>`).join("") || `<div class="card"><p class="empty">${ic("a-calendar")}Zatím žádné termíny. Vypište první sobotu výše.</p></div>`}</div>`;
  $("#s-add").addEventListener("click", safe(async () => {
    const day = $("#sd").value, from = $("#sf").value, to = $("#st").value, step = Number($("#si").value), rep = Number($("#sr").value);
    if (!day || !from || !to) return toast("Vyplňte den a čas", "err");
    const slots = [];
    for (let w = 0; w < rep; w++) {
      const base = new Date(`${day}T00:00:00`); base.setDate(base.getDate() + w * 7);
      const [fh, fm] = from.split(":").map(Number), [th, tmm] = to.split(":").map(Number);
      for (let t = fh * 60 + fm; t + step <= th * 60 + tmm; t += step) { const d = new Date(base); d.setHours(0, t, 0, 0); slots.push({ start: d.toISOString(), dur: step }); }
    }
    if (!slots.length) return toast("V zadaném čase se nevejde žádný termín", "err");
    D.slots = (await api("admin/slots", { method: "POST", body: { slots } })).slots;
    toast(`Přidáno ${slots.length} ${plural(slots.length, "termín", "termíny", "termínů")}`); render();
  }));
  $("#s-past")?.addEventListener("click", () => { showPast = !showPast; prohlidky(v); });
  $$("[data-del]", v).forEach((b) => b.addEventListener("click", safe(async () => {
    const s = D.slots.find((x) => x.id === b.dataset.del);
    if (s.leadId && !confirm("Termín má domluvenou prohlídku. Opravdu ho smazat? Zájemci dejte vědět.")) return;
    D.slots = (await api(`admin/slots?id=${s.id}`, { method: "DELETE" })).slots;
    if (s.leadId) D = await api("admin/data");
    render();
  })));
  $$("[data-lead]", v).forEach((b) => b.addEventListener("click", () => openLead(b.dataset.lead)));
}

/* ---------- OBSAH WEBU ---------- */
const LIBRARY = ["hero.jpg", "render-ulice.jpg", "render-zahrada.jpg", "render-dron.jpg", "render-park.jpg", "render-vjezd.jpg", "life-kaplicka.jpg", "life-kolik.jpg", "life-terasa.jpg", "life-ulice.jpg", "life-par.jpg", "life-repka.jpg", "viz-jihozapad.jpg", "viz-shora.jpg", "viz-studie.jpg", "viz-titul.jpg", "viz-jihovychod.jpg", "plan-site.jpg"].map((f) => `assets/img/${f}`);
const DRAFT_KEY = "zk-cms-draft";
let schema = null, cmsSec = 0, cmsMode = "visual", cmsDevice = "desktop", editor = null;
const draft = { set: {}, hide: {} };
const norm = (t) => String(t).replace(/[ \t\r\n]+/g, " ").trim();
const cleanHtml = (h) => norm(String(h).replace(/<\/?([a-z0-9]+)[^>]*>/gi, (m, tag) => (/^(em|strong|b|i|br|small|span)$/i.test(tag) ? m.replace(/\s[^>]*/, "").replace(/\/?>$/, ">") : "")).replace(/(<br>\s*)+$/, ""));
const plain = (h) => String(h).replace(/<br>/g, " ").replace(/<[^>]+>/g, "");
const dirtyN = () => Object.keys(draft.set).length + Object.keys(draft.hide).length;
async function loadSchema() {
  const html = await fetch("/", { cache: "no-store" }).then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, "text/html");
  return $$("[data-cms-section]", doc).map((sec) => ({
    name: sec.dataset.cmsSection,
    items: $$("[data-cms-item]", sec).map((it) => ({ key: it.dataset.cmsItem, label: it.dataset.cmsLabel || it.dataset.cmsItem, hiddenDefault: it.hasAttribute("hidden"), section: sec.dataset.cmsSection })),
    fields: $$("[data-cms]", sec).map((el) => {
      const type = el.dataset.cmsType || "text";
      const def = type === "image" ? el.getAttribute("src") : type === "html" ? cleanHtml(el.innerHTML) : norm(el.textContent);
      return { key: el.dataset.cms, label: el.dataset.cmsLabel || el.dataset.cms, type, def, item: el.closest("[data-cms-item]")?.dataset.cmsItem || "", section: sec.dataset.cmsSection };
    }),
  }));
}
const fieldOf = (k) => schema?.flatMap((s) => s.fields).find((f) => f.key === k);
const itemOf = (k) => schema?.flatMap((s) => s.items).find((i) => i.key === k);
const savedValue = (f) => D.content[f.key] ?? f.def;
function cmsValue(f) { return f.key in draft.set ? draft.set[f.key] : savedValue(f); }
const savedHidden = (it) => (it.key in D.hidden ? D.hidden[it.key] : it.hiddenDefault);
function isHidden(it) { return it.key in draft.hide ? draft.hide[it.key] : savedHidden(it); }
function setDraft(key, val) {
  const f = fieldOf(key);
  if (val === savedValue(f)) delete draft.set[key]; else draft.set[key] = val;
  updateSavebar();
}
function setHide(key, off) {
  const it = itemOf(key);
  if (off === savedHidden(it)) delete draft.hide[key]; else draft.hide[key] = off;
  updateSavebar();
}
// rozpracované změny přežijí zavření okna i přepnutí záložky
function persistDraft() { try { if (dirtyN()) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); else localStorage.removeItem(DRAFT_KEY); } catch {} }
function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!d) return;
    for (const [k, val] of Object.entries(d.set || {})) { const f = fieldOf(k); if (f && val !== savedValue(f)) draft.set[k] = val; }
    for (const [k, off] of Object.entries(d.hide || {})) { const it = itemOf(k); if (it && off !== savedHidden(it)) draft.hide[k] = off; }
    const n = dirtyN();
    if (n) toast(`Obnoveno ${n} ${plural(n, "neuložená změna", "neuložené změny", "neuložených změn")} z minula`);
  } catch {}
}
function updateSavebar() {
  const n = dirtyN();
  persistDraft();
  $("#dot-draft").hidden = !n;
  const cn = $("#ch-n"); if (cn) { cn.textContent = n; cn.classList.toggle("zero", !n); }
  const sv = $("#ed-save"); if (sv) { sv.disabled = !n; sv.classList.remove("saved"); sv.textContent = "Zveřejnit"; }
  const st = $("#ed-state"); if (st) { st.textContent = n ? `${n} ${plural(n, "neuložená změna", "neuložené změny", "neuložených změn")}` : "Živě na webu"; $("#ed-dot").classList.toggle("draft", !!n); }
  $$("[data-savebar]").forEach((b) => { b.hidden = !n; b.querySelector(".n").textContent = `${n} ${plural(n, "neuložená změna", "neuložené změny", "neuložených změn")}`; });
  if ($("#ch-pop") && !$("#ch-pop").hidden) renderChanges();
}
async function saveContent() {
  if (!dirtyN()) return;
  const set = {}, reset = [];
  for (const [k, val] of Object.entries(draft.set)) { const f = fieldOf(k); if (f && val === f.def) reset.push(k); else set[k] = val; }
  const sv = $("#ed-save"); if (sv) { sv.disabled = true; sv.textContent = "Ukládám…"; }
  const r = await api("admin/content", { method: "PUT", body: { set, reset, hide: draft.hide } });
  D.content = r.content; D.hidden = r.hidden; draft.set = {}; draft.hide = {};
  if (editor) $$(".zk-dirty", editor.doc).forEach((el) => el.classList.remove("zk-dirty"));
  updateSavebar();
  if (sv) { sv.classList.add("saved"); sv.innerHTML = `${ic("a-check")}Zveřejněno`; }
  toast("Zveřejněno, web se aktualizuje do pár vteřin");
}
function revertOne(k, kind) {
  if (kind === "hide") { delete draft.hide[k]; editor?.paint[k]?.(); }
  else {
    delete draft.set[k];
    if (editor) { applyOne(editor.doc, k, savedValue(fieldOf(k))); editor.doc.querySelectorAll(`[data-cms="${CSS.escape(k)}"]`).forEach((el) => el.classList.remove("zk-dirty")); }
  }
  updateSavebar();
}
function discardAll() {
  for (const k of Object.keys(draft.set)) revertOne(k, "set");
  for (const k of Object.keys(draft.hide)) revertOne(k, "hide");
  if (cmsMode === "list") render();
}
function renderChanges() {
  const pop = $("#ch-pop"); if (!pop) return;
  const rows = [
    ...Object.entries(draft.set).map(([k, val]) => { const f = fieldOf(k); return { k, kind: "set", sec: f.section, label: f.label, html: f.type === "image" ? `<img src="${esc(val)}" alt="">` : `<span>${esc(plain(val)) || "<em>prázdné</em>"}</span>` }; }),
    ...Object.entries(draft.hide).map(([k, off]) => { const it = itemOf(k); return { k, kind: "hide", sec: it.section, label: it.label, html: `<span>${off ? "Skryto na webu" : "Znovu zobrazeno"}</span>` }; }),
  ];
  pop.innerHTML = rows.length
    ? `<div class="ch-head"><b>${rows.length} ${plural(rows.length, "neuložená změna", "neuložené změny", "neuložených změn")}</b><button type="button" data-discard-all>Zahodit vše</button></div>${rows.map((r) => `<div class="ch-row"><div><small>${esc(r.sec)}</small><b>${esc(r.label)}</b>${r.html}</div><div class="ch-act">${cmsMode === "visual" ? `<button type="button" data-show="${r.k}" data-kind="${r.kind}">Ukázat</button>` : ""}<button type="button" data-revert="${r.k}" data-kind="${r.kind}">Vrátit</button></div></div>`).join("")}`
    : `<p class="empty">${ic("a-pencil")}Zatím žádné změny.<br>Klikněte na webu do textu a pište.</p>`;
  $$("[data-show]", pop).forEach((b) => b.addEventListener("click", () => { showOnPage(b.dataset.show, b.dataset.kind); toggleChanges(false); }));
  $$("[data-revert]", pop).forEach((b) => b.addEventListener("click", () => revertOne(b.dataset.revert, b.dataset.kind)));
  $("[data-discard-all]", pop)?.addEventListener("click", () => { if (confirm("Zahodit všechny neuložené změny?")) discardAll(); });
}
function toggleChanges(open) {
  const pop = $("#ch-pop"); if (!pop) return;
  pop.hidden = !open;
  $("#ch-btn").setAttribute("aria-expanded", open);
  if (open) renderChanges();
}
function showOnPage(k, kind) {
  if (!editor) return;
  const el = editor.doc.querySelector(kind === "hide" ? `[data-cms-item="${CSS.escape(k)}"]` : `[data-cms="${CSS.escape(k)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("zk-flash"); void el.offsetWidth; el.classList.add("zk-flash");
  if (el.isContentEditable) setTimeout(() => el.focus({ preventScroll: true }), 450);
}

async function obsah(v) {
  if (!schema) {
    v.innerHTML = `<div class="grid" style="gap:10px">${'<div class="skel" style="height:72px"></div>'.repeat(5)}</div>`;
    schema = await loadSchema();
    restoreDraft();
    if (tab !== "obsah") return;
  }
  if (cmsMode === "visual") { document.body.classList.add("editing"); obsahVisual(v); return; }
  $("#top-actions").innerHTML = `<span class="seg"><button type="button" data-cm="visual" aria-pressed="false">${ic("a-pencil")}Upravit na webu</button><button type="button" data-cm="list" aria-pressed="true">Seznam polí</button></span><a class="btn btn-ghost btn-sm" href="./" target="_blank" rel="noopener">${ic("a-ext")}Otevřít web</a>`;
  $$("#top-actions [data-cm]").forEach((b) => b.addEventListener("click", () => { cmsMode = b.dataset.cm; render(); }));
  obsahList(v);
}

/* vizuální úpravy přímo na webu */
const hintSeen = () => { try { return localStorage.getItem("zk-ed-hint") === "1"; } catch { return true; } };
function obsahVisual(v) {
  editor = null;
  const devs = [["desktop", "a-monitor", "Počítač"], ["tablet", "a-tablet", "Tablet"], ["mobile", "a-mobile", "Mobil"]];
  v.innerHTML = `<div class="ed">
    <header class="ed-bar">
      <div class="ed-l"><button class="btn btn-quiet btn-sm ed-back" type="button" data-back>${ic("a-back")}<span>Administrace</span></button><span class="ed-sep"></span><div class="ed-page"><b>Úvodní stránka</b><small><i class="live-dot" id="ed-dot"></i><span id="ed-state">Živě na webu</span></small></div></div>
      <div class="ed-c"><span class="seg seg-ic">${devs.map(([d, i, t]) => `<button type="button" data-dev="${d}" aria-pressed="${cmsDevice === d}" title="${t}" aria-label="${t}">${ic(i)}</button>`).join("")}</span><select class="ed-sec" id="vis-sec" aria-label="Přejít na sekci"><option value="">Přejít na sekci…</option>${schema.map((s) => `<option>${esc(s.name)}</option>`).join("")}</select></div>
      <div class="ed-r"><button class="btn btn-quiet btn-sm ed-list-btn" type="button" data-cm="list">Seznam polí</button><a class="btn btn-quiet btn-sm btn-icon" href="./" target="_blank" rel="noopener" title="Otevřít web" aria-label="Otevřít web">${ic("a-ext")}</a><div class="ed-changes"><button class="btn btn-ghost btn-sm" type="button" id="ch-btn" aria-expanded="false" aria-controls="ch-pop">${ic("a-history")}Změny<b class="count zero" id="ch-n">0</b></button><div class="ch-pop" id="ch-pop" hidden></div></div><button class="btn btn-accent btn-sm" type="button" id="ed-save" disabled title="Zveřejnit (⌘S)">Zveřejnit</button></div>
    </header>
    <div class="ed-stage ${cmsDevice}" id="ed-stage"><div class="ed-frame"><iframe id="vis-frame" src="./?cms=edit" title="Web v režimu úprav"></iframe></div><div class="ed-loading" id="ed-loading"><div><i></i>Načítám web…</div></div>${hintSeen() ? "" : `<div class="ed-hint" id="ed-hint"><span>Klikněte do textu a pište. Obrázky a skrývání položek se ukážou po najetí myší. <span class="kbd">⌘S</span> zveřejní.</span><button type="button">Rozumím</button></div>`}</div>
  </div>`;
  $("#vis-frame").addEventListener("load", (e) => mountEditor(e.target).catch((err) => toast(err.message, "err")));
  $("[data-back]", v).addEventListener("click", () => go("prehled"));
  $("[data-cm]", v).addEventListener("click", () => { cmsMode = "list"; render(); });
  $$("[data-dev]", v).forEach((b) => b.addEventListener("click", () => {
    cmsDevice = b.dataset.dev;
    $$("[data-dev]", v).forEach((x) => x.setAttribute("aria-pressed", x === b));
    $("#ed-stage").className = `ed-stage ${cmsDevice}`;
  }));
  $("#vis-sec").addEventListener("change", (e) => {
    const el = editor?.doc.querySelector(`[data-cms-section="${CSS.escape(e.target.value)}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.remove("zk-flash-sec"); void el.offsetWidth; el.classList.add("zk-flash-sec"); }
    e.target.value = "";
  });
  $("#ch-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleChanges($("#ch-pop").hidden); });
  $("#ch-pop").addEventListener("click", (e) => e.stopPropagation());
  $("#ed-save").addEventListener("click", safe(saveContent));
  $("#ed-hint button")?.addEventListener("click", () => { try { localStorage.setItem("zk-ed-hint", "1"); } catch {} $("#ed-hint").remove(); });
  updateSavebar();
}
addEventListener("click", () => toggleChanges(false));
addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && tab === "obsah") { e.preventDefault(); safe(saveContent)(); }
  if (e.key === "Escape") { toggleChanges(false); closeSheet(); }
});

const EDIT_CSS = `
html.zk-edit [contenteditable] { outline: 1.5px dashed transparent; outline-offset: 5px; border-radius: 3px; cursor: text; transition: outline-color .15s, background-color .15s; }
html.zk-edit [contenteditable]:hover { outline-color: rgba(214, 186, 30, .95); }
html.zk-edit [contenteditable]:focus { outline: 2px solid #e4cb3c; background-color: rgba(228, 203, 60, .14); }
html.zk-edit .zk-dirty { outline: 1.5px solid rgba(214, 186, 30, .95); }
html.zk-edit img[data-cms] { cursor: pointer; }
html.zk-edit .zk-off { opacity: .32; outline: 2px dashed rgba(163, 50, 31, .7) !important; outline-offset: -2px; }
html.zk-edit .consent-bar { display: none !important; }
html.zk-edit .zk-flash { animation: zk-flash 1.6s ease-out; }
html.zk-edit .zk-flash-sec { animation: zk-flash-sec 1.6s ease-out; }
@keyframes zk-flash { 0%, 55% { outline: 3px solid #e4cb3c; outline-offset: 7px; background-color: rgba(228, 203, 60, .2); } }
@keyframes zk-flash-sec { 0%, 50% { box-shadow: inset 0 0 0 4px #e4cb3c; } }
.zk-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; font: 500 12.5px/1 "Instrument Sans", system-ui, sans-serif; letter-spacing: 0; text-transform: none; }
.zk-b { position: absolute; left: 0; top: 0; pointer-events: auto; display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px 0 11px; border-radius: 10px; border: 0; background: rgba(19, 32, 25, .92); color: #f2f4ee; box-shadow: 0 10px 24px -10px rgba(0, 0, 0, .6), 0 0 0 1px rgba(255, 255, 255, .08) inset; cursor: pointer; white-space: nowrap; font: inherit; opacity: 0; transition: opacity .16s, transform .16s, background-color .15s; backdrop-filter: blur(8px); }
.zk-b.on { opacity: 1; }
.zk-b:hover { background: #000; }
.zk-b svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.zk-b.item { background: rgba(251, 252, 248, .96); color: #132019; box-shadow: 0 0 0 1px rgba(19, 32, 25, .14), 0 10px 24px -10px rgba(0, 0, 0, .35); }
.zk-b.item.off { background: #a3321f; color: #fff; }
.zk-chip { position: absolute; left: 0; top: 0; height: 20px; padding: 0 7px; border-radius: 6px 6px 6px 0; background: #e4cb3c; color: #132019; font: 600 11px/20px "Instrument Sans", system-ui, sans-serif; white-space: nowrap; opacity: 0; transition: opacity .12s; }
.zk-chip.on { opacity: 1; }
.zk-tip[hidden], .zk-chip[hidden] { display: none !important; }
.zk-tip { position: absolute; left: 0; top: 0; pointer-events: auto; display: flex; gap: 6px; align-items: center; padding: 5px 5px 5px 12px; border-radius: 12px; background: #132019; color: #f2f4ee; box-shadow: 0 14px 30px -12px rgba(0, 0, 0, .6); max-width: calc(100vw - 24px); }
.zk-tip b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.zk-tip small { opacity: .55; white-space: nowrap; font-size: 11.5px; margin: 0 4px; }
.zk-tip small.warn { opacity: 1; color: #f3d77a; }
.zk-tip i { width: 1px; height: 18px; background: rgba(255, 255, 255, .16); margin: 0 2px; }
.zk-tip button { all: unset; cursor: pointer; height: 28px; min-width: 28px; padding: 0 9px; box-sizing: border-box; border-radius: 8px; background: rgba(255, 255, 255, .1); white-space: nowrap; text-align: center; line-height: 28px; }
.zk-tip button:hover { background: rgba(255, 255, 255, .2); }
.zk-tip button.fmt { padding: 0; width: 28px; font-weight: 700; }
.zk-tip button.fmt.it { font-style: italic; font-weight: 500; font-family: Georgia, serif; }
`;
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I_IMG = SVG('<rect x="3.5" y="4.5" width="17" height="15" rx="2.6"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5l-4.5-4.5-8.5 8.5"/>');
const I_EYE = SVG('<path d="M2.5 12c1-2.5 4.5-7 9.5-7s8.5 4.5 9.5 7c-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7z"/><circle cx="12" cy="12" r="3"/>');
const I_EYE_OFF = SVG('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.8M6.5 6.6A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9.6 9.6 0 0 0 5.3-1.6"/>');

function applyOne(doc, key, val) {
  const f = fieldOf(key);
  for (const el of doc.querySelectorAll(`[data-cms="${CSS.escape(key)}"]`)) {
    if (f.type === "image") { el.src = val; el.removeAttribute("srcset"); el.closest("picture")?.querySelectorAll("source").forEach((s) => s.remove()); }
    else if (f.type === "html") el.innerHTML = cleanHtml(val);
    else el.textContent = val;
  }
}

async function mountEditor(fr) {
  const win = fr.contentWindow, doc = fr.contentDocument;
  if (!doc || !/cms=edit/.test(win.location.search)) return;
  for (let i = 0; i < 80 && !doc.documentElement.dataset.live; i++) await new Promise((r) => setTimeout(r, 50));
  const st = doc.createElement("style"); st.textContent = EDIT_CSS; doc.head.append(st);
  doc.documentElement.classList.add("zk-edit");
  for (const [k, val] of Object.entries(draft.set)) if (fieldOf(k)) applyOne(doc, k, val);
  const layer = doc.createElement("div"); layer.className = "zk-layer"; doc.body.append(layer);
  const chip = doc.createElement("div"); chip.className = "zk-chip"; layer.append(chip);
  const tip = doc.createElement("div"); tip.className = "zk-tip"; tip.hidden = true; layer.append(tip);
  const badges = [];
  editor = { doc, win, paint: {} };
  let px = -1, py = -1, hoverEl = null;

  // skrývatelné položky: v editoru vždy vidět, skryté zprůhledněné
  for (const el of doc.querySelectorAll("[data-cms-item]")) {
    const it = itemOf(el.dataset.cmsItem);
    if (!it) continue;
    el.hidden = false;
    if (el.tagName === "DETAILS") el.open = true;
    const b = doc.createElement("button");
    b.type = "button"; b.className = "zk-b item";
    const paint = () => { const off = isHidden(it); el.classList.toggle("zk-off", off); b.classList.toggle("off", off); b.innerHTML = off ? `${I_EYE_OFF}Skryto · zobrazit` : `${I_EYE}Skrýt na webu`; };
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setHide(it.key, !isHidden(it)); paint(); });
    paint();
    editor.paint[it.key] = paint;
    layer.append(b);
    badges.push({ b, el, corner: el.querySelector("img[data-cms]") ? "left" : el.tagName === "DETAILS" ? "right-gap" : "right", sticky: () => isHidden(it) });
  }

  // texty a obrázky
  for (const el of doc.querySelectorAll("[data-cms]")) {
    const f = fieldOf(el.dataset.cms);
    if (!f) continue;
    if (f.type === "image") {
      const b = doc.createElement("button");
      b.type = "button"; b.className = "zk-b img"; b.innerHTML = `${I_IMG}Změnit obrázek`;
      const open = (e) => { e.preventDefault(); e.stopPropagation(); pickImage(f, (url) => { applyOne(doc, f.key, url); setDraft(f.key, url); }); };
      b.addEventListener("click", open);
      el.addEventListener("click", open, true);
      layer.append(b);
      badges.push({ b, el: el.closest(".hero-media") ? el.closest(".hero") : el, corner: "right", sticky: () => false });
      continue;
    }
    el.contentEditable = f.type === "html" ? "true" : "plaintext-only";
    el.spellcheck = true;
    if (f.key in draft.set) el.classList.add("zk-dirty");
    el.addEventListener("input", () => {
      setDraft(f.key, f.type === "html" ? cleanHtml(el.innerHTML) : norm(el.textContent));
      el.classList.toggle("zk-dirty", f.key in draft.set);
      renderTip(); placeTip();
    });
    el.addEventListener("focus", () => { tip.target = el; tip.field = f; tip.hidden = false; chip.classList.remove("on"); renderTip(); placeTip(); });
    el.addEventListener("blur", () => setTimeout(() => { if (doc.activeElement !== el) tip.hidden = true; }, 120));
    el.addEventListener("pointerenter", () => { hoverEl = el; chip.textContent = f.label; place(); });
    el.addEventListener("pointerleave", () => { if (hoverEl === el) hoverEl = null; place(); });
    el.addEventListener("paste", (e) => { e.preventDefault(); doc.execCommand("insertText", false, norm(e.clipboardData.getData("text/plain"))); });
  }

  function renderTip() {
    const f = tip.field, el = tip.target;
    const cur = f.key in draft.set ? draft.set[f.key] : savedValue(f);
    const len = plain(cur).length, base = plain(f.def).length;
    const long = f.type === "text" && base > 8 && len > base * 1.35;
    tip.innerHTML = `<b>${esc(f.label)}</b>${f.type === "html" ? `<i></i><button type="button" class="fmt" data-cmd="bold" title="Tučně">B</button><button type="button" class="fmt it" data-cmd="italic" title="Kurzíva">I</button>` : ""}<small class="${long ? "warn" : ""}" title="${long ? "Text je výrazně delší než původní, zkontrolujte zalomení" : ""}">${len} ${plural(len, "znak", "znaky", "znaků")}${long ? " · delší než původně" : ""}</small>${cur !== f.def ? `<button type="button" data-r>Vrátit původní</button>` : ""}`;
    $$("[data-cmd]", tip).forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); doc.execCommand(b.dataset.cmd); }));
    $("[data-r]", tip)?.addEventListener("mousedown", (e) => {
      e.preventDefault();
      applyOne(doc, f.key, f.def); setDraft(f.key, f.def);
      el.classList.toggle("zk-dirty", f.key in draft.set);
      renderTip(); placeTip();
    });
  }
  function placeTip() {
    if (tip.hidden || !tip.target) return;
    const r = tip.target.getBoundingClientRect(), h = tip.offsetHeight, w = tip.offsetWidth;
    const top = r.top - h - 12 > 8 ? r.top - h - 12 : r.bottom + 12;
    tip.style.transform = `translate(${Math.max(8, Math.min(r.left - 6, win.innerWidth - w - 8))}px, ${top}px)`;
  }
  function place() {
    const H = win.innerHeight, W = win.innerWidth;
    for (const { b, el, corner, sticky } of badges) {
      const r = el.getBoundingClientRect();
      const vis = r.width > 40 && r.height > 30 && r.bottom > 70 && r.top < H - 30 && el.getClientRects().length;
      const inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
      const show = vis && (sticky() || inside || b.matches(":hover"));
      b.classList.toggle("on", !!show);
      b.style.pointerEvents = show ? "auto" : "none";
      if (!vis) continue;
      const bw = b.offsetWidth;
      const x = corner === "left" ? Math.max(r.left, 0) + 12 : Math.min(r.right, W) - bw - (corner === "right-gap" ? 72 : 12);
      const y = Math.min(Math.max(r.top + 12, 76), r.bottom - 44);
      b.style.transform = `translate(${x}px, ${y}px)`;
    }
    if (hoverEl && doc.activeElement !== hoverEl) {
      const r = hoverEl.getBoundingClientRect();
      chip.style.transform = `translate(${Math.max(4, r.left - 6)}px, ${r.top - 26 > 4 ? r.top - 26 : r.bottom + 6}px)`;
      chip.classList.add("on");
    } else chip.classList.remove("on");
    placeTip();
  }
  let raf = 0;
  const schedule = () => { if (!raf) raf = win.requestAnimationFrame(() => { raf = 0; place(); }); };
  doc.addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; schedule(); }, { passive: true });
  doc.documentElement.addEventListener("pointerleave", () => { px = py = -1; hoverEl = null; schedule(); });
  win.addEventListener("scroll", schedule, { passive: true, capture: true });
  win.addEventListener("resize", schedule);
  const tick = win.setInterval(place, 800);
  win.addEventListener("pagehide", () => win.clearInterval(tick));

  // web v režimu úprav: odkazy neodcházejí, tlačítka uvnitř textu se nespouštějí
  doc.addEventListener("click", (e) => {
    toggleChanges(false);
    if (e.target.closest(".zk-layer")) return;
    if (e.target.closest("[contenteditable]")) { e.preventDefault(); e.stopPropagation(); return; }
    const a = e.target.closest("a[href]");
    if (a && !a.getAttribute("href").startsWith("#")) { e.preventDefault(); e.stopPropagation(); toast("V editoru se odkazy neotevírají"); }
  }, true);
  doc.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); safe(saveContent)(); return; }
    const el = e.target.closest?.("[contenteditable]");
    if (!el) return;
    e.stopPropagation();
    const f = fieldOf(el.dataset.cms);
    if (e.key === "Enter") { e.preventDefault(); if (f?.type === "html") doc.execCommand("insertLineBreak"); else el.blur(); }
    else if (e.key === "Escape") el.blur();
    else if (e.key === " " && el.closest("summary, button")) { e.preventDefault(); doc.execCommand("insertText", false, " "); }
    else if ((e.metaKey || e.ctrlKey) && /^[bi]$/i.test(e.key) && f?.type !== "html") e.preventDefault();
  }, true);
  doc.addEventListener("keyup", (e) => { if (e.target.closest?.("[contenteditable]")) { e.stopPropagation(); if (e.key === " ") e.preventDefault(); } }, true);

  place();
  $("#ed-loading")?.classList.add("done");
}

function pickImage(f, done) {
  const cur = cmsValue(f);
  const uploads = Object.values({ ...D.content, ...draft.set }).filter((x) => /^(\/uploads\/|https:\/\/[^/]*blob)/.test(x));
  const lib = [...new Set([...uploads, ...LIBRARY])];
  sheet(`
    <div class="sheet-head"><div><p class="eyebrow">${esc(f.section)}</p><h2>${esc(f.label)}</h2></div><button class="x" data-close aria-label="Zavřít">${ic("a-x")}</button></div>
    <div class="sheet-body">
      <img class="pick-now" src="${esc(cur)}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:16px;background:var(--paper-2)">
      <div class="actions"><label class="btn btn-ink">${ic("a-plus")}Nahrát z počítače<input type="file" accept="image/*" id="pick-file" hidden></label>${cur !== f.def ? `<button class="btn btn-quiet btn-sm" type="button" data-pick="${esc(f.def)}">Vrátit původní obrázek</button>` : ""}</div>
      <p class="muted" style="font-size:12.5px;margin:-6px 0 0">Fotka se před nahráním sama zmenší a převede do WebP. Ideálně na šířku, aspoň 1600 px.</p>
      <div><p class="sec-t">Knihovna</p><div class="lib">${lib.map((u) => `<button type="button" data-pick="${esc(u)}" aria-pressed="${u === cur}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}</div></div>
    </div>`);
  const finish = (url) => { done(url); closeSheet(); toast("Obrázek vyměněn, nezapomeňte zveřejnit"); };
  $$("#sheet [data-pick]").forEach((b) => b.addEventListener("click", () => finish(b.dataset.pick)));
  $("#pick-file").addEventListener("change", safe(async (e) => {
    const file = e.target.files[0]; if (!file) return;
    toast("Nahrávám obrázek…");
    const { data, type } = await shrink(file);
    const r = await api("admin/upload", { method: "POST", body: { name: file.name, type, data } });
    finish(r.url);
  }));
}

/* seznam všech polí (záloha a pro texty, které na webu nejsou vidět) */
function obsahList(v) {
  const sec = schema[cmsSec];
  const changedIn = (s) => s.fields.filter((f) => D.content[f.key] !== undefined).length;
  v.innerHTML = `<div class="cms">
    <nav class="cms-nav">${schema.map((s, i) => `<button type="button" data-sec="${i}" aria-current="${i === cmsSec}">${esc(s.name)}${changedIn(s) ? `<em>${changedIn(s)}</em>` : ""}</button>`).join("")}</nav>
    <div class="cms-sec">
      ${sec.items.length ? `<div class="card"><div class="card-h"><div><h2>Zobrazené položky</h2><p>Vypnuté položky se na webu neukážou</p></div></div><div class="grid" style="gap:6px">${sec.items.map((it) => `<label class="item-row"><span>${esc(it.label)}</span><span class="switch"><input type="checkbox" data-item="${it.key}"${isHidden(it) ? "" : " checked"}></span></label>`).join("")}</div></div>` : ""}
      ${sec.fields.map((f) => fieldHtml(f)).join("")}
      <div class="savebar" data-savebar hidden><span class="n"></span><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-discard>Zahodit</button><button class="btn btn-accent btn-sm" type="button" data-save>Zveřejnit</button></div></div>
    </div></div>`;
  $$("[data-sec]", v).forEach((b) => b.addEventListener("click", () => { cmsSec = Number(b.dataset.sec); obsahList(v); scrollTo(0, 0); }));
  $$("[data-item]", v).forEach((c) => c.addEventListener("change", () => setHide(c.dataset.item, !c.checked)));
  $$("[data-field]", v).forEach((inp) => inp.addEventListener("input", () => {
    const f = fieldOf(inp.dataset.field);
    setDraft(f.key, f.type === "html" ? inp.value : norm(inp.value));
    inp.closest(".cms-field").classList.toggle("dirty", f.key in draft.set);
    if (f.type === "image") $(`img[data-prev="${f.key}"]`, v).src = inp.value;
  }));
  $$("[data-reset]", v).forEach((b) => b.addEventListener("click", () => { const f = fieldOf(b.dataset.reset); setDraft(f.key, f.def); obsahList(v); }));
  $$("[data-pickfor]", v).forEach((b) => b.addEventListener("click", () => { const f = fieldOf(b.dataset.pickfor); pickImage(f, (url) => { setDraft(f.key, url); obsahList(v); }); }));
  $("[data-save]", v).addEventListener("click", safe(async () => { await saveContent(); obsahList(v); }));
  $("[data-discard]", v).addEventListener("click", () => { if (confirm("Zahodit neuložené změny?")) { discardAll(); obsahList(v); } });
  updateSavebar();
}
function fieldHtml(f) {
  const val = cmsValue(f), changed = D.content[f.key] !== undefined, dirty = f.key in draft.set;
  const head = `<div class="cms-head"><label for="cf-${f.key}">${esc(f.label)}</label><span class="cms-key">${esc(f.key)}</span></div>`;
  const reset = val !== f.def ? `<button class="reset" type="button" data-reset="${f.key}">${ic("a-history")}Vrátit původní</button>` : "";
  if (f.type === "image") {
    return `<div class="cms-field${changed ? " changed" : ""}${dirty ? " dirty" : ""}">${head}<div class="cms-img"><img data-prev="${f.key}" src="${esc(val)}" alt=""><div class="field"><input type="text" id="cf-${f.key}" data-field="${f.key}" value="${esc(val)}"><button class="btn btn-ghost btn-sm" type="button" data-pickfor="${f.key}" style="align-self:flex-start">${ic("a-image")}Vybrat nebo nahrát</button>${reset}</div></div></div>`;
  }
  const long = f.type === "textarea" || f.type === "html" || val.length > 90;
  const input = long ? `<textarea id="cf-${f.key}" data-field="${f.key}" rows="${Math.min(8, Math.ceil(val.length / 80) + 1)}">${esc(val)}</textarea>` : `<input type="text" id="cf-${f.key}" data-field="${f.key}" value="${esc(val)}">`;
  return `<div class="cms-field${changed ? " changed" : ""}${dirty ? " dirty" : ""}">${head}${input}${f.type === "html" ? `<span class="muted" style="font-size:12px">Povolené značky: &lt;br&gt;, &lt;small&gt;, &lt;span&gt;, &lt;b&gt;, &lt;em&gt;.</span>` : ""}${reset}</div>`;
}
// zmenšení obrázku v prohlížeči před nahráním (max 2000 px, WebP)
async function shrink(file) {
  if (file.type === "image/svg+xml") return { type: file.type, data: btoa(unescape(encodeURIComponent(await file.text()))) };
  const img = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.84));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { type: "image/webp", data: btoa(bin) };
}

/* ---------- NASTAVENÍ ---------- */
function nastaveni(v) {
  const s = D.settings;
  v.innerHTML = `
  <div class="settings" id="set-form">
    <section class="card"><div class="card-h"><div><h2>Kontakt na webu</h2><p>Mění se v hlavičce, kontaktu, patičce i na stránkách pozemků</p></div></div>
      <div class="field"><label for="s-name">Kdo prodává</label><input id="s-name" value="${esc(s.contactName)}"></div>
      <div class="row"><div class="field"><label for="s-phone">Telefon</label><input id="s-phone" value="${esc(s.phone)}" inputmode="tel"></div><div class="field"><label for="s-email">E-mail</label><input id="s-email" value="${esc(s.email)}" inputmode="email"></div></div>
    </section>
    <section class="card"><div class="card-h"><div><h2>Ceny a rezervace</h2><p>Výchozí cena platí pro pozemky bez vlastní ceny</p></div></div>
      <div class="row"><div class="field"><label for="s-ppm">Výchozí cena Kč/m²</label><input id="s-ppm" type="number" min="0" step="10" value="${s.pricePerM2 || ""}" placeholder="neuvedeno"></div><div class="field"><label for="s-days">Délka rezervace (dní)</label><input id="s-days" type="number" min="1" max="120" value="${s.reserveDays || 14}"></div></div>
      <label class="switch"><input type="checkbox" id="s-show"${s.showPrices ? " checked" : ""}>Zobrazovat ceny na webu</label>
      <div class="info-box">Když ceny skryjete, web místo ceny nabídne „Ceník pošleme obratem“ a sbírá kontakty.</div>
    </section>
    <section class="card"><div class="card-h"><div><h2>Akční lišta nahoře</h2><p>Krátké oznámení nad hlavičkou webu</p></div><label class="switch"><input type="checkbox" id="s-pon"${s.promo?.on ? " checked" : ""}><span class="sr">Zobrazit</span></label></div>
      <div class="field"><label for="s-ptext">Text <span class="len" id="len-p"></span></label><input id="s-ptext" maxlength="160" value="${esc(s.promo?.text)}" placeholder="Např. Prohlídky každou sobotu 10 až 12 h, přijeďte se podívat"></div>
      <div class="field"><label for="s-plink">Odkaz</label><input id="s-plink" value="${esc(s.promo?.link)}" placeholder="#kontakt"></div>
    </section>
    <section class="card"><div class="card-h"><div><h2>Měření a reklama</h2><p>Spustí se až po souhlasu návštěvníka s cookies</p></div></div>
      <div class="row"><div class="field"><label for="s-gtm">Google Tag Manager</label><input id="s-gtm" value="${esc(s.gtmId)}" placeholder="GTM-XXXXXXX"></div><div class="field"><label for="s-px">Meta Pixel</label><input id="s-px" value="${esc(s.metaPixelId)}" placeholder="123456789012345"></div></div>
      <div class="info-box">Odeslaná poptávka posílá událost <span class="mono">lead_submit</span> do GTM a <span class="mono">Lead</span> do Meta Pixelu.</div>
    </section>
    <section class="card"><div class="card-h"><div><h2>Vyhledávače</h2><p>Titulek a popis úvodní stránky v Googlu</p></div></div>
      <div class="field"><label for="s-st">Titulek <span class="len" id="len-t"></span></label><input id="s-st" maxlength="90" value="${esc(s.seo?.title)}" placeholder="Za Kapličkou · stavební pozemky Cerhenice u Kolína"></div>
      <div class="field"><label for="s-sd">Popis <span class="len" id="len-d"></span></label><textarea id="s-sd" maxlength="200" rows="3" placeholder="45 stavebních pozemků 852 až 1 378 m²…">${esc(s.seo?.description)}</textarea></div>
      <div class="serp"><div class="u">Za Kapličkou · cerhenice.vercel.app</div><div class="t" id="serp-t"></div><div class="d" id="serp-d"></div></div>
    </section>
    <section class="card"><div class="card-h"><div><h2>Úložiště a e-maily</h2><p>Technické nastavení ve Vercelu</p></div></div>
      <dl class="kv"><dt>Úložiště</dt><dd>${{ redis: "Upstash Redis (produkce)", file: "Lokální soubor .data/store.json", none: "Nepřipojeno" }[D.store]}</dd><dt>E-mail o poptávce</dt><dd>Proměnné RESEND_API_KEY a NOTIFY_EMAIL ve Vercelu</dd><dt>Heslo</dt><dd>Proměnná ADMIN_PASSWORD ve Vercelu</dd></dl>
    </section>
  </div>
  <div class="savebar" id="set-bar" hidden><span>Neuložené změny nastavení</span><div class="actions"><button class="btn btn-ghost btn-sm" type="button" id="s-cancel">Zahodit</button><button class="btn btn-accent btn-sm" type="button" id="s-save">Uložit nastavení</button></div></div>`;
  const lens = () => {
    const L = (id, out, max) => { const n = $(id).value.length; $(out).textContent = `${n}/${max}`; $(out).classList.toggle("over", n > max); };
    L("#s-st", "#len-t", 60); L("#s-sd", "#len-d", 160); L("#s-ptext", "#len-p", 90);
    $("#serp-t").textContent = $("#s-st").value || "Za Kapličkou · stavební pozemky Cerhenice u Kolína";
    $("#serp-d").textContent = $("#s-sd").value || "45 stavebních pozemků 852 až 1 378 m² na okraji Cerhenic, 13 minut vlakem od Kolína.";
  };
  lens();
  const form = $("#set-form");
  const dirty = () => { $("#set-bar").hidden = false; lens(); };
  form.addEventListener("input", dirty); form.addEventListener("change", dirty);
  $("#s-cancel").addEventListener("click", () => nastaveni(v));
  $("#s-save").addEventListener("click", safe(async () => {
    const r = await api("admin/settings", { method: "PUT", body: {
      contactName: $("#s-name").value, phone: $("#s-phone").value, email: $("#s-email").value,
      pricePerM2: $("#s-ppm").value, reserveDays: $("#s-days").value, showPrices: $("#s-show").checked,
      promo: { on: $("#s-pon").checked, text: $("#s-ptext").value, link: $("#s-plink").value },
      gtmId: $("#s-gtm").value, metaPixelId: $("#s-px").value, seo: { title: $("#s-st").value, description: $("#s-sd").value },
    } });
    D.settings = r.settings;
    D.plots = (await api("admin/data")).plots;
    $("#set-bar").hidden = true;
    toast("Nastavení uloženo");
  }));
}

/* ---------- panel ---------- */
function sheet(html) {
  $("#sheet-box").innerHTML = html;
  $("#sheet").hidden = false;
  $("#sheet-box").scrollTop = 0;
  $$("[data-close]", $("#sheet")).forEach((b) => b.addEventListener("click", closeSheet));
}
function closeSheet() { $("#sheet").hidden = true; }
$("#sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });

boot();
