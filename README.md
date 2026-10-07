# Za Kapličkou · web pro prodej pozemků Cerhenice

Statický web (HTML, CSS, JS, bez buildu) pro prodej 45 stavebních pozemků Comfort Development s.r.o.
Hlavní prvky: 3D výběr parcel (Three.js), mapa s trasami, nový brand.

## Spuštění

```bash
node tools/serve.cjs 8799
```

Pak otevřít http://localhost:8799 (brand manuál: http://localhost:8799/brand.html).
Deploy: složku nahrát na Vercel / Cloudflare Pages jako statický web, nic se nekompiluje.

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

## Prodej: ceny a stavy (`assets/js/config.js`)

```js
export const PRICE_PER_M2 = 2490;            // cena za m², nebo null = "Ceník pošleme obratem"
export const PRICE_OVERRIDE = { "01": 3990000 };
export const STATUS = { "05": "rezervace", "12": "prodano" };
```

Stav se propíše do 3D modelu, seznamu, legendy, formuláře i počtu volných pozemků.
Odkaz přímo na pozemek: `…/#pozemek-12` (tlačítko sdílení v detailu ho zkopíruje).

## Přelet dronem

V hero teď běží **animovaný přelet** vygenerovaný z vizualizace (Higgsfield, Kling 3.0, smyčka tam a zpět 20 s):
`assets/video/prelet.mp4` (1600 px, 4,5 MB) a `assets/video/prelet-sm.mp4` (960 px pro mobil, 2 MB).
Načítá se až po obrázku, při „omezení pohybu“ nebo úsporném režimu dat se nespustí (zůstane obrázek).
Až budou skutečné záběry z dronu: přepsat tyto dva soubory (H.264, bez zvuku, do ~6 MB) a v modalu upravit text „Animovaná vizualizace“.

## DOPLNIT před spuštěním

- [ ] **Telefon, e-mail, jméno prodejce** (`config.js` + v `index.html` hledat `+420 123 456 789` a `prodej@zakaplickou.cz`; doména je návrh)
- [ ] **Ceny** a stavy pozemků (`config.js`), ověřit DPH
- [ ] **Odeslání formuláře** – `main.js`, komentář `DOPLNIT: odeslání na backend` (webhook / CRM / e-mail)
- [ ] **Zásady ochrany osobních údajů** – odkazy `href="#"` u souhlasu a v patičce, cookie lišta pokud bude měření
- [ ] **Stav stavebního povolení** – v PDF předpoklad 30. 9. 2026; harmonogram teď říká „Teď: stavební povolení“, aktualizovat
- [ ] **Prodloužení ÚR etapy 2** (platnost do 05/2026, žádost podána) – ověřit
- [ ] **Číslování etapy 2** – ve výkresu mají parcely etapy 2 provizorně číslo „36“; web je čísluje 36–45 (západ → východ, pak 44 a 45 u východní silnice). Ověřit s APRIS.
- [ ] **Výměry** = popisky z koordinační situace (součet etapy 1 sedí na m² s bilancí 35 030 m²). U parcely 43 výkres uvádí 1 048 m², geometrie dává ~1 120 m² – ověřit. Průměr 45 parcel je 1 005 m² (studie uvádí starší 990 m²).
- [ ] **Poloha lokality na mapě** je odhad (~50.0622, 15.0652, východní hrana podél silnice III/3297); ověřit s geodetem a případně upravit `SITE_LL` v `assets/data/geo.js`
- [ ] Zdravotní středisko v obci existuje (cerhenice.cz), ale v OSM chybí jeho poloha; do mapy ho doplnit, až bude adresa
- [ ] Časy vlakem (S1: Kolín 13 min, Praha Masarykovo ~55 min) podle jízdního řádu PID 2023 – ověřit aktuální
- [ ] IČO investora do patičky
- [ ] Měření (GTM / Meta) – události už jdou do `dataLayer`: `plot_select`, `plot_cta`, `plot_share`, `filter_change`, `list_view_open`, `houses_toggle`, `map_destination`, `flyover_open`, `lead_submit`

## Zdroje

- Studie „Rodinné domy Cerhenice“, APRIS s.r.o., 04/2026 (texty, regulace, výkresy, vizualizace)
- Trasy autem: OSRM nad OpenStreetMap (volný provoz), © přispěvatelé OpenStreetMap
- Obec: cerhenice.cz, cs.wikipedia.org/wiki/Cerhenice, jízdní řád PID linky S1
- Průzkum log: Higgsfield (gpt_image_2_5), výsledný symbol překreslen ručně jako vektor
- Atmosférické fotky `assets/img/life-*.jpg` (kaplička, vytyčený pozemek, ulice, rodina, terasa, řepka): AI generované v Higgsfield, na webu označené jako ilustrační. Až budou skutečné fotky z místa, vyměnit.
- Mapa „V obci“: budovy, ulice, železnice z OpenStreetMap API (`assets/data/village.js`, ODbL), pěší trasy routing.openstreetmap.de
