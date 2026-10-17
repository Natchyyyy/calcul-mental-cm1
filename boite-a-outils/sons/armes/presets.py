# Écrit les réglages calés (résultats de calibrer.js) dans armes.js : PRESETS, CALES, FIDELITE, et le lieu « Stand de tir ».
# Prépare aussi vrais/ (extraits des vrais tirs en .ogg) et vrais.json pour la page « Vrai ou synthèse » de l'atelier.
# usage : python3 presets.py [suffixe des résultats, ex. final]   (les résultats sont dans mesure/res/<arme>_<suffixe>.json)
# Les extraits réels ne sont refaits que si les dossiers de vrais tirs (.wav) sont là (mesure/cibles/…), sinon on garde vrais/.
import json, os, sys, subprocess, statistics as st, re
H = os.path.dirname(os.path.abspath(__file__)); M = os.path.join(H, "mesure"); suf = sys.argv[1] if len(sys.argv) > 1 else "final"
J = lambda f: json.load(open(os.path.join(M, f), encoding="utf-8"))
SITE = ["queueDebut", "queueMontee", "queueGrave", "queueT", "queueClarte", "echos", "echoNiv", "echoLoin"]
CALE = {  # nom du réglage → (config, description des enregistrements)
  "Pistolet 9 mm": ("9mm", "pistolet 9 mm à percuteur, tirs de près, à mi-distance, de loin et derrière le tireur"),
  "Fusil d'assaut 5,56": ("556", "carabine type AR-15 en 5,56×45, quatre positions de micro"),
  "Fusil d'assaut 7,62×39": ("762", "fusil type AK-47 et carabine SKS en 7,62×39, de près, de loin et derrière le tireur"),
  "Fusil de précision 7,62×54": ("76254", "fusil à verrou en 7,62×54R, de près, à mi-distance et de loin"),
  "Fusil à pompe 12": ("pompe", "trois fusils à pompe calibre 12, quatre positions de micro"),
}
GARDE = ["niveau", "vitesse", "diametre", "longueur", "projectiles", "freinage", "meca", "douille", "douilleNiv", "douilleF", "directivite", "ressort", "ressortF", "mecaNiv", "mecaCycle", "mecaF"]
presets, cales, fid, sites, queues, vrais = {}, {}, {}, [], [], {}
etalons = {}
try: etalons = J("etalons.json")
except Exception: pass
for nom, (cf, desc) in CALE.items():
  f = os.path.join(M, "res", f"{cf}_{suf}.json")
  if not os.path.exists(f): print("pas de résultat pour", nom, "→", f); continue
  r, c = J(f"res/{cf}_{suf}.json"), J(f"cfg/{cf}.json")
  P = dict(c["arme"]); P.update(r["arme"])
  sites.append({k: P[k] for k in SITE})
  presets[nom] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in P.items() if k not in SITE}
  cales[nom] = desc
  # écart mesuré avec des graines jamais vues pendant la calibration (evaluer_final.js), sinon celui de la calibration
  ev = os.path.join(os.path.dirname(f), f"fidelite_{suf}.json"); ev = json.load(open(ev)).get(cf) if os.path.exists(ev) else None
  fid[nom] = {k.split("_", 1)[1]: {"ecart": round(v["total"], 2), "etalon": etalons.get(k)} for k, v in ev.items()} if ev else \
             {p["cible"].split("_", 1)[1]: {"ecart": round(p["total"], 2), "etalon": etalons.get(p["cible"])} for p in r["parts"]}
  for ci, t in zip(c["cibles"], r["cibles"]):
    pos = os.path.basename(ci["dossier"]).split("_", 1)[1]
    if pos == "proche": queues.append(t["reglages"].get("queue", -70))
    if pos in ("proche", "tireur", "loin"):
      reg = dict(t["reglages"]); reg.update(ci.get("fixe", {})); reg.update({k: P[k] for k in SITE}); reg["lieu"] = 0; reg["sol"] = 1
      d = os.path.normpath(os.path.join(M, "cfg", ci["dossier"])); w = sorted(x for x in os.listdir(d) if x.endswith(".wav"))[0] if os.path.isdir(d) else None
      cle = f"{cf}_{pos}"; vrais[cle] = {"titre": f"{nom} — {'derrière le tireur' if pos == 'tireur' else 'de près' if pos == 'proche' else 'de loin'}", "arme": nom,
        "reglages": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in reg.items()}, "fichier": os.path.join(d, w) if w else ""}
# le stand de tir : médiane des réglages de lieu trouvés pour chaque arme (c'est le même stand)
stand = {k: round(st.median(s[k] for s in sites), 3) for k in SITE} if sites else {}
if stand:
  stand.update({"lieu": 0, "sol": 1, "queue": round(st.median(queues), 1), "portee": 150}); stand["echos"] = int(round(stand["echos"]))
# armes dérivées (pas d'enregistrement : on change ce qui change dans la réalité)
def derive(base, nom, ch):
  if base in presets: presets[nom] = dict(presets[base], **ch)
derive("Pistolet 9 mm", "Pistolet-mitrailleur 9 mm", {"vitesse": 390, "niveau": presets.get("Pistolet 9 mm", {}).get("niveau", 157) + 1, "meca": 2, "mecaCycle": 34, "cadence": 800, "ressort": -40})
derive("Fusil d'assaut 5,56", "Carabine courte 5,56", {"vitesse": 840, "niveau": presets.get("Fusil d'assaut 5,56", {}).get("niveau", 162) + 2,
  "gaz": presets.get("Fusil d'assaut 5,56", {}).get("gaz", -20) + 4, "cadence": 800})
derive("Fusil de précision 7,62×54", "Fusil de combat 7,62×51", {"vitesse": 830, "longueur": 31, "meca": 3, "mecaNiv": 120, "mecaCycle": 45, "mecaF": 2600, "douille": 1, "douilleF": 6500, "cadence": 650})
derive("Fusil à pompe 12", "Fusil de chasse 12 (petits plombs)", {"diametre": 2.8, "longueur": 2.8, "projectiles": 30, "freinage": 70})
for n, cad in [("Fusil d'assaut 5,56", 750), ("Fusil d'assaut 7,62×39", 600)]:
  if n in presets: presets[n]["cadence"] = cad
presets["Grenade à main"] = {"type": 1, "charge": 0.2, "beta": 1.2, "corps": -18, "corpsF": 150, "eclats": 20, "debris": -42, "feu": -16, "directivite": 0, "douille": 0, "meca": 0}
presets["Explosion lourde (2 kg)"] = {"type": 1, "charge": 2, "beta": 1.1, "corps": -14, "corpsF": 110, "eclats": 30, "debris": -36, "feu": -12, "directivite": 0, "douille": 0, "meca": 0}
# réglages de jeu par défaut (pas ceux d'un micro particulier)
for p in presets.values(): p.setdefault("micro", 145); p.setdefault("coupeBas", 40); p.setdefault("distance", 6); p.setdefault("angle", 30)
js = ("  // <presets> (écrit par presets.py à partir des calibrations)\n"
      f"  PRESETS = {json.dumps(presets, ensure_ascii=False, indent=1)};\n"
      f"  CALES = {json.dumps(cales, ensure_ascii=False)};\n"
      f"  FIDELITE = {json.dumps(fid, ensure_ascii=False)};\n"
      + (f"  LIEUX[\"Stand de tir (plein air)\"] = {json.dumps(stand, ensure_ascii=False)};\n"
         "  for (const k of Object.keys(LIEUX)) if (k !== \"Stand de tir (plein air)\") { const v = LIEUX[k]; delete LIEUX[k]; LIEUX[k] = v; }   // le stand en premier\n" if stand else "") +
      "  // </presets>")
a = open(os.path.join(H, "armes.js"), encoding="utf-8").read()
if "/*PRESETS*/" in a: a = a.replace("  /*PRESETS*/", js)
else: a = re.sub(r"  // <presets>.*?// </presets>", lambda m: js, a, flags=re.S)
open(os.path.join(H, "armes.js"), "w", encoding="utf-8").write(a)
# extraits réels pour l'atelier : 20 ms avant l'attaque, 1,5 s, ogg opus
os.makedirs(os.path.join(H, "vrais"), exist_ok=True); sortie = {}
anciens = json.load(open(os.path.join(H, "vrais.json"), encoding="utf-8")) if os.path.exists(os.path.join(H, "vrais.json")) else {}
for k, v in vrais.items():
  o = os.path.join(H, "vrais", k + ".ogg")
  if not v["fichier"].endswith(".wav"):   # pas de vrais tirs ici : on garde l'extrait déjà fait, avec les nouveaux réglages
    if k in anciens: sortie[k] = dict(anciens[k], reglages=v["reglages"])
    continue
  subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "0.28", "-t", "1.5", "-i", v["fichier"], "-af", "afade=t=out:st=1.3:d=0.2", "-c:a", "libopus", "-b:a", "64k", o], check=True)
  sortie[k] = {"titre": v["titre"], "arme": v["arme"], "reglages": v["reglages"], "ogg": os.path.basename(o)}
json.dump(sortie, open(os.path.join(H, "vrais.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(presets), "réglages,", len(cales), "calés ; stand :", stand); print("vrais :", ", ".join(sortie))
