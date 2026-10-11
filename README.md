# Za Kapličkou · web pro prodej pozemků Cerhenice

Statický web (HTML, CSS, JS, bez buildu) pro prodej 45 stavebních pozemků Comfort Development s.r.o.
Hlavní prvky: 3D výběr parcel (Three.js), mapa s trasami, nový brand, administrace prodeje a obsahu (`/admin`).

## Spuštění

```bash
node tools/serve.cjs 8799
```

Pak otevřít http://localhost:8799 (brand manuál: http://localhost:8799/brand.html, administrace: http://localhost:8799/admin).
Lokálně se data administrace ukládají do `.data/store.json` (v gitu není), heslo je `LOCAL_ADMIN_PASSWORD` v souboru `.env.local` (není v gitu, po změně server restartovat).
Deploy: Vercel (statické soubory + funkce v `api/`), nic se nekompiluje. Nastavení viz níže.

## Administrace (`/admin`)

Řídicí panel prodeje pro vedení, marketing i obchod. Všechno se ukládá na server a web si to načítá živě.

- **Přehled**: volné / rezervované / prodané pozemky s m² a hodnotou, poptávky za 30 dní a trend, poptávky bez reakce nad 24 h, konverze a medián doby reakce, tempo prodeje s odhadem vyprodání (od 3 obchodů za 90 dní). Karta **Co je potřeba udělat** (komu zavolat, dnešní prohlídky, končící rezervace), plánek lokality se stavem nebo **mapou zájmu** (kolik poptávek míří na který pozemek), obchodní trychtýř, zdroje poptávek podle UTM a kampaní, poslední změny.
- **Pozemky**: tabulka 45 parcel, stav, vlastní cena (jinak výchozí Kč/m²), rezervace do, zájemce, interní poznámka. Ukládá se hned po změně a propíše se do 3D, seznamu, stránek pozemků i formuláře.
- **Poptávky**: mini CRM. Filtry podle stavu, hledání, detail s tlačítky zavolat / e-mail, stav obchodu (Nová → Kontaktováno → Prohlídka → Rezervace → Prodáno / Ztraceno), poznámky s historií, **Rezervovat pozemek** jedním klikem (nastaví rezervaci na počet dní z nastavení), **Prodáno**, smazání kvůli GDPR, export CSV pro Excel.
- **Prohlídky**: vypsání termínů (den, od–do, délka, opakování až 8 týdnů). Volné termíny se nabízí ve formulářích na webu, rezervovaný termín se objeví u poptávky.
- **Obsah webu**: **Upravit na webu** otevře úvodní stránku v editoru na celou obrazovku. Do textu se klikne a píše (u odstavců s formátováním jde tučně a kurzíva), po najetí myší se ukáže název pole, u obrázků tlačítko „Změnit obrázek“ (knihovna vizualizací nebo nahrání z počítače, zmenší se a převede do WebP) a u položek galerie, dlaždic, harmonogramu a FAQ „Skrýt na webu“. Nahoře je náhled pro počítač, tablet i mobil, skok na sekci, panel **Změny** (seznam neuložených úprav, „Ukázat“ a „Vrátit“ u každé) a **Zveřejnit** (také <kbd>⌘S</kbd>). Rozpracované změny se průběžně ukládají v prohlížeči, takže nezmizí ani po zavření okna. **Seznam polí** ukazuje totéž jako formulář. Editovatelné prvky v `index.html` mají `data-cms="klíč"` (typ `data-cms-type="text|textarea|html|image"`), sekce `data-cms-section`, skrývatelné položky `data-cms-item`. Nový text do editoru = přidat tyto atributy.
- **Nastavení**: kontakt (mění se v celé stránce), výchozí cena Kč/m², zobrazování cen, délka rezervace, akční lišta nahoře, Google Tag Manager a Meta Pixel (spustí se až po souhlasu s cookies, poptávka posílá `lead_submit` / `Lead`), titulek a popis pro vyhledávače s náhledem.

Poptávky z webu (formulář, porovnání, stránky pozemků, stránka domu) se ukládají včetně UTM, referreru, stránky a vybraného termínu. Ochrana: skryté pole proti robotům, limit 10 odeslání za hodinu z jedné IP, přihlášení max. 8 pokusů za 15 min, podepsaná HttpOnly cookie na 12 h.

### Nasazení na Vercel

1. **Storage → Upstash for Redis** (Marketplace, free plán stačí) → připojit k projektu. Proměnné `KV_REST_API_URL` a `KV_REST_API_TOKEN` se doplní samy.
2. **Settings → Environment Variables**: `ADMIN_PASSWORD` (silné heslo pro tým), `SESSION_SECRET` (náhodný dlouhý řetězec, např. `openssl rand -hex 32`).
3. Volitelně e-mail o každé nové poptávce přes Resend: `RESEND_API_KEY`, `NOTIFY_EMAIL` (kam), `NOTIFY_FROM` (ověřená odesílací adresa).
4. Volitelně nahrávání obrázků v produkci: **Storage → Blob** → připojit (doplní `BLOB_READ_WRITE_TOKEN`). Bez něj nahrávání na Vercelu nefunguje, výběr z knihovny ano.
5. Redeploy. Vzor proměnných je v `.env.example`. Funkcí je 11 (limit Hobby je 12).

Bez připojeného úložiště web funguje dál se stavy z `assets/js/config.js`, jen formulář ukáže chybu a administrace vyzve k připojení.

## Co kde je

| Soubor | Obsah |
|---|---|
| `index.html` | stránka; ikony a logo jsou vložené mezi `<!--ICONS-->` a `<!--LOGO-->` (`python3 tools/inline.py`) |
| `assets/css/site.css` | styly, brand tokeny nahoře |
| `assets/js/config.js` | **ceny, stavy pozemků, kontakt** (tady se edituje prodej) |
| `assets/js/masterplan.js` | 3D model (Three.js 0.170 z jsDelivr) |
| `assets/js/map.js`, `assets/data/geo.js` | mapa, trasy autem z OSRM / OpenStreetMap |
| `assets/data/parcels.js` | tvary a výměry 45 parcel vytažené z PDF studie APRIS (str. 21) |
| `assets/brand/` | logo SVG (běžné, negativ, mono, kompaktní), symbol, favicon |
| `brand.html` | brand manuál a ukázky použití |
| `tools/og/og.html` | zdroj náhledu pro sdílení `assets/img/og.jpg` |

## Stránky pozemků, slunce, oblíbené

- **`/pozemky/1` až `/pozemky/45`**: stránka každého pozemku (plánek s rozměry a severkou, stín ukázkového domu podle ročního období a času, poloha v lokalitě, podobné pozemky, vzdálenosti, poptávka s předvyplněným pozemkem). Generuje je `python3 tools/build_plots.py` ze šablony `tools/plot-template.html`; skript zároveň obnoví `sitemap.xml` a `robots.txt`. Po změně šablony nebo dat ho spusťte znovu.
- **Slunce ve 3D**: tlačítko „Slunce“ v liště modelu (léto / jaro / zima, posuvník času, přehrání dne). Výpočet polohy slunce je v `assets/js/sun.js` pro Cerhenice (CEST/CET).
- **Stránka `/dum` – Váš dům na pozemku**: výběr pozemku a jednoho ze 4 ilustračních typů domu (bungalov, dům s podkrovím, patrový, dům s garáží do L, `assets/js/houses.js`), natočení okapem nebo štítem k ulici, odstup od ulice, slunce a stíny. Počítá zastavěnost proti limitu 20 %, zbývající zahradu a kontroluje pravidla zástavby. Sestava se ukládá do adresy (`/dum?pozemek=12&typ=podkrovi`), takže jde sdílet. Odkaz vede z menu, ze sekce Pravidla zástavby a ze stránky každého pozemku.
- **Vizualizace z pohledu chodce** `assets/img/render-*` (ulice, zahrada, přelet, veřejná zeleň, vjezd): AI vizualizace v Higgsfieldu podle letecké vizualizace projektanta, na webu označené jako ilustrační.
- **Okolí ve 3D**: budovy, ulice, železnice, pole, lesy a voda z OpenStreetMap (`assets/data/context3d.js`, převod a zarovnání na silnici III/3297 dělá jednorázový skript; data © OSM, ODbL). Pohled „Okolí“ v liště ukáže celou obec s popisky. Model okolí se dostaví až po prvním snímku, aby se 3D objevilo hned.
- **Oblíbené a porovnání**: srdíčko v detailu pozemku (ve 3D i na stránce pozemku), uloženo v prohlížeči návštěvníka, max 4. V liště 3D se objeví počet a porovnání vedle sebe s tlačítkem „Poslat výběr“, které předvyplní formulář.

## Záložní ceny a stavy (`assets/js/config.js`)

Normálně se ceny a stavy nastavují v administraci. `config.js` platí jen jako záloha, když API neodpoví.

```js
export const PRICE_PER_M2 = 2490;            // cena za m², nebo null = "Ceník pošleme obratem"
export const PRICE_OVERRIDE = { "01": 3990000 };
export const STATUS = { "05": "rezervace", "12": "prodano" };
```

Stav se propíše do 3D modelu, seznamu, legendy, formuláře i počtu volných pozemků.
Odkaz přímo na pozemek: `…/#pozemek-12` (tlačítko sdílení v detailu ho zkopíruje).

## Záběry z dronu, poloha a proměna „před a po“

- **Hero**: `assets/video/hero-dron-v5.mp4` (1600 px) a `hero-dron-v5-sm.mp4` (960 px pro mobil). Obrázky a videa se cachují 7 dní, takže **nová verze = nový název souboru**. Smyčka jen klidných záběrů z dronu (11. 10. 2026): druhá půlka krouživého záběru 132818 (12,6–23,8 s, výhled přes lokalitu k obci, stálá rychlost), smyčka 9,7 s s prolnutím, bez stabilizace (na přání, jen sestřih a barvy); záběry 132904 a 133032 se třesou celé, nepoužívat. Stabilizovaná varianta: stabilizace přes OpenCV podle vzdáleného pásu u obzoru (bez paralaxy blízké země; zamknutý obzor, ořez 5 %), barevně doladěná, s prolnutím mezi záběry a do začátku. Úvodní snímek `assets/img/hero-dron*`. Skript na střih a stabilizaci je mimo repozitář (scratchpad), postup: optický tok mezi snímky → kumulovaná trajektorie → Gaussovo vyhlazení → `warpAffine`.
- **Poloha lokality** je ověřená z katastru ČÚZK (WFS INSPIRE, parcely investora 930–934 a 940) a sedí na fotky z dronu (GPS a úhly z XMP, dorovnáno na sloupy VN a silnici III/3297). Lokalita leží **východně od silnice III/3297**, mezi silnicí a pozemky je cizí pole 929; napojení je v SZ rohu. Převod souřadnic plánu na GPS je `SITE_TF` v `assets/data/geo.js`, skutečný sever proti plánu `NORTH` v `assets/js/sun.js` (7,7°), 3D okolí `assets/data/context3d.js` je převedené do rámce plánu. Trasy autem a pěšky (OSRM) jsou přepočítané z napojení `SITE_ACCESS`.
- **Proměna „před a po“** (sekce za úvodem): skutečná fotka z dronu a stejný záběr se zástavbou. Parcely, ulice a zeleň jsou osazené do fotky přesně podle studie: `tools/photomatch/` vyrenderuje 3D model lokality (parcels.js, houses.js) z pohledu kamery dronu (`scene.json`), render se vloží do fotky a pak ho AI (Higgsfield gpt_image_2_5) jen dofotorealizuje bez posunu domů a ulic; výsledek je zkontrolovaný proti parcelaci. Video proměny `assets/video/promena*.mp4` (Kling 3.0, začátek = fotka, konec = ověřený stav). Ověřovací obrázek: `tools/photomatch/overeni-katastr.jpg`.
- Spuštění fotomontáže: `http://localhost:8799/tools/photomatch/?cam=p9&w=2736&h=1824&t=1` (t = průběh výstavby 0–1, `window.setT(t)` vrací PNG).

## DOPLNIT před spuštěním

- [ ] **Telefon, e-mail, jméno prodejce** v administraci → Nastavení (výchozí hodnoty `+420 123 456 789` a `prodej@zakaplickou.cz` jsou zástupné, doména je návrh)
- [ ] **Ceny** a stavy pozemků v administraci, ověřit DPH
- [ ] **Vercel**: Upstash Redis, `ADMIN_PASSWORD`, `SESSION_SECRET`, případně Resend a Blob (viz Nasazení na Vercel)
- [ ] **Zásady ochrany osobních údajů** – odkazy `href="#"` u souhlasu a v patičce (cookie lišta už je, zobrazí se po vyplnění GTM / Pixelu)
- [ ] **Stav stavebního povolení** – v PDF předpoklad 30. 9. 2026; harmonogram teď říká „Teď: stavební povolení“, aktualizovat
- [ ] **Prodloužení ÚR etapy 2** (platnost do 05/2026, žádost podána) – ověřit
- [ ] **Číslování etapy 2** – ve výkresu mají parcely etapy 2 provizorně číslo „36“; web je čísluje 36–45 (západ → východ, pak 44 a 45 u východní silnice). Ověřit s APRIS.
- [ ] **Výměry** = popisky z koordinační situace (součet etapy 1 sedí na m² s bilancí 35 030 m²). U parcely 43 výkres uvádí 1 048 m², geometrie dává ~1 120 m² – ověřit. Průměr 45 parcel je 1 005 m² (studie uvádí starší 990 m²).
- [ ] Zdravotní středisko v obci existuje (cerhenice.cz), ale v OSM chybí jeho poloha; do mapy ho doplnit, až bude adresa
- [ ] Časy vlakem (S1: Kolín 13 min, Praha Masarykovo ~55 min) podle jízdního řádu PID 2023 – ověřit aktuální
- [ ] IČO investora do patičky
- [ ] Měření (GTM / Meta) – události už jdou do `dataLayer`: `promena_slider`, `promena_tab`, `plot_select`, `plot_cta`, `plot_share`, `plot_favorite`, `compare_open`, `compare_send`, `plot_page`, `plot_sun`, `sun_open`, `house_page`, `house_type`, `house_plot`, `house_share`, `filter_change`, `list_view_open`, `houses_toggle`, `map_destination`, `lead_submit`

## Zdroje

- Studie „Rodinné domy Cerhenice“, APRIS s.r.o., 04/2026 (texty, regulace, výkresy, vizualizace)
- Trasy autem: OSRM nad OpenStreetMap (volný provoz), © přispěvatelé OpenStreetMap
- Obec: cerhenice.cz, cs.wikipedia.org/wiki/Cerhenice, jízdní řád PID linky S1
- Průzkum log: Higgsfield (gpt_image_2_5), výsledný symbol překreslen ručně jako vektor
- Atmosférické fotky `assets/img/life-*.jpg` (kaplička, vytyčený pozemek, ulice, rodina, terasa, řepka): AI generované v Higgsfield, na webu označené jako ilustrační. Až budou skutečné fotky z místa, vyměnit.
- Mapa „V obci“: budovy, ulice, železnice z OpenStreetMap API (`assets/data/village.js`, ODbL), pěší trasy routing.openstreetmap.de
