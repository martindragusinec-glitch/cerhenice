"""Vygeneruje stránky pozemků pozemky/01..45 (soubor pozemky/<číslo>.html), sitemap.xml a robots.txt.
Spuštění z kořene projektu: python3 tools/build_plots.py
Data: assets/data/parcels.js, šablona: tools/plot-template.html, sprity: assets/brand/*-sprite.svg."""
import json, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://cerhenice.vercel.app"
src = (root / "assets/data/parcels.js").read_text()
parcels = json.loads(re.search(r"export const PARCELS = (.*);", src).group(1))
tpl = (root / "tools/plot-template.html").read_text()
sprites = "\n".join((root / f).read_text().strip() for f in ["assets/brand/icons-sprite.svg", "assets/brand/logo-sprite.svg"])

ROWS = {
    "A": "v severní řadě u první ulice",
    "B": "ve druhé řadě s vjezdem z první ulice",
    "C": "ve třetí řadě s vjezdem z druhé ulice",
    "D": "ve čtvrté řadě s vjezdem z druhé ulice",
    "E": "v jižní řadě u třetí ulice",
    "X": "ve východní řadě podél ulice u příjezdu",
    "Y": "ve východní řadě podél ulice u příjezdu",
}
SIDE = {"N": "ze severu", "S": "z jihu", "E": "z východu"}
BADGE = {"N": "Zahrada na jih", "S": "Vjezd z jihu", "E": "Zahrada na západ"}
fmt = lambda n: f"{n:,}".replace(",", " ")

out = root / "pozemky"
out.mkdir(exist_ok=True)
nums = [int(p["id"]) for p in parcels]
for i, p in enumerate(parcels):
    n = int(p["id"])
    prev_n = nums[i - 1]
    next_n = nums[(i + 1) % len(nums)]
    html = tpl
    for k, v in {
        "SPRITES": sprites, "ID": p["id"], "NUM": str(n), "AREA": str(p["area"]), "AREA_FMT": fmt(p["area"]),
        "W": str(p["w"]), "D": str(p["d"]), "ETAPA": str(p["etapa"]), "BUILT": fmt(int(p["area"] * 0.2)),
        "SIDE": SIDE[p["front"]], "GARDEN": BADGE[p["front"]], "ROWTEXT": ROWS[p["row"]],
        "PREV": str(prev_n), "NEXT": str(next_n),
    }.items():
        html = html.replace("{{" + k + "}}", v)
    (out / f"{n}.html").write_text(html)

urls = [f"{BASE}/", f"{BASE}/dum", f"{BASE}/brand"] + [f"{BASE}/pozemky/{n}" for n in nums]
(root / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n")
(root / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")
print(f"{len(parcels)} stránek, sitemap {len(urls)} URL")
