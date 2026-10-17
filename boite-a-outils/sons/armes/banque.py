# Fabrique la banque de VRAIS sons d'armes (Free Firearm Sound Library, CC0 ; explosions CDDA-Soundpacks) pour le lecteur :
# chaque tir est découpé, nettoyé, mesuré (niveau, claquement de balle avant le coup), et encodé en .ogg.
# usage : python3 banque.py dossier_mono_48k dossier_stereo_48k dossier_explosions sortie/
import sys, os, json, subprocess, numpy as np, scipy.signal as sg
from scipy.io import wavfile
SR = 48000
MONO, STEREO, EXPL, OUT = sys.argv[1:5]; os.makedirs(OUT, exist_ok=True)

ARMES = {
  "Pistolet 9 mm": {"court": "9mm", "tireur": ["X_38", "X_40"], "proche": ["X_39", "X_41"], "moyen": ["X_30", "X_32"], "loin": ["X_31", "X_33"],
    "actions": {"culasse": ["X_21"], "chargeur": ["X_5", "X_4"], "clic": ["X_18", "X_19"]}},
  "Pistolet-mitrailleur 9 mm": {"court": "pm9", "tireur": ["G_26", "G_32"], "proche": ["G_25", "G_31"], "moyen": ["G_14", "G_20"], "loin": ["G_13", "G_19"],
    "actions": {"culasse": ["G_10"], "chargeur": ["G_9", "G_8"], "clic": ["X_19"]}},
  "Fusil d'assaut 5,56": {"court": "556", "tireur": ["D_27", "D_29"], "proche": ["D_31", "D_32"], "moyen": ["D_23", "D_24"], "loin": ["D_25", "D_26"],
    "actions": {"culasse": ["D_14", "D_13"], "chargeur": ["D_5", "D_4"], "clic": ["D_16"]}},
  "Fusil d'assaut 7,62×39": {"court": "762", "tireur": ["C_39", "C_42", "U_13", "U_15"], "proche": ["C_25", "C_28", "U_12", "U_14"], "moyen": ["C_31"], "loin": ["C_17"],
    "actions": {"culasse": ["C_2", "U_3"], "chargeur": ["C_11", "C_10"], "clic": ["C_7", "U_6"]}},
  "Fusil de précision 7,62×54": {"court": "76254", "tireur": ["M_20", "M_22"], "proche": ["M_19", "M_21"], "moyen": ["M_24", "M_26"], "loin": ["M_23", "M_25"],
    "actions": {"verrou": ["M_14"], "clic": ["M_10"]}},
  "Fusil à pompe 12": {"court": "pompe", "tireur": ["O_18", "O_20", "K_19", "K_21", "H_18", "H_20"], "proche": ["O_19", "O_21", "K_20", "K_22", "H_19", "H_21"],
    "moyen": ["O_14", "O_16"], "loin": ["O_15", "O_17", "K_18", "H_17"],
    "actions": {"pompe": ["O_6", "H_6"], "cartouche": ["O_7"], "clic": ["O_8", "H_8"]}},
}
MAXV = {"tireur": 6, "proche": 6, "moyen": 4, "loin": 4}

def lire(d, f):
  sr, x = wavfile.read(os.path.join(d, f + ".wav")); x = x.astype(np.float64)
  assert sr == SR, f; return x
def env(m, ms):
  w = max(1, int(SR * ms / 1000)); return 10 * np.log10(np.convolve(m ** 2, np.ones(w) / w, "same") + 1e-15)
def coups(m):
  """indices d'attaque des tirs : on part de chaque maximum et on remonte au plus 15 ms (jusqu'à 3 % du maximum)"""
  e = env(m, 0.5); pk = e.max(); idx, _ = sg.find_peaks(e, height=pk - 12, distance=int(1.0 * SR), prominence=20); res = []
  for i in idx:
    j0 = max(0, i - int(0.015 * SR)); seg = np.abs(m[j0:i + int(0.002 * SR)]); p = seg.max(); k = np.argmax(seg > 0.0316 * p); res.append(j0 + k)
  return res
def ogg(nom, x):
  w = os.path.join(OUT, nom + ".wav"); y = np.clip(x, -1, 1); wavfile.write(w, SR, y.astype(np.float32))
  o = os.path.join(OUT, nom + ".ogg"); br = "96k" if y.ndim == 2 else "64k"
  subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", w, "-c:a", "libopus", "-b:a", br, o], check=True); os.remove(w); return os.path.basename(o)
def niveau(m, a, b):   # niveau (dB) de la partie forte : moyenne quadratique sur 50 ms
  return float(10 * np.log10(np.mean(m[a:b] ** 2) + 1e-15))

banque = {"source": "Free Firearm Sound Library (buddingmonkey, CC0) ; explosions : CDDA-Soundpacks (j1987 et unfa CC0, bmlake CC BY 3.0)", "armes": {}}
for nom, A in ARMES.items():
  ent = {"court": A["court"], "tirs": {}, "actions": {}}
  for pos in ("tireur", "proche", "moyen", "loin"):
    L = []
    for f in A[pos]:
      st = pos == "tireur"; x = lire(STEREO if st else MONO, f); m = x.mean(1) if x.ndim == 2 else x
      cs = coups(m)
      for k, i in enumerate(cs):
        if len([v for v in L if v["src"].startswith(f)]) >= 3: break
        pre = m[max(0, i - int(0.4 * SR)):max(0, i - int(0.01 * SR))]
        if len(pre) and 10 * np.log10(np.mean(pre ** 2) + 1e-15) - 20 * np.log10(np.abs(m[i:i + 2400]).max()) > -45: continue   # bruit avant le tir
        fin = min(len(m), i + int(1.6 * SR)); nxt = [c for c in cs if c > i]
        if nxt: fin = min(fin, nxt[0] - int(0.05 * SR))
        if fin - i < int(0.6 * SR): continue
        a = max(0, i - int(0.003 * SR)); seg = x[a:fin].copy(); n = len(seg)
        fo = int(0.15 * SR); r = np.linspace(1, 0, fo) ** 2; seg[-fo:] *= r[:, None] if seg.ndim == 2 else r
        ms = seg.mean(1) if seg.ndim == 2 else seg
        # claquement de balle avant le coup (micro devant le tireur) : le coup = le plus fort sur 3 ms dans les 80 premières ms
        e3 = env(ms[:int(0.08 * SR)], 3); b = int(np.argmax(e3)); b0 = max(0, b - int(0.0025 * SR))
        claque = b0 > int(0.006 * SR) and np.abs(ms[:b0 - int(0.002 * SR)]).max() > 0.08 * np.abs(ms).max()
        blast = b0 / SR if claque else 0.0
        p = np.abs(seg).max(); seg = seg / p * 0.89
        ms = seg.mean(1) if seg.ndim == 2 else seg; ib = int(blast * SR)
        v = {"src": f"{f}#{k}", "f": ogg(f"{A['court']}_{pos}_{len(L)}", seg), "niveau": round(niveau(ms, ib, ib + int(0.05 * SR)), 2),
             "coup_s": round(blast, 4), "claque": bool(claque), "duree": round(n / SR, 3), "stereo": bool(st)}
        L.append(v)
        if len(L) >= MAXV[pos]: break
      if len(L) >= MAXV[pos]: break
    ent["tirs"][pos] = L; print(nom, pos, len(L), [(v["src"], v["claque"], v["niveau"]) for v in L])
  for q, fs in A["actions"].items():
    L = []
    for f in fs:
      x = lire(MONO, f); e = env(x, 5); pk = e.max(); act = e > pk - 45
      # régions d'activité séparées par plus de 0,4 s de calme : une prise par région
      i = 0; n = len(x)
      while i < n and len(L) < 4:
        while i < n and not act[i]: i += 1
        if i >= n: break
        j = i; calme = 0
        while j < n and calme < int(0.4 * SR): calme = calme + 1 if not act[j] else 0; j += 1
        a, b = max(0, i - int(0.02 * SR)), min(n, j - calme + int(0.15 * SR))
        if b - a > int(0.05 * SR) and e[i:j].max() > pk - 12:
          seg = x[a:b].copy(); fo = min(len(seg) // 4, int(0.08 * SR)); seg[-fo:] *= np.linspace(1, 0, fo) ** 2
          seg = seg / np.abs(seg).max() * 0.89; L.append({"src": f, "f": ogg(f"{A['court']}_{q}_{len(L)}", seg), "duree": round(len(seg) / SR, 3)})
        i = j
    ent["actions"][q] = L; print("   action", q, len(L))
  banque["armes"][nom] = ent
# explosions
EX = {"Grenade à main": [("explosion_small_explosion_small", "j1987, CC0"), ("explosion_default_explosion_default_1", "bmlake, CC BY 3.0"), ("explosion_default_explosion_default_2", "bmlake, CC BY 3.0")],
      "Explosion lourde": [("explosion_huge_explosion_huge_1", "unfa, CC0"), ("explosion_huge_explosion_huge_2", "unfa, CC0")]}
for nom, fs in EX.items():
  L = []
  for f, lic in fs:
    sr, x = wavfile.read(os.path.join(EXPL, f + ".wav")); x = x.astype(np.float64)
    if x.dtype != np.float64 or np.abs(x).max() > 2: x = x / 32768.0
    if sr != SR: x = sg.resample_poly(x, SR, sr, axis=0)
    m = x.mean(1) if x.ndim == 2 else x; e = env(m, 1); i = int(np.argmax(e > e.max() - 30)); a = max(0, i - int(0.005 * SR))
    seg = m[a:]; seg = seg / np.abs(seg).max() * 0.89
    L.append({"src": f, "licence": lic, "f": ogg(("grenade" if "Grenade" in nom else "lourde") + f"_{len(L)}", seg), "niveau": round(niveau(seg, 0, int(0.05 * SR)), 2), "coup_s": 0, "claque": False, "duree": round(len(seg) / SR, 3), "stereo": False})
  banque["armes"][nom] = {"court": "grenade" if "Grenade" in nom else "lourde", "explosion": True, "tirs": {"proche": L}, "actions": {}}
  print(nom, len(L))
json.dump(banque, open(os.path.join(OUT, "banque.json"), "w"), ensure_ascii=False, indent=1)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)); print("total", round(tot / 1e6, 2), "Mo,", len(os.listdir(OUT)) - 1, "fichiers")
