# Variantes de caractère pour les sons les plus fréquents (au choix après écoute)
from dsp import *
from exemples_jeu import celesta, glock, marimba

STEREO = set()
S = {}
def snd(name, n=1, rms=-20):
    def deco(f): S[name] = (f, n, rms); return f
    return deco

def felt_piano(f, dur=1.4, vel=1.0):
    # piano « feutre » (son doux, intime) : harmoniques légèrement étirées, aigus vite éteints, attaque feutrée
    B = .0004; modes = []
    for h in range(1, 12):
        fh = f*h*np.sqrt(1 + B*h*h)
        modes.append((fh, (1/h**1.3)*(1 if h < 4 else .6), (1.6*(440/f)**.4)/(1 + .55*(h - 1))))
    y = modal(dur, modes, strike=.25, att=.004, hard=.15)
    return lp(y, 3500)*vel

@snd("tap_b", 4, -40)
def tap_b(i):
    # petit « plop » doux, comme une goutte
    seed(500 + i); d = .12; t = t_(d); f0 = 700 + 60*i; f = f0*(1 + 2.2*t/d)
    y = np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t/.022)*np.clip(t/.002, 0, 1)
    return reverb(lp(y, 5000), "small", .08)

@snd("good_b", 3, -25)
def good_b(i):
    seed(510 + i); out = silence(1.6)
    place(out, felt_piano(note(72), 1.5, .9), 0); place(out, felt_piano(note(79), 1.4, 1.0), .11)
    place(out, celesta(note(91), 1.2, .18), .11)
    return reverb(out, "room", .25)

@snd("bad_b", 2, -27)
def bad_b(i):
    seed(520 + i); out = silence(1.2)
    place(out, felt_piano(note(60), 1.1, .9), 0); place(out, felt_piano(note(56), 1.0, .8), .16)
    return reverb(out, "room", .22)

@snd("good_c", 3, -25)
def good_c(i):
    # deux clochettes (célesta) claires, sans marimba
    seed(530 + i); out = silence(1.8)
    place(out, celesta(note(84), 1.6, .8), 0); place(out, celesta(note(88), 1.6, .9), .09); place(out, glock(note(100), 1.0, .12), .09)
    return reverb(out, "room", .28)
