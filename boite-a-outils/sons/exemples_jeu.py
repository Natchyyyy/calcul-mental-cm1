# Bruitages du jeu : clic, bonne / mauvaise réponse, combo, victoire, niveau, pièce, bulle, roulement + les 6 packs
from dsp import *

STEREO = {"win", "level", "laser_good", "laser_combo"} | {f"case_r{r}" for r in range(7)}
S = {}   # nom -> (fonction(i) -> signal, nb de variantes, niveau rms visé dB)
def snd(name, n=1, rms=-20):
    def deco(f): S[name] = (f, n, rms); return f
    return deco

# ---------- clic d'interface : petit « toc » de bois, doux ----------
@snd("tap", 4, -30)
def tap(i):
    seed(10 + i); f = 1750 + 140*i + rng.uniform(-40, 40)
    y = modal(.09, [(f, 1, .028), (f*2.31, .35, .012), (f*3.86, .16, .006), (f*.52, .25, .02)], strike=.6, hard=.45)
    th = resonator(noise(.03)*env_ad(int(.03*SR), .0005, .012), 260, 4)*1.5
    y[:len(th)] += th
    y = lp(y, 7500); y = reverb(y, "small", .10)
    return y

# ---------- pack « classique » : marimba ----------
def chord_seq(inst, notes, gap, dur, vel=1.0, kind="room", wet=.18, **kw):
    out = silence(dur)
    for k, n in enumerate(notes):
        v = vel*(1 if k < len(notes) - 1 else 1.08)
        place(out, inst(note(n), dur - k*gap, v, **kw) if kw else inst(note(n), dur - k*gap, v), k*gap)
    return reverb(out, kind, wet)

@snd("good", 3, -21)
def good(i):
    seed(20 + i); g = .085 + .01*i
    return chord_seq(marimba, [76, 81], g, 1.3, .95, wet=.2, soft=.35)

@snd("bad", 2, -23)
def bad(i):
    # deux notes graves étouffées (main posée sur la lame) : « bom-bom » gentil, pas une alarme
    seed(30 + i); out = silence(.9)
    for k, (n, v) in enumerate([(57, 1.0), (53, .95)]):
        y = marimba(note(n), .9 - k*.13, v, soft=.95); t = t_(len(y)/SR)
        y *= np.exp(-t/.16)            # étouffé
        place(out, y, k*.13 + .005*i)
    out = lp(out, 2500)
    return reverb(out, "room", .16)

@snd("combo", 2, -20)
def combo(i):
    seed(40 + i); out = silence(1.5)
    for k, n in enumerate([76, 81, 85]): place(out, marimba(note(n), 1.3, 1.0 if k < 2 else 1.08, soft=.3), k*.07)
    place(out, glock(note(100), 1.0, .22), .21)
    return reverb(out, "room", .2)

@snd("win", 1, -19)
def win(i):
    seed(50); out = silence(2.6)
    for k, n in enumerate([72, 76, 79, 84]):
        place(out, glock(note(n), 2.4, .9), k*.12); place(out, marimba(note(n - 12), 1.4, .55, soft=.4), k*.12)
    place(out, glock(note(88), 2.0, .6), 4*.12)
    # nappe douce qui porte l'accord final
    t = t_(2.0); pad = sum(np.sin(2*np.pi*note(n)*t*(1 + d)) for n in [60, 64, 67, 72] for d in (-.002, .002))
    pad *= np.clip(t/.35, 0, 1)*np.exp(-t/.9)*.05; place(out, lp(pad, 2500), .36)
    return reverb(out, "hall", .28)

@snd("level", 1, -18)
def level(i):
    seed(60); out = silence(3.0)
    seqn = [67, 72, 76, 79, 84]
    for k, n in enumerate(seqn):
        place(out, xylo(note(n), 1.2, .8), k*.095); place(out, glock(note(n + 12), 1.8, .35), k*.095)
    place(out, bell(note(84), 2.6, .7), 5*.095); place(out, glock(note(91), 2.2, .45), 5*.095 + .02)
    # pluie d'étincelles (pentatonique, aigu)
    pent = [96, 98, 100, 103, 105, 108]
    for k in range(9): place(out, glock(note(pent[rng.integers(0, 6)]), .7, .12 + .06*rng.random()), .62 + k*.045 + rng.uniform(0, .015))
    return reverb(out, "hall", .3)

@snd("coin", 3, -22)
def coin(i):
    seed(70 + i); out = silence(.9)
    for k, f0 in enumerate([2650, 3520]):
        f0 *= rng.uniform(.98, 1.02)
        y = modal(.8, [(f0, 1, .45), (f0*2.42, .5, .3), (f0*4.1, .25, .18), (f0*5.6, .12, .1), (f0*1.53, .2, .2)], strike=.8, hard=.9)
        place(out, y, k*.075)
    out = hp(out, 900)
    return reverb(out, "room", .18)

@snd("pop", 3, -22)
def pop(i):
    # bulle : petite sinusoïde dont la hauteur monte très vite en s'éteignant (comme une vraie bulle d'eau)
    seed(80 + i); out = silence(.3)
    for k in range(2):
        f0 = rng.uniform(420, 560)*(1.6 if k else 1); d = .05 + .02*rng.random(); t = t_(d*3)
        f = f0*(1 + 9*t); ph = 2*np.pi*np.cumsum(f)/SR
        y = np.sin(ph)*np.exp(-6.9*t/d)*np.clip(t/.0015, 0, 1)
        place(out, y*(1 if k == 0 else .45), k*rng.uniform(.035, .06))
    return reverb(lp(out, 6000), "small", .12)

def snare_hit(v=1.0, tone=190):
    d = .25; t = t_(d)
    body = (np.sin(2*np.pi*tone*t) + .5*np.sin(2*np.pi*tone*1.72*t))*np.exp(-t/.035)
    wires = bp(noise(d), 1800, 9000)*np.exp(-t/.07)
    stick = bp(noise(d), 3000, 12000)*np.exp(-t/.004)
    y = (.6*body + .55*wires + .3*stick)*np.clip(t/.0008, 0, 1)
    return y*v

@snd("drum", 1, -20)
def drum(i):
    seed(90); out = silence(1.5)
    for k in range(13):
        v = (.45 + .55*k/12)*(1 if k % 2 == 0 else .82)*rng.uniform(.92, 1.05)
        place(out, snare_hit(v, 185 + rng.uniform(-8, 8)), k*.085 + rng.uniform(-.004, .004))
    return reverb(out, "room", .2)

# ---------- pack « xylo » ----------
@snd("xylo_good", 2, -21)
def xg(i): seed(100 + i); return chord_seq(xylo, [84, 88], .1, 1.0, .9, wet=.18)
@snd("xylo_bad", 2, -23)
def xb(i):
    seed(110 + i); out = silence(.8)
    for k, n in enumerate([72, 71]):
        y = xylo(note(n), .8 - k*.15, .85); y *= np.exp(-t_(len(y)/SR)/.18); place(out, y, k*.15)
    return reverb(lp(out, 4000), "room", .16)
@snd("xylo_combo", 1, -20)
def xc(i): seed(120); return chord_seq(xylo, [84, 88, 91, 96], .08, 1.3, .9, wet=.2)

# ---------- pack « rétro » (8 bits, voulu, mais propre) ----------
def square(f, dur, duty=.5, vel=1.0, dec=None):
    t = t_(dur); y = np.zeros_like(t)
    for k in range(1, 40):
        if f*k > 16000: break
        y += np.sin(np.pi*k*duty)/k*np.cos(2*np.pi*f*k*t)   # série de Fourier : pas d'aliasing
    e = np.clip(t/.003, 0, 1)*(np.exp(-t/dec) if dec else np.clip((dur - t)/.02, 0, 1))
    return y*e*vel*.5

def chip(notes, gap, dur, duty=.5):
    out = silence(gap*len(notes) + dur)
    for k, n in enumerate(notes): place(out, square(note(n), dur, duty, 1, dur*.5), k*gap)
    return reverb(out, "small", .08)
@snd("retro_good", 1, -24)
def rg(i): return chip([83, 88], .075, .16, .5)
@snd("retro_bad", 1, -25)
def rb(i): return chip([67, 64, 60], .12, .17, .25)
@snd("retro_combo", 1, -24)
def rc(i): return chip([72, 76, 79, 84, 88], .065, .13, .5)

# ---------- pack « laser » ----------
def zap(f0, f1, dur, vel=1.0, grit=0.0):
    t = t_(dur); f = f0*(f1/f0)**(t/dur); ph = 2*np.pi*np.cumsum(f)/SR
    y = np.sin(ph + 2.2*np.sin(ph*1.5)*np.exp(-t/(dur*.4)))   # FM qui s'adoucit
    y += grit*np.sign(np.sin(ph*.5))*.25
    y *= np.clip(t/.002, 0, 1)*np.exp(-t/(dur*.45))
    return lp(y, 9000)*vel
@snd("laser_good", 2, -23)
def lg(i): seed(130 + i); return reverb(stereo(zap(1500*(1 + .04*i), 280, .26), -.2, .4), "plate", .25)
@snd("laser_bad", 1, -24)
def lb(i): return reverb(zap(180, 55, .45, 1, .6), "plate", .2)
@snd("laser_combo", 1, -22)
def lc(i):
    out = np.zeros((2, int(.8*SR)))
    for k, p in enumerate([-.5, 0, .5]):
        z = stereo(zap(1600 + 150*k, 260, .2), p); out[:, int(k*.12*SR):int(k*.12*SR) + z.shape[1]] += z
    return reverb(out, "plate", .25)

# ---------- pack « oiseau » ----------
def chirp(f0, f1, dur, vel=1.0):
    t = t_(dur); f = f0 + (f1 - f0)*(t/dur)**.7 + 140*np.sin(2*np.pi*34*t)
    ph = 2*np.pi*np.cumsum(f)/SR; e = np.sin(np.pi*np.clip(t/dur, 0, 1))**1.5
    return (np.sin(ph) + .12*np.sin(2*ph))*e*vel
def hoo(f0, f1, dur, vel=1.0):
    # cri de hibou : son rond, souffle léger, hauteur qui retombe un peu
    t = t_(dur); f = f0 + (f1 - f0)*(t/dur) + 3*np.sin(2*np.pi*5.5*t); ph = 2*np.pi*np.cumsum(f)/SR
    y = np.sin(ph) + .18*np.sin(2*ph) + .05*np.sin(3*ph)
    br = bp(noise(dur), f0*.8, f0*3)*.12
    e = np.clip(t/.05, 0, 1)*np.clip((dur - t)/.12, 0, 1)
    return (y + br)*e*vel
@snd("oiseau_good", 1, -24)
def og(i):
    seed(140 + i); out = silence(.5)
    place(out, chirp(2200, 3100, .085), 0); place(out, chirp(2500, 3400, .08, .9), .11)
    return reverb(hp(out, 1200), "outdoor", .3)
@snd("oiseau_bad", 1, -22)
def ob(i):
    out = silence(1.3); place(out, hoo(430, 395, .3), 0); place(out, hoo(405, 345, .45, .95), .38)
    return reverb(lp(out, 2500), "outdoor", .35)
@snd("oiseau_combo", 1, -23)
def oc(i):
    seed(150); out = silence(.8)
    for k in range(5): place(out, chirp(2000 + k*200, 3000 + k*220, .07, .9), k*.075)
    return reverb(hp(out, 1200), "outdoor", .3)

# ---------- pack « rigolo » ----------
def slide_whistle(f0, f1, dur, vel=1.0):
    t = t_(dur); k = t/dur; f = f0*(f1/f0)**(k**.8)*(1 + .012*np.sin(2*np.pi*6*t))
    ph = 2*np.pi*np.cumsum(f)/SR
    y = np.sin(ph) + .08*np.sin(2*ph)
    breath = bp(noise(dur), 1500, 7000)*.06
    e = np.clip(t/.025, 0, 1)*np.clip((dur - t)/.04, 0, 1)
    return (y + breath)*e*vel
def trombone(n0, n1, dur, vel=1.0, wah=True):
    t = t_(dur); f = note(n0)*(note(n1)/note(n0))**(t/dur)*(1 + .01*np.sin(2*np.pi*5*t)*np.clip((t - .15)/.2, 0, 1))
    ph = 2*np.pi*np.cumsum(f)/SR; y = np.zeros_like(t)
    for h in range(1, 18): y += np.sin(h*ph)/h**1.1
    y = peak(peak(y, 520, 2, 9), 1250, 3, 6)
    if wah: y = sweep_lp(y, 500, 2200) if dur < .3 else sweep_lp(y, 2200, 500)
    e = np.clip(t/.04, 0, 1)*np.clip((dur - t)/.08, 0, 1)
    return y*e*vel*.25
@snd("rigolo_good", 2, -22)
def rgg(i):
    seed(160 + i); out = silence(.6)
    place(out, slide_whistle(480, 1350, .2), 0); place(out, slide_whistle(650, 1600, .17, .7), .2)
    return reverb(out, "room", .16)
@snd("rigolo_bad", 1, -21)
def rgb(i):
    out = silence(1.4); place(out, trombone(55, 54, .32), 0); place(out, trombone(54, 53, .32), .34); place(out, trombone(53, 51, .7, 1, True), .68)
    return reverb(out, "room", .18)
@snd("rigolo_combo", 1, -21)
def rgc(i):
    out = silence(.8)
    for k in range(3): place(out, slide_whistle(400 + k*140, 1100 + k*350, .17, .9), k*.17)
    return reverb(out, "room", .16)

# ---------- caisses : cliquet qui défile, roulement, révélation selon la rareté ----------
@snd("case_tick", 3, -26)
def ctick(i):
    seed(170 + i); f = 2300 + 200*i
    y = modal(.05, [(f, 1, .018), (f*1.9, .5, .01), (f*3.3, .3, .006)], strike=1, hard=.9)
    y += resonator(noise(.05)*env_ad(int(.05*SR), .0003, .006), 900, 6)*.6
    return reverb(hp(y, 300), "small", .08)

@snd("case_roll", 1, -21)
def croll(i):
    seed(180); out = silence(1.3); k = 0; tt = 0.0
    while tt < .95:
        v = .35 + .65*(tt/.95)
        place(out, snare_hit(v*(1 if k % 2 == 0 else .85), 190 + 30*tt), tt); k += 1; tt += .075 - .035*(tt/.95)
    return reverb(out, "room", .2)

def boom(vel=1.0):
    t = t_(1.2); f = 95*np.exp(-t*2.2) + 38; ph = 2*np.pi*np.cumsum(f)/SR
    y = np.sin(ph)*np.exp(-t/.32)*np.clip(t/.003, 0, 1)
    y += lp(noise(1.2), 400)*np.exp(-t/.06)*.5
    return y*vel
N_CASE = [72, 76, 79, 84, 88, 91, 96]
for r in range(7):
    def _rev(i, r=r):
        seed(190 + r); out = silence(3.2 if r >= 3 else 2.2)
        place(out, boom(.9), 0)
        for k in range(min(len(N_CASE), 3 + r)):
            place(out, glock(note(N_CASE[k]), 2.0, .75), .08 + k*.075); place(out, marimba(note(N_CASE[k] - 12), 1.2, .45, soft=.35), .08 + k*.075)
        if r >= 3:
            for k in range(10): place(out, glock(note([96, 98, 100, 103, 105, 108][rng.integers(0, 6)]), .8, .15 + .1*rng.random()), .55 + k*.045)
        if r >= 5:   # montée « ultime » : souffle qui gonfle + accord de cloches
            t = t_(1.0); sw = sweep_bp(noise(1.0), 300, 6000, 1.5)*np.clip(t/1.0, 0, 1)**2*.5
            place(out, sw, .2); place(out, bell(note(84), 2.0, .8), 1.15); place(out, bell(note(91), 2.0, .5), 1.17)
        return reverb(out, "hall", .3 + .03*r)
    S[f"case_r{r}"] = (_rev, 1, -18)
