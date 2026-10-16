# Construit les deux pages « un seul fichier » (à publier comme artifact ou à ouvrir hors ligne) :
#   atelier.src.html + pas.js + vrais/*.ogg  → atelier.html     (régler les sons, comparer au vrai)
#   exemple.html + pas.js + sons-de-pas.js   → exemple_seul.html (démo jouable)
# usage : python3 construire.py
import os, json, base64, glob
H = os.path.dirname(os.path.abspath(__file__)); lire = lambda f: open(os.path.join(H, f), encoding="utf-8").read()
js = {f: lire(f) for f in ("pas.js", "sons-de-pas.js")}
for v in js.values(): assert "</script" not in v
vrais = {k: [base64.b64encode(open(f, "rb").read()).decode() for f in sorted(glob.glob(os.path.join(H, "vrais", k + "_*.ogg")))] for k in ("kretopi", "kenney", "inspectorj")}
a = lire("atelier.src.html").replace("/*PAS_JS*/", js["pas.js"]).replace("/*VRAIS*/", json.dumps(vrais))
open(os.path.join(H, "atelier.html"), "w", encoding="utf-8").write(a)
e = lire("exemple.html")
for f, v in js.items(): e = e.replace(f'<script src="{f}"></script>', "<script>\n" + v + "\n</script>")
open(os.path.join(H, "exemple_seul.html"), "w", encoding="utf-8").write(e)
print("atelier.html", round(len(a.encode())/1024), "Ko ; exemple_seul.html", round(len(e.encode())/1024), "Ko")
