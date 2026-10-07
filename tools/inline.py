"""Vloží SVG sprity (ikony, logo) do index.html mezi značky <!--ICONS--> a <!--LOGO-->.
Spuštění: python3 tools/inline.py  (opakovatelné, přepíše obsah mezi značkami)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
for tag, src in [("ICONS", "assets/brand/icons-sprite.svg"), ("LOGO", "assets/brand/logo-sprite.svg")]:
    svg = (root / src).read_text().strip()
    block = f"<!--{tag}-->\n{svg}\n<!--/{tag}-->"
    pat = re.compile(rf"<!--{tag}-->(.*?<!--/{tag}-->)?", re.S)
    html = pat.sub(lambda m: block, html, count=1)
(root / "index.html").write_text(html)
print("ok")
