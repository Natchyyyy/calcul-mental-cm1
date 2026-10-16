# Mesures d'un bruit de pas, identiques pour les vrais enregistrements et pour nos synthèses, afin de les comparer.
# python3 mesures.py dossier_ou_fichiers...   → tableau + mesures.json (+ graphiques avec --png sortie.png)
import sys, os, json, glob, numpy as np, scipy.signal as sg
from scipy.io import wavfile

SR = 48000
TIERS = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000]

def lire(f):
    sr, x = wavfile.read(f); x = x.astype(np.float64)
    if x.ndim == 2: x = x.mean(axis=1)
    x /= (np.max(np.abs(x)) + 1e-12)
    if sr != SR: x = sg.resample_poly(x, SR, sr)
    return x

def enveloppe(x, ms=2.0):
    w = max(1, int(SR*ms/1000)); e = np.sqrt(np.convolve(x**2, np.ones(w)/w, "same")); return 20*np.log10(e + 1e-9)

def decoupe(x):
    """garde le pas : de 5 ms avant l'attaque jusqu'à −50 dB sous la crête d'enveloppe (ou la fin)"""
    e = enveloppe(x, 1.0); pk = e.max(); i0 = np.argmax(e > pk - 30); i0 = max(0, i0 - int(.005*SR))
    above = np.nonzero(e > pk - 50)[0]; i1 = above[-1] if len(above) else len(x)
    return x[i0:i1 + 1]

def tiers(x):
    f, P = sg.welch(x, SR, nperseg=min(4096, len(x)), noverlap=None, scaling="spectrum") if len(x) >= 256 else (None, None)
    # énergie par tiers d'octave (somme du spectre de puissance)
    n = 1 << int(np.ceil(np.log2(max(len(x), 4096)))); X = np.abs(np.fft.rfft(x*np.hanning(len(x)), n))**2; fr = np.fft.rfftfreq(n, 1/SR)
    out = []
    for fc in TIERS:
        lo, hi = fc/2**(1/6), fc*2**(1/6); out.append(X[(fr >= lo) & (fr < hi)].sum())
    out = np.array(out); return 10*np.log10(out/out.sum() + 1e-12)

def evenements(x):
    """pics de l'enveloppe (talon, pointe…) : temps (ms) et niveau (dB sous le max)"""
    e = enveloppe(x, 3.0); pk = e.max()
    idx, _ = sg.find_peaks(e, height=pk - 18, distance=int(.02*SR), prominence=5)
    return [(round((i - idx[0])/SR*1000) if len(idx) else 0, round(float(e[i] - pk), 1)) for i in idx]

def decroissance(x):
    e = enveloppe(x, 2.0); ip = np.argmax(e); pk = e[ip]; out = {}
    for d in (10, 20, 30, 40):
        k = np.nonzero(e[ip:] < pk - d)[0]; out[d] = round(k[0]/SR*1000, 1) if len(k) else None
    return out

def resonances(x):
    """fréquences qui « sonnent » : pics du spectre entre 5 et 120 ms après l'attaque, 70–4000 Hz"""
    e = enveloppe(x, 1.0); ip = np.argmax(e); seg = x[ip + int(.005*SR): ip + int(.12*SR)]
    if len(seg) < 1024: return []
    n = 16384; S = 20*np.log10(np.abs(np.fft.rfft(seg*np.hanning(len(seg)), n)) + 1e-9); fr = np.fft.rfftfreq(n, 1/SR)
    m = (fr > 70) & (fr < 4000); S2 = S.copy(); S2[~m] = -300
    idx, pr = sg.find_peaks(S2, prominence=6, distance=int(30/(SR/n)))
    best = sorted(zip(pr["prominences"], idx), reverse=True)[:6]
    return sorted([(round(float(fr[i])), round(float(S[i] - S[m].max()), 1)) for p, i in best])

def centroides(x):
    e = enveloppe(x, 1.0); ip = np.argmax(e)
    def c(seg):
        if len(seg) < 64: return None
        X = np.abs(np.fft.rfft(seg*np.hanning(len(seg)))); fr = np.fft.rfftfreq(len(seg), 1/SR); return round(float((fr*X**2).sum()/((X**2).sum() + 1e-12)))
    return c(x[max(0, ip - int(.002*SR)): ip + int(.01*SR)]), c(x[ip + int(.01*SR): ip + int(.08*SR)])

def mesurer(x):
    x = decoupe(x); x = x/np.max(np.abs(x))
    rms = np.sqrt(np.mean(x[:int(.05*SR)]**2)) if len(x) > int(.05*SR) else np.sqrt(np.mean(x**2))
    return {"duree_ms": round(len(x)/SR*1000), "tiers": [round(v, 1) for v in tiers(x)], "decroissance": decroissance(x),
            "evenements": evenements(x), "resonances": resonances(x), "centroide_attaque_suite": centroides(x),
            "crete_sur_rms": round(float(20*np.log10(1/rms)), 1)}

def resume(ms):
    """moyenne et écart des mesures d'un groupe de pas"""
    T = np.array([m["tiers"] for m in ms]); D = {d: [m["decroissance"][d] for m in ms if m["decroissance"][d] is not None] for d in (10, 20, 30, 40)}
    C = np.array([[v or 0 for v in m["centroide_attaque_suite"]] for m in ms])
    return {"n": len(ms), "tiers_moy": T.mean(0).round(1).tolist(), "tiers_ecart": T.std(0).round(1).tolist(),
            "decroissance_moy": {d: round(float(np.mean(v)), 1) if v else None for d, v in D.items()},
            "centroide_moy": C.mean(0).round().tolist(), "crete_sur_rms": round(float(np.mean([m["crete_sur_rms"] for m in ms])), 1)}

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]; png = None
    if "--png" in sys.argv: png = sys.argv[sys.argv.index("--png") + 1]; args = [a for a in args if a != png]
    files = []
    for a in args: files += sorted(glob.glob(os.path.join(a, "*.wav"))) if os.path.isdir(a) else [a]
    res = {}
    for f in files:
        m = mesurer(lire(f)); res[os.path.basename(f)] = m
        print(f"{os.path.basename(f):38s} {m['duree_ms']:4d} ms  décr {m['decroissance']}  évts {m['evenements']}  centr {m['centroide_attaque_suite']}  rés {m['resonances']}")
    R = resume(list(res.values()))
    print("\nMOYENNE tiers d'octave (dB rel.):"); print("  ".join(f"{f}:{v}" for f, v in zip(TIERS, R["tiers_moy"])))
    print("écart:", R["tiers_ecart"]); print("décroissance moy:", R["decroissance_moy"], "centroïdes:", R["centroide_moy"], "crête/rms:", R["crete_sur_rms"])
    json.dump({"fichiers": res, "resume": R}, open("mesures.json", "w"), indent=1)
    if png:   # profil moyen ± écart par tiers d'octave et enveloppes, pour voir d'un coup d'œil
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
        fig, ax = plt.subplots(1, 2, figsize=(11, 3.6)); m = np.array(R["tiers_moy"]); e = np.array(R["tiers_ecart"])
        ax[0].semilogx(TIERS, m, "o-"); ax[0].fill_between(TIERS, m - e, m + e, alpha=.25); ax[0].set_xlabel("Hz"); ax[0].set_ylabel("dB (relatif)"); ax[0].set_title(f"spectre moyen ({R['n']} pas)")
        for f in files:
            x = decoupe(lire(f)); x = x/np.max(np.abs(x)); ev = enveloppe(x, 2.0); ax[1].plot(np.arange(len(ev))/SR*1000, ev - ev.max(), lw=.7)
        ax[1].set_xlim(0, 300); ax[1].set_ylim(-60, 2); ax[1].set_xlabel("ms"); ax[1].set_title("enveloppes"); fig.tight_layout(); fig.savefig(png, dpi=80); print("image :", png)
