# Exemples de bruitages naturels (à copier / adapter). Rendu : python3 fabriquer.py exemples --sortie sons_out
# Idées clés : synthèse « modale » (un objet frappé = plusieurs résonances qui s'éteignent), bruit filtré pour les frottements,
# un peu d'acoustique de pièce (reverb), plusieurs variantes par son, jamais d'onde pure qui commence ou s'arrête net.
from dsp import *

STEREO = {"carillon", "vent", "pluie"}
S = {}
def snd(name, n=1, rms=-24):
    def deco(f): S[name] = (f, n, rms); return f
    return deco

def marimba(f, dur=1.4, vel=1.0, soft=.5):
    d0 = 1.1*(440/f)**.35
    y = modal(dur, [(f, 1.0, d0), (f*3.99, .28*(1 - .6*soft)*vel, d0*.22), (f*9.85, .07*(1 - .7*soft)*vel, d0*.08), (f*2.0, .04, d0*.4)], strike=.5 + .5*vel, hard=.25 + .3*(1 - soft))
    return (y + .35*resonator(y, f, 60)*np.exp(-np.arange(len(y))/SR/(d0*.6)))*vel
def glock(f, dur=2.2, vel=1.0):
    d0 = 2.2*(880/f)**.3
    return modal(dur, [(f, 1.0, d0), (f*2.756, .32, d0*.45), (f*5.404, .12, d0*.22), (f*8.933, .05, d0*.12)], strike=.7, hard=.7)*vel

@snd("clic", 4, -36)                   # petit « toc » de bois pour les boutons
def clic(i):
    seed(10 + i); f = 1750 + 140*i
    y = modal(.09, [(f, 1, .028), (f*2.31, .35, .012), (f*3.86, .16, .006), (f*.52, .25, .02)], strike=.6, hard=.45)
    return reverb(lp(y, 7500), "small", .10)

@snd("reussite", 3, -24)               # deux notes de marimba qui montent
def reussite(i):
    seed(20 + i); out = silence(1.3); place(out, marimba(note(76), 1.3, .95, .35), 0); place(out, marimba(note(81), 1.2, 1.0, .35), .085)
    return reverb(out, "room", .2)

@snd("carillon", 1, -26)               # carillon à vent, doux et aléatoire
def carillon(i):
    seed(30); out = silence(4.0); notes = [72, 74, 76, 79, 81, 84]
    for k in range(9): place(out, glock(note(notes[rng.integers(0, 6)]), 2.5, rng.uniform(.2, .6)), rng.uniform(0, 2.5))
    return reverb(stereo(out, 0, .4, 8), "hall", .45)

@snd("pas", 6, -32)                    # pas sur un sol dur : talon, puis avant du pied qui frotte un peu
def pas(i):
    seed(40 + i); r = rng.uniform; out = silence(.3)
    n = noise(.08); thud = lp(n, 900)*env_ad(len(n), .0012, .03) + resonator(noise(.08)*env_ad(len(n), .001, .025), r(95, 140), 2.5)*1.6
    place(out, thud, 0); place(out, bp(noise(.012), 2200, 7000)*env_ad(int(.012*SR), .0003, .006)*.3, .001)
    t2 = r(.055, .08); toe = lp(noise(.07), 1100)*env_ad(int(.07*SR), .003, .035); place(out, toe*.45, t2)
    return reverb(hp(out, 45), "small", .08)

@snd("vent", 1, -30)                   # nappe de vent (boucle d'ambiance possible)
def vent(i):
    d = 6.0; t = t_(d); n = noise(d, "pink")
    y = sweep_bp(n, 300, 900, 1.5)*(.6 + .4*np.sin(2*np.pi*t/d*2)**2)
    return reverb(stereo(lp(y, 2500), 0, .6, 11), "hall", .3)

@snd("pluie", 1, -30)                  # pluie douce : souffle + milliers de petites gouttes
def pluie(i):
    seed(60); d = 6.0; out = lp(noise(d, "pink"), 4000)*.15
    for k in range(1800):
        x = np.zeros(int(.004*SR)); x[0] = 1; place(out, resonator(x, rng.uniform(2000, 7000), 4)*rng.uniform(.02, .2), rng.uniform(0, d))
    return reverb(stereo(hp(out, 200), 0, .7, 9), "room", .2)
