# Exporte des coups de feu en fichiers sons (Unreal, Godot, Unity…, ou sons/integrer.py), rendus par le MÊME lecteur que le
# jeu web (sons-d-armes.js dans Chromium, OfflineAudioContext) : ce qu'on exporte est exactement ce que l'atelier fait entendre.
# usage : python3 exporter.py --sortie dossier [--armes "Pistolet 9 mm,Fusil à pompe 12"] [--lieu "Forêt"]
#                             [--positions "tireur,15,60:90,250"] [--variantes 6] [--actions] [--graves 0.6] [--format ogg|wav]
#   --positions : « tireur » (c'est le joueur qui tire) ou distance en m avec « :angle » (° depuis l'axe du canon, 15 par défaut)
#   Les niveaux sont communs à tout l'export (un tir lointain est vraiment plus faible) ; le temps de vol n'est PAS inclus
#   (le moteur de jeu le gère), mais le claquement de la balle qui arrive avant le coup, si.
# Pré-requis : Python 3, playwright (Chromium), numpy, scipy, ffmpeg (pour l'ogg). Construire d'abord : python3 construire.py
import argparse, asyncio, json, os, re, subprocess, unicodedata, numpy as np
from scipy.io import wavfile
from playwright.async_api import async_playwright
H = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument("--sortie", default="armes_exportees"); ap.add_argument("--armes"); ap.add_argument("--lieu", default="Stand de tir (plein air)")
ap.add_argument("--positions", default="tireur,15,60,250"); ap.add_argument("--variantes", type=int, default=6); ap.add_argument("--actions", action="store_true")
ap.add_argument("--graves", type=float, default=0.6); ap.add_argument("--format", default="ogg"); a = ap.parse_args()
slug = lambda s: re.sub(r"[^a-z0-9]+", "_", unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()).strip("_")
JS = """async ([taches, lieu, graves]) => {
  const out = [], SR = 48000;
  for (const t of taches) {
    const ac = new OfflineAudioContext(2, Math.round(SR * t.duree), SR);
    const A = SonsDArmes.creer({ ac, lieu, retard: false, graves }); await A.pret; await A.charger(t.arme); await A.lieu(lieu);
    const ok = t.action ? A.action(t.arme, t.action, { quand: 0.01 }) : A.tirer(t.arme, Object.assign({ quand: 0.01 }, t.q));
    const b = await ac.startRendering(); out.push({ ok, L: Array.from(b.getChannelData(0)), R: Array.from(b.getChannelData(1)) });
  }
  return out;
}"""
async def main():
  os.makedirs(a.sortie, exist_ok=True)
  async with async_playwright() as p:
    br = await p.chromium.launch(); pg = await br.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto("file://" + os.path.join(H, "exemple_seul.html")); await pg.wait_for_timeout(300)
    B = await pg.evaluate("BANQUE_ARMES.json"); armes = [s.strip() for s in a.armes.split(",")] if a.armes else list(B["armes"])
    for n in armes:
      if n not in B["armes"]: raise SystemExit("Arme inconnue : " + n + "\nPossibles : " + ", ".join(B["armes"]))
    lieux = await pg.evaluate("Object.keys(Armes.LIEUX)")
    if a.lieu not in lieux: raise SystemExit("Lieu inconnu : " + a.lieu + "\nPossibles : " + ", ".join(lieux))
    taches = []
    for n in armes:
      expl = B["armes"][n].get("explosion")
      for pos in a.positions.split(","):
        pos = pos.strip()
        if pos == "tireur": q, nomp = ({"distance": 6} if expl else {}), ("6m" if expl else "tireur")
        else: d, _, an = pos.partition(":"); q = {"distance": float(d), "angle": float(an or 15)}; nomp = d + "m" + ("_" + an if an else "")
        for i in range(a.variantes): taches.append({"arme": n, "q": q, "cle": slug(n) + "_" + nomp, "duree": 5 if expl else 3.2})
      if a.actions:
        for act in B["armes"][n].get("actions", {}):
          for i in range(min(a.variantes, len(B["armes"][n]["actions"][act]) * 2)): taches.append({"arme": n, "action": act, "q": {}, "cle": slug(n) + "_" + act, "duree": 2.5})
    res = []
    for k in range(0, len(taches), 12): res += await pg.evaluate(JS, [taches[k:k + 12], a.lieu, a.graves])
    await br.close()
  if errs: print("erreurs JS :", errs)
  sons = []
  for t, r in zip(taches, res):
    x = np.stack([r["L"], r["R"]], 1).astype(np.float32); e = np.abs(x).max(1); th = e.max() * 3e-4
    fin = min(len(x), int(np.nonzero(e > th)[0][-1]) + 2400) if (e > th).any() else 4800; x = x[:fin]; f = min(len(x), 2400); x[-f:] *= np.linspace(1, 0, f)[:, None]
    sons.append((t["cle"], x, r["ok"]))
  pk = max(np.abs(x).max() for _, x, _ in sons); g = 10 ** (-1 / 20) / pk; man = {}; cpt = {}
  for cle, x, ok in sons:
    if not ok: print("pas joué :", cle); continue
    i = cpt[cle] = cpt.get(cle, -1) + 1; base = os.path.join(a.sortie, f"{cle}_{i}"); wavfile.write(base + ".wav", 48000, (np.clip(x * g, -1, 1) * 32767).astype(np.int16))
    fn = base + ".wav"
    if a.format != "wav": subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", fn, "-c:a", "libopus", "-b:a", "96k", base + ".ogg"], check=True); os.remove(fn); fn = base + ".ogg"
    man.setdefault(cle, []).append(os.path.basename(fn))
  json.dump(man, open(os.path.join(a.sortie, "manifeste.json"), "w"), indent=1, ensure_ascii=False)
  print("\n".join(f"{k} ×{len(v)}" for k, v in man.items())); print("→", a.sortie, "— lieu :", a.lieu, f"— gain commun {20 * np.log10(g):.1f} dB")
asyncio.run(main())
