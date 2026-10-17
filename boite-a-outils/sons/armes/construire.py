# Construit atelier.html (un seul fichier, à publier ou à ouvrir hors ligne) : atelier.src.html + armes.js + sons-d-armes.js
# + banque/banque-data.js (les vrais sons), et exemple_seul.html (démo jouable).   usage : python3 construire.py
import os, subprocess
H = os.path.dirname(os.path.abspath(__file__)); lire = lambda f: open(os.path.join(H, f), encoding="utf-8").read()
if not os.path.exists(os.path.join(H, "banque", "banque-data.js")): subprocess.run(["python3", os.path.join(H, "banque_js.py")], check=True)
js = {"armes.js": lire("armes.js"), "sons-d-armes.js": lire("sons-d-armes.js"), "banque/banque-data.js": lire("banque/banque-data.js")}
for v in js.values(): assert "</script" not in v
a = lire("atelier.src.html").replace("/*ARMES_JS*/", js["armes.js"]).replace("/*SONS_JS*/", js["sons-d-armes.js"]).replace("/*BANQUE_JS*/", js["banque/banque-data.js"])
open(os.path.join(H, "atelier.html"), "w", encoding="utf-8").write(a); print("atelier.html", round(len(a.encode()) / 1024), "Ko")
e = lire("exemple.html")
for f, v in js.items(): e = e.replace(f'<script src="{f}"></script>', "<script>\n" + v + "\n</script>")
open(os.path.join(H, "exemple_seul.html"), "w", encoding="utf-8").write(e); print("exemple_seul.html", round(len(e.encode()) / 1024), "Ko")
