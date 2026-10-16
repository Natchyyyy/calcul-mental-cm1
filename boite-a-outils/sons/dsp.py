# Petite boîte à outils de synthèse sonore « hors ligne » (numpy/scipy) pour les bruitages de l'appli.
# Tout est rendu en 48 kHz, en flottant, puis exporté en Opus (ogg) par ffmpeg.
import numpy as np, scipy.signal as sg, subprocess, os, json, base64

SR = 48000
rng = np.random.default_rng(1234)

def seed(s):
    rng.bit_generator.state = np.random.default_rng(s).bit_generator.state   # en place : les modules qui ont importé rng suivent

def t_(dur):
    return np.arange(int(dur*SR))/SR

def silence(dur):
    return np.zeros(int(dur*SR))

def noise(dur, color="white"):
    n = rng.standard_normal(int(dur*SR))
    if color == "pink":   # filtre de Voss approché (−3 dB/oct)
        b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]; a = [1, -2.494956002, 2.017265875, -0.522189400]
        n = sg.lfilter(b, a, n); n /= np.std(n) + 1e-9
    elif color == "brown":
        n = np.cumsum(n); n = sg.lfilter([1, -1], [1, -.995], n); n /= np.std(n) + 1e-9
    return n

def env_ad(n, att, dec, curve=4.0):
    """attaque linéaire puis décroissance exponentielle (dec = temps pour −60 dB)"""
    t = np.arange(n)/SR; a = np.clip(t/max(att, 1e-4), 0, 1)
    d = np.exp(-6.9*np.clip(t - att, 0, None)/max(dec, 1e-4))
    return a*d

def fade(x, fi=.002, fo=.01):
    x = x.copy(); n1 = max(1, int(fi*SR)); n2 = max(1, int(fo*SR))
    x[:n1] *= np.linspace(0, 1, n1)**2; x[-n2:] *= np.linspace(1, 0, n2)**2
    return x

def bp(x, lo, hi, order=2):
    sos = sg.butter(order, [max(lo, 10), min(hi, SR/2*.98)], "bandpass", fs=SR, output="sos"); return sg.sosfilt(sos, x)
def lp(x, f, order=2):
    sos = sg.butter(order, min(f, SR/2*.98), "lowpass", fs=SR, output="sos"); return sg.sosfilt(sos, x)
def hp(x, f, order=2):
    sos = sg.butter(order, max(f, 10), "highpass", fs=SR, output="sos"); return sg.sosfilt(sos, x)
def peak(x, f, q, gain_db):
    A = 10**(gain_db/40); w = 2*np.pi*f/SR; al = np.sin(w)/(2*q)
    b = [1 + al*A, -2*np.cos(w), 1 - al*A]; a = [1 + al/A, -2*np.cos(w), 1 - al/A]
    return sg.lfilter(np.array(b)/a[0], np.array(a)/a[0], x)

def resonator(x, f, q):
    """filtre résonant (corps d'un objet frappé)"""
    w = 2*np.pi*f/SR; r = np.exp(-w/(2*q)); b = [1 - r]; a = [1, -2*r*np.cos(w), r*r]
    return sg.lfilter(b, a, x)

def sweep_lp(x, f0, f1):
    """passe-bas dont la coupure glisse de f0 à f1 (par blocs)"""
    out = np.zeros_like(x); B = 256; zi = None
    for i in range(0, len(x), B):
        k = i/max(1, len(x)); f = f0*(f1/f0)**k
        b, a = sg.butter(2, min(f, SR/2*.95), "lowpass", fs=SR)
        if zi is None: zi = sg.lfilter_zi(b, a)*0
        out[i:i+B], zi = sg.lfilter(b, a, x[i:i+B], zi=zi)
    return out

def sweep_bp(x, f0, f1, q=2.0):
    out = np.zeros_like(x); B = 256; zi = None
    for i in range(0, len(x), B):
        k = i/max(1, len(x)); f = f0*(f1/f0)**k
        b, a = sg.iirpeak(min(f, SR/2*.95), q, fs=SR)
        if zi is None: zi = np.zeros(2)
        out[i:i+B], zi = sg.lfilter(b, a, x[i:i+B], zi=zi)
    return out

def modal(dur, modes, strike=1.0, att=.0015, hard=.5):
    """synthèse modale : modes = [(fréquence, amplitude, temps de décroissance −60 dB)], plus le bruit du coup"""
    n = int(dur*SR); t = np.arange(n)/SR; y = np.zeros(n)
    for f, a, d in modes:
        if f >= SR/2*.95: continue
        ph = rng.uniform(0, 2*np.pi); det = 1 + rng.normal(0, .0007)
        y += a*np.sin(2*np.pi*f*det*t + ph)*np.exp(-6.9*t/d)
    y *= np.clip(t/att, 0, 1)
    # petit bruit d'impact (le maillet ou la baguette), plus vif si « hard »
    k = noise(.03)*env_ad(int(.03*SR), .0006, .006 + .014*(1 - hard))
    k = bp(k, 250 + 2200*hard, 1800 + 9000*hard**1.5)
    y[:len(k)] += k*strike*(.08 + .17*hard)
    return y

def marimba(f, dur=1.4, vel=1.0, soft=.5):
    # barre de marimba : partiels ≈ 1, 4, 9.9 (accordés), les aigus s'éteignent vite ; tube résonateur sur le fondamental
    d0 = 1.1*(440/f)**.35
    modes = [(f, 1.0, d0), (f*3.99, .28*(1 - .6*soft)*vel, d0*.22), (f*9.85, .07*(1 - .7*soft)*vel, d0*.08), (f*2.0, .04, d0*.4)]
    y = modal(dur, modes, strike=.5 + .5*vel, hard=.25 + .3*(1 - soft))
    y += .35*resonator(y, f, 60)*np.exp(-np.arange(len(y))/SR/(d0*.6))
    return y*vel

def xylo(f, dur=1.0, vel=1.0):
    d0 = .55*(440/f)**.3
    modes = [(f, 1.0, d0), (f*3.0, .42, d0*.4), (f*6.0, .12, d0*.18), (f*9.2, .05, d0*.1)]
    return modal(dur, modes, strike=1.0, hard=.85)*vel

def glock(f, dur=2.2, vel=1.0):
    # barre libre (glockenspiel / célesta) : partiels inharmoniques 1, 2.76, 5.40, 8.93
    d0 = 2.2*(880/f)**.3
    modes = [(f, 1.0, d0), (f*2.756, .32, d0*.45), (f*5.404, .12, d0*.22), (f*8.933, .05, d0*.12)]
    return modal(dur, modes, strike=.7, hard=.7)*vel

def celesta(f, dur=1.8, vel=1.0):
    d0 = 1.3*(880/f)**.3
    modes = [(f, 1.0, d0), (f*2.0, .35, d0*.5), (f*3.0, .1, d0*.3), (f*4.02, .05, d0*.2)]
    return modal(dur, modes, strike=.4, hard=.55)*vel

def bell(f, dur=3.0, vel=1.0):
    # petite cloche : hum, fondamental, tierce mineure, quinte, octave…
    d0 = 2.8*(600/f)**.4
    modes = [(f*.5, .35, d0*1.3), (f, 1.0, d0), (f*1.19, .45, d0*.8), (f*1.5, .3, d0*.6), (f*2.0, .35, d0*.5), (f*2.51, .15, d0*.35), (f*3.0, .08, d0*.25)]
    return modal(dur, modes, strike=.6, hard=.8)*vel

def metal_modes(f0, n=14, spread=2.3, dec=.8, seedv=0):
    r = np.random.default_rng(seedv); out = []
    for i in range(n):
        f = f0*(1 + i*spread*r.uniform(.6, 1.4))**1.06
        out.append((f, r.uniform(.2, 1.0)/(1 + i*.25), dec*r.uniform(.3, 1.0)/(1 + i*.12)))
    return out

def note(n):   # numéro MIDI → Hz
    return 440*2**((n - 69)/12)

def place(dst, src, at, gain=1.0):
    i = max(0, int(at*SR)); n = min(len(src), len(dst) - i)
    if n > 0: dst[i:i+n] += src[:n]*gain
    return dst

def stereo(x, pan=0.0, width=0.0, delay_ms=0.0):
    """pan −1…1 ; width = petite décorrélation (Haas) pour donner de l'espace"""
    L = x*np.cos((pan + 1)*np.pi/4); R = x*np.sin((pan + 1)*np.pi/4)
    if width > 0:
        d = int(SR*delay_ms/1000) or int(SR*.0007)
        R = (1 - width)*R + width*np.concatenate([np.zeros(d), R[:-d]])
    return np.stack([L, R])

_IR = {}
def ir(kind="room", dur=None):
    """réponse impulsionnelle synthétique stéréo : premières réflexions + queue diffuse qui s'assombrit"""
    if kind in _IR: return _IR[kind]
    P = {"room": (.55, 4500, .012), "hall": (1.9, 3200, .022), "small": (.28, 6000, .006), "plate": (1.2, 7000, .0), "outdoor": (.9, 2500, .03)}[kind]
    T, fc, pre = P; r = np.random.default_rng(99); n = int((T*1.2 + pre)*SR); t = np.arange(n)/SR
    out = []
    for ch in range(2):
        tail = r.standard_normal(n)*np.exp(-6.9*t/T)
        # assombrissement progressif (les aigus meurent plus vite)
        hi = hp(tail, fc)*np.exp(-6.9*t/(T*.35)); lo = lp(tail, fc)
        tail = lo + hi
        tail *= np.clip((t - pre)/.004, 0, 1)
        er = np.zeros(n)
        for k in range(24):   # premières réflexions : petits paquets adoucis (pas des impulsions sèches, qui sonnent « métallique »)
            d = pre*.3 + r.uniform(.003, .04 if kind != "hall" else .07); a = r.uniform(.15, .45)*(.9**k)
            i = int(d*SR); m = int(.0015*SR)
            if i + m < n: er[i:i+m] += a*np.hanning(m)*(1 if r.random() < .5 else -1)
        er = lp(er, fc*1.2)
        out.append(tail*.5 + er*.6)
    y = np.stack(out); y /= np.sqrt(np.sum(y**2)/2)
    _IR[kind] = y; return y

def reverb(x, kind="room", wet=.2, predelay=0.0):
    """x mono ou stéréo (2, n) → stéréo (2, n + queue)"""
    if x.ndim == 1: x = np.stack([x, x])
    h = ir(kind); n = x.shape[1] + h.shape[1]
    wetsig = np.zeros((2, n))
    for c in range(2):
        w = sg.fftconvolve(x[c], h[c]); wetsig[c, :len(w)] += w
    if predelay > 0:
        d = int(predelay*SR); wetsig = np.concatenate([np.zeros((2, d)), wetsig[:, :-d]], axis=1)
    dry = np.zeros((2, n)); dry[:, :x.shape[1]] = x
    return dry*(1 - wet*.5) + wetsig*wet*.12

def trim(x, thresh_db=-62, keep=.02):
    """coupe le silence de fin (garde « keep » s) et fait un fondu"""
    a = np.max(np.abs(x), axis=0) if x.ndim == 2 else np.abs(x)
    lim = np.max(a)*10**(thresh_db/20); idx = np.nonzero(a > lim)[0]
    end = min(len(a), (idx[-1] if len(idx) else len(a) - 1) + int(keep*SR))
    x = x[..., :end]
    n2 = min(int(.03*SR), x.shape[-1]//3); w = np.linspace(1, 0, n2)**2
    x[..., -n2:] *= w
    return x

def soft_clip(x, drive=1.0):
    return np.tanh(x*drive)/np.tanh(drive)

def normalize(x, peak_db=-1.0, rms_db=None):
    """met au niveau : soit un crête cible, soit un niveau moyen (rms des 300 ms les plus forts) sans dépasser la crête"""
    p = np.max(np.abs(x)) + 1e-12
    if rms_db is not None:
        m = x if x.ndim == 1 else np.mean(x, axis=0)
        w = int(.3*SR); e = np.convolve(m**2, np.ones(w)/w, "same"); r = np.sqrt(np.max(e)) + 1e-12
        g = 10**(rms_db/20)/r
        if p*g > 10**(peak_db/20): g = 10**(peak_db/20)/p
    else:
        g = 10**(peak_db/20)/p
    return x*g

def write(name, x, outdir, mono=None, br=64):
    """écrit wav + opus ; renvoie le nom du fichier opus"""
    os.makedirs(outdir, exist_ok=True)
    if x.ndim == 1: x = x[None, :]
    if mono is None: mono = x.shape[0] == 1 or np.max(np.abs(x[0] - x[1])) < 1e-4
    if mono and x.shape[0] == 2: x = x.mean(axis=0, keepdims=True)
    x = np.clip(x, -1, 1)
    import wave
    wav = os.path.join(outdir, name + ".wav"); pcm = (x.T*32767).astype(np.int16)
    with wave.open(wav, "wb") as w:
        w.setnchannels(x.shape[0]); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    og = os.path.join(outdir, name + ".ogg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libopus", "-b:a", f"{br if x.shape[0] == 1 else br + 24}k", "-vbr", "on", "-application", "audio", og], check=True)
    return og

def check(x):
    """quelques mesures pour repérer les défauts : crête, clics (sauts d'un échantillon à l'autre), durée"""
    m = x if x.ndim == 1 else x[0]
    d = np.abs(np.diff(m)); jump = float(np.max(d)); p = float(np.max(np.abs(x)))
    return {"dur": round(x.shape[-1]/SR, 3), "peak": round(p, 3), "maxjump": round(jump, 3), "start": round(float(abs(m[0])), 4), "end": round(float(abs(m[-1])), 4)}
