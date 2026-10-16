# Rend des bruitages décrits en Python (voir exemples.py) → fichiers .ogg (Opus) + manifeste.json
# usage : python3 fabriquer.py MODULE [--sortie dossier] [--seulement nom1,nom2] [--debit 40]
#   MODULE : un fichier .py à côté (sans « .py ») qui définit S = {nom: (fonction(i) -> signal, nb_variantes, niveau_rms_dB)}
#            et, s'il le faut, STEREO = {noms à garder en stéréo}
# Chaque son est : coupé en fin de silence, mis au niveau moyen demandé (rms des 300 ms les plus fortes, crête ≤ −1 dBFS),
# fondu en entrée/sortie, puis encodé. Un .wav est gardé à côté pour l'analyse.
import sys, os, json, importlib, argparse, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.getcwd())
from dsp import *
ap = argparse.ArgumentParser(); ap.add_argument("module"); ap.add_argument("--sortie", default="sons_out"); ap.add_argument("--seulement", default=None); ap.add_argument("--debit", type=int, default=40)
a = ap.parse_args(); only = a.seulement.split(",") if a.seulement else None
os.makedirs(a.sortie, exist_ok=True); mp = os.path.join(a.sortie, "manifeste.json"); man = json.load(open(mp)) if os.path.exists(mp) else {}
M = importlib.import_module(a.module); st = getattr(M, "STEREO", set())
for name, (fn, n, rms) in M.S.items():
    if only and name not in only: continue
    files = []
    for i in range(n):
        x = fn(i); x = trim(x); x = normalize(x, -1.0, rms)
        x = fade(x, .001, .02) if x.ndim == 1 else np.stack([fade(c, .001, .02) for c in x])
        f = write(f"{name}_{i}", x, a.sortie, mono=None if name in st else True, br=a.debit); files.append(os.path.basename(f))
        c = check(x); print(f"{name}_{i}", c, os.path.getsize(f), "o", "⚠ saut brusque (clic ?)" if c["maxjump"] > .5 else "", flush=True)
    man[name] = files
json.dump(man, open(mp, "w"), indent=1)
print("total", len(man), "sons,", round(sum(os.path.getsize(os.path.join(a.sortie, f)) for v in man.values() for f in v)/1024), "Ko")
