# Construit atelier.html (un seul fichier, à publier ou à ouvrir hors ligne) : atelier.src.html + armes.js + vrais/*.ogg
# et exemple_seul.html (démo jouable) : exemple.html + armes.js + sons-d-armes.js.   usage : python3 construire.py
import os, json, base64
H = os.path.dirname(os.path.abspath(__file__)); lire = lambda f: open(os.path.join(H, f), encoding="utf-8").read()
js = {f: lire(f) for f in ("armes.js", "sons-d-armes.js")}
for v in js.values(): assert "</script" not in v
V = json.load(open(os.path.join(H, "vrais.json"), encoding="utf-8")) if os.path.exists(os.path.join(H, "vrais.json")) else {}
vrais = {k: {"titre": v["titre"], "arme": v["arme"], "reglages": v["reglages"], "sons": [base64.b64encode(open(os.path.join(H, "vrais", v["ogg"]), "rb").read()).decode()]} for k, v in V.items()}
a = lire("atelier.src.html").replace("/*ARMES_JS*/", js["armes.js"]).replace("/*VRAIS*/", json.dumps(vrais, ensure_ascii=False))
open(os.path.join(H, "atelier.html"), "w", encoding="utf-8").write(a); print("atelier.html", round(len(a.encode()) / 1024), "Ko")
if os.path.exists(os.path.join(H, "exemple.html")):
  e = lire("exemple.html")
  for f, v in js.items(): e = e.replace(f'<script src="{f}"></script>', "<script>\n" + v + "\n</script>")
  open(os.path.join(H, "exemple_seul.html"), "w", encoding="utf-8").write(e); print("exemple_seul.html", round(len(e.encode()) / 1024), "Ko")
