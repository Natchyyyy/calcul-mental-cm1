# banque/banque.json + .ogg → banque/banque-data.js (pour une page en un seul fichier : window.BANQUE_ARMES)
import json, base64, os, sys
d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "banque")
B = json.load(open(os.path.join(d, "banque.json"), encoding="utf-8"))
fs = sorted({v["f"] for w in B["armes"].values() for L in list(w["tirs"].values()) + list(w.get("actions", {}).values()) for v in L})
ogg = {f: base64.b64encode(open(os.path.join(d, f), "rb").read()).decode() for f in fs}
s = "/* Banque de vrais sons d'armes (Free Firearm Sound Library, CC0 ; explosions CDDA-Soundpacks : j1987 et unfa CC0, bmlake CC BY 3.0). Générée par banque_js.py. */\nwindow.BANQUE_ARMES = " + json.dumps({"json": B, "ogg": ogg}, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(os.path.join(d, "banque-data.js"), "w", encoding="utf-8").write(s); print("banque-data.js", round(len(s) / 1e6, 2), "Mo,", len(fs), "sons")
