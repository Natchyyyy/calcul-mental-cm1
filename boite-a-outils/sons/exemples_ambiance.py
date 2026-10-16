# Bruitages de la salle des trophées : pas (pierre / tapis), objets, feu, pendule, chouette…
from dsp import *
from exemples_jeu import marimba, glock, celesta, bell, xylo, hoo

STEREO = {"salle_unveil", "salle_whoosh", "salle_inspectRare", "salle_entree", "salle_fire", "salle_coins", "salle_hoot", "salle_music"}
S = {}
def snd(name, n=1, rms=-20):
    def deco(f): S[name] = (f, n, rms); return f
    return deco

# ---------- pas : talon (choc sourd + petit claquement de semelle), puis l'avant du pied qui se pose et frotte ----------
def step(hard=True, i=0):
    seed(300 + i + (0 if hard else 50)); d = .32; out = silence(d); r = rng.uniform
    # talon
    n = noise(.08); e = env_ad(len(n), .0012, .03*r(.8, 1.2))
    thud = lp(n, 900 if hard else 450)*e
    thud = thud + resonator(noise(.08)*env_ad(int(.08*SR), .001, .025), r(95, 140), 2.5)*1.6     # le sol qui résonne un peu
    place(out, thud*r(.85, 1.0), 0)
    if hard:
        cl = bp(noise(.012), 2200, 7000)*env_ad(int(.012*SR), .0003, .006); place(out, cl*r(.25, .45), .001)
    # avant du pied
    t2 = r(.055, .08)
    n2 = noise(.07); toe = lp(n2, 1100 if hard else 520)*env_ad(len(n2), .003, .035)
    toe = toe + resonator(noise(.07)*env_ad(len(n2), .002, .02), r(150, 210), 2.5)*.9
    place(out, toe*r(.4, .55), t2)
    # frottement : bruit granuleux
    sc_d = r(.06, .11); g = noise(sc_d)
    grains = np.abs(lp(noise(sc_d), 60)); grains /= grains.max() + 1e-9
    sc = lp(bp(g, 700, 3000) if hard else bp(g, 250, 1200), 3500 if hard else 1500, 4)*grains*np.sin(np.pi*np.linspace(0, 1, len(g)))**1.5
    place(out, sc*(r(.035, .06) if hard else r(.06, .1)), t2 + .01)
    out = hp(out, 45)
    return reverb(out, "small", .08 if hard else .03)

@snd("pas", 8, -24)
def pas(i): return step(True, i)
@snd("pas_tapis", 6, -30)
def pas_tapis(i): return step(False, i)

# ---------- le compagnon (petit hibou) qu'on caresse : deux « hou » tout doux + une clochette ----------
@snd("salle_compagnon", 2, -24)
def comp(i):
    seed(320 + i); out = silence(1.0)
    place(out, hoo(640 + 30*i, 600, .16, .8), 0); place(out, hoo(700 + 30*i, 640, .2, .7), .19)
    place(out, celesta(note(93 + 2*i), 1.0, .25), .05)
    return reverb(lp(out, 5000), "room", .2)

# ---------- dévoilement d'un trophée : arpège de cloches qui monte + souffle qui gonfle ----------
@snd("salle_unveil", 1, -20)
def unveil(i):
    seed(330); out = silence(3.0); pent = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93]
    for k, n in enumerate(pent): place(out, glock(note(n), 1.8, .35 + .05*k), .05 + k*.055)
    t = t_(1.0); sw = sweep_bp(noise(1.0), 500, 7000, 1.2)*np.clip(t/1.0, 0, 1)**1.5*np.clip((1.0 - t)/.15, 0, 1)*.35
    place(out, sw, 0)
    t = t_(2.6); pad = sum(np.sin(2*np.pi*note(n)*t*(1 + d)) for n in [60, 67, 72, 76] for d in (-.003, .003))
    pad *= np.clip(t/.6, 0, 1)*np.exp(-t/1.0)*.035; place(out, lp(pad, 2000), .3)
    return reverb(out, "hall", .35)

# ---------- souffle (vol de caméra) ----------
@snd("salle_whoosh", 2, -26)
def whoosh(i):
    seed(340 + i); d = .55; t = t_(d); n = noise(d, "pink")
    y = sweep_bp(n, 250, 1400, 1.0)*np.sin(np.pi*t/d)**2
    y = lp(y, 3000); s = np.stack([y*np.cos((t/d)*np.pi/2)**.5, y*np.sin((t/d)*np.pi/2)**.5]) if i == 0 else np.stack([y*np.sin((t/d)*np.pi/2)**.5, y*np.cos((t/d)*np.pi/2)**.5])
    return reverb(s, "room", .15)

# ---------- inspection : la cloche de verre qu'on soulève (verre qui chante doucement + souffle léger) ----------
def glass(f, dur=1.6, vel=1.0):
    return modal(dur, [(f, 1, 1.4), (f*2.32, .45, .7), (f*4.25, .2, .35), (f*6.63, .08, .2)], strike=.3, hard=.6)*vel
@snd("salle_inspect", 2, -24)
def inspect(i):
    seed(350 + i); out = silence(1.6)
    place(out, glass(1850*(1 + .05*i), 1.5, .8), 0)
    t = t_(.35); place(out, bp(noise(.35, "pink"), 600, 3000)*np.sin(np.pi*t/.35)**2*.15, 0)
    return reverb(out, "room", .2)
@snd("salle_inspectRare", 1, -21)
def inspect_rare(i):
    seed(360); out = silence(2.6)
    for k, n in enumerate([72, 76, 79, 84]): place(out, glock(note(n), 2.2, .7), k*.08); place(out, bell(note(n), 2.2, .25), k*.08)
    for k in range(8): place(out, glock(note([96, 98, 100, 103, 105][rng.integers(0, 5)]), .7, .12), .4 + k*.05)
    return reverb(out, "hall", .32)

# ---------- poser un trophée sur un socle (marbre) ----------
@snd("salle_place", 2, -23)
def place_(i):
    seed(370 + i); y = modal(.5, [(380*(1 + .06*i), 1, .09), (1050, .5, .05), (2300, .25, .03), (3900, .12, .02)], strike=.8, hard=.6)
    th = resonator(noise(.1)*env_ad(int(.1*SR), .001, .03), 110, 3)*1.4
    y[:len(th)] += th
    return reverb(lp(y, 6000), "room", .18)

# ---------- entrée dans la salle : accord chaud qui s'ouvre (cordes douces) + une clochette ----------
@snd("salle_entree", 1, -24)
def entree(i):
    seed(380); d = 3.2; t = t_(d); out = np.zeros(len(t))
    for n in [43, 55, 59, 62, 67]:
        for det in (-.004, 0, .004):
            f = note(n)*(1 + det); ph = 2*np.pi*f*t + rng.uniform(0, 6.28)
            saw = sum(np.sin(h*ph)/h for h in range(1, 9))
            out += saw*(.6 if n == 43 else .35)
    out = sweep_lp(out, 500, 2200)
    out *= np.clip(t/.8, 0, 1)**1.5*np.clip((d - t)/1.4, 0, 1)
    out = out/np.max(np.abs(out))*.5
    place(out, celesta(note(79), 2.0, .35), .5); place(out, celesta(note(86), 2.0, .25), .62)
    return reverb(stereo(out, 0, .5, 9), "hall", .4)

# ---------- télescope : tube de laiton qui coulisse, puis le cran qui se bloque ----------
@snd("salle_scope", 1, -25)
def scope(i):
    seed(390); d = .5; t = t_(d); n = noise(d)
    fr = bp(n, 1800, 5000)*(.4 + .6*np.abs(lp(noise(d), 40))/1.5)*np.sin(np.pi*t/d)**1.2
    fr = lp(sweep_bp(fr, 2200, 4200, 3), 6000, 4)
    out = silence(1.1); place(out, fr*.18, 0)
    place(out, modal(.4, [(3100, 1, .08), (5200, .5, .05), (7900, .3, .03), (1900, .4, .06)], strike=1, hard=1)*.7, .5)
    return reverb(out, "room", .2)

# ---------- armure : plaques de métal qui s'entrechoquent ----------
@snd("salle_clank", 3, -21)
def clank(i):
    seed(400 + i); out = silence(1.4)
    for k in range(3 + i % 2):
        f0 = rng.uniform(380, 900)
        y = modal(1.2, metal_modes(f0, 16, 1.8, .9, 400 + 10*i + k), strike=1.0, hard=1)
        place(out, y*(1 if k == 0 else rng.uniform(.3, .6)), k*rng.uniform(.025, .07))
    # cliquetis des petites pièces (rivets, lanières)
    for k in range(6): place(out, modal(.15, [(rng.uniform(2500, 6000), 1, .04)], strike=.5, hard=1)*.2, .05 + k*rng.uniform(.02, .05))
    return reverb(hp(out, 120), "room", .22)

# ---------- feu ----------
def crackle_one(r):
    """un petit éclat de bois qui claque : impulsion → 2-3 résonances aiguës très brèves + un petit « pof » grave"""
    d = .06; x = np.zeros(int(d*SR)); x[0] = 1; x[1] = -.6
    y = sum(resonator(x, r.uniform(1200, 6500), r.uniform(4, 12))*r.uniform(.4, 1) for _ in range(3))
    y += lp(noise(d), 500)*env_ad(len(x), .0005, .012)*.4
    return y*env_ad(len(x), .0002, r.uniform(.008, .03))
@snd("salle_crackle", 8, -30)
def crackle(i):
    r = np.random.default_rng(410 + i); out = silence(.35)
    for k in range(r.integers(1, 4)): place(out, crackle_one(r)*r.uniform(.4, 1), r.uniform(0, .2))
    # souffle des flammes très doux
    t = t_(.35); place(out, lp(noise(.35, "brown"), 300)*np.sin(np.pi*t/.35)*.05, 0)
    return hp(out, 60)
@snd("salle_fire", 1, -21)
def fire(i):
    r = np.random.default_rng(420); d = 1.6; t = t_(d); out = silence(d)
    roar = lp(noise(d, "brown"), 420)*np.clip(t/.08, 0, 1)*np.exp(-t/.7)*.9 + bp(noise(d, "pink"), 500, 2500)*np.exp(-t/.4)*.15
    place(out, roar, 0)
    for k in range(18): place(out, crackle_one(r)*r.uniform(.4, 1.0), r.uniform(0, 1.2)**1.6)
    return reverb(stereo(out, 0, .4, 7), "room", .2)

# ---------- pendule : tic (aigu) et tac (un peu plus grave), dans une caisse en bois ----------
@snd("salle_tick", 2, -32)
def tick(i):
    seed(430 + i); f = 3400 if i == 0 else 2850
    y = modal(.12, [(f, 1, .03), (f*1.62, .5, .02), (f*2.7, .25, .012)], strike=1, hard=1)
    y += resonator(y, 780, 12)*.6 + resonator(y, 1450, 9)*.3     # caisse de bois
    return reverb(lp(y, 9000), "small", .1)

# ---------- chouette au loin, derrière la verrière (hou… hou-hou-hou… hou) ----------
@snd("salle_hoot", 2, -28)
def hoot(i):
    seed(440 + i); out = silence(3.2)
    pat = [(0, .55, 1), (.85, .16, .7), (1.05, .16, .75), (1.25, .5, .9)] if i == 0 else [(0, .5, 1), (.75, .45, .85)]
    for at, d, v in pat: place(out, hoo(372 + 8*i, 350 + 8*i, d, v), at)
    out = lp(out, 1400)
    return reverb(stereo(out, -.3 if i == 0 else .35, .3, 6), "outdoor", .6, predelay=.02)

# ---------- gramophone : l'aiguille se pose, crépitement du disque ----------
@snd("salle_music", 1, -26)
def music(i):
    r = np.random.default_rng(450); d = 1.1; out = silence(d)
    place(out, resonator(noise(.1)*env_ad(int(.1*SR), .001, .03), 90, 3)*1.2, 0)   # « poc » du bras
    hiss = bp(noise(d), 2000, 8000)*.03*np.clip((d - t_(d))/.3, 0, 1); place(out, hiss, .03)
    for k in range(40):   # poussières
        x = np.zeros(int(.006*SR)); x[0] = 1
        place(out, hp(resonator(x, r.uniform(2000, 7000), 3), 1500)*r.uniform(.05, .3), r.uniform(.05, d - .05))
    return reverb(stereo(lp(out, 7000), 0, .3, 5), "small", .1)

# ---------- livre d'or : une page qu'on tourne ----------
@snd("salle_page", 2, -25)
def page(i):
    seed(460 + i); d = .55; t = t_(d); n = noise(d)
    gr = np.abs(lp(noise(d), 90)); gr /= gr.max() + 1e-9
    body = sweep_bp(n, 1500, 4500, 1.2)*gr*np.sin(np.pi*np.clip(t/(d*.85), 0, 1))**1.3
    flap = lp(noise(.12), 900)*env_ad(int(.12*SR), .005, .06)
    out = silence(.75); place(out, body*.6, 0); place(out, flap*.5, d*.78)
    return reverb(lp(hp(out, 250), 7500, 4), "room", .15)

# ---------- coffre : poignée de pièces qui tintent ----------
@snd("salle_coins", 1, -21)
def coins(i):
    r = np.random.default_rng(470); out = silence(1.5)
    for k in range(22):
        f0 = r.uniform(2300, 4200); at = r.uniform(0, .55)**1.3
        y = modal(.5, [(f0, 1, .3), (f0*2.42, .5, .18), (f0*4.1, .2, .1), (f0*1.5, .2, .15)], strike=.9, hard=1)
        place(out, y*r.uniform(.2, .8)*(1 - at), at)
    out = hp(out, 700)
    return reverb(stereo(out, 0, .5, 7), "room", .22)
