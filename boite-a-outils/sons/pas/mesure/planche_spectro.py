# planche de spectrogrammes : python3 planche_spectro.py sortie.png fichiers.wav...
import sys, os, numpy as np, scipy.signal as sg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from mesures import lire, decoupe, SR
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
out, files = sys.argv[1], sys.argv[2:]; n = len(files); c = 3; r = (n + c - 1)//c
fig, axs = plt.subplots(r*2, c, figsize=(5*c, 3.3*r), gridspec_kw={"height_ratios": [1, 2]*r})
for k, f in enumerate(files):
    x = decoupe(lire(f))[:int(.4*SR)]; x = x/np.max(np.abs(x)); a0 = axs[(k//c)*2, k % c]; a1 = axs[(k//c)*2 + 1, k % c]
    t = np.arange(len(x))/SR*1000; a0.plot(t, x, lw=.5); a0.set_xlim(0, 400); a0.set_title(os.path.basename(f)[:34], fontsize=8); a0.set_yticks([])
    ff, tt, S = sg.spectrogram(x, SR, nperseg=512, noverlap=480); a1.pcolormesh(tt*1000, ff, 10*np.log10(S + 1e-14), vmin=10*np.log10(S.max()) - 70, shading="auto", cmap="magma")
    a1.set_yscale("symlog", linthresh=400); a1.set_ylim(40, 20000); a1.set_xlim(0, 400)
for k in range(n, r*c): axs[(k//c)*2, k % c].axis("off"); axs[(k//c)*2 + 1, k % c].axis("off")
fig.tight_layout(); fig.savefig(out, dpi=70)
