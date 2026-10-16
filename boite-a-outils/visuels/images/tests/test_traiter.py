# Test du traitement sur des images de synthèse qui imitent une sortie d'IA : python3 tests/test_traiter.py
# (fond vert un peu bruité + compression JPEG, sujet aux bords adoucis avec reflets verts, petit filigrane dans un coin)
import os, sys, json, tempfile, numpy as np
from PIL import Image, ImageDraw, ImageFilter
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, H)
import traiter as T
ok = tot = 0
def check(nom, c, info=""):
    global ok, tot; tot += 1; ok += bool(c); print(("PASS " if c else "FAIL ") + nom + ("" if c else f"  -> {info}"))
def fausse_image(chemin, fond=(0, 255, 0), sujet=(30, 40, 70), filigrane=True):
    im = Image.new("RGB", (1024, 1024), fond); d = ImageDraw.Draw(im)
    d.ellipse((392, 180, 632, 430), fill=sujet); d.polygon([(300, 1024), (360, 470), (664, 470), (724, 1024)], fill=sujet)
    d.ellipse((450, 260, 580, 330), fill=(200, 160, 120))                      # visage
    im = im.filter(ImageFilter.GaussianBlur(2.2))                               # bords doux (mélange avec le fond)
    a = np.asarray(im).astype(float); a += np.random.default_rng(1).normal(0, 4, a.shape)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if filigrane:   # petite étoile blanche, comme le logo dans le coin de certaines images Gemini
        d = ImageDraw.Draw(im); d.polygon([(960, 930), (968, 952), (990, 960), (968, 968), (960, 990), (952, 968), (930, 960), (952, 952)], fill=(255, 255, 255))
    im.save(chemin, quality=85)
VOIR = os.environ.get("VOIR")   # VOIR=dossier : garde les images pour les regarder
with tempfile.TemporaryDirectory() as t:
    t = VOIR or t; os.makedirs(t, exist_ok=True)
    src = os.path.join(t, "brut.jpg"); fausse_image(src)
    info = T.traiter(src, "agent", "portrait", t, [256, 64])
    f = T.couleur(info.get("fond", "#000000")); check("fond détecté vert", f[1] > 200 and f[0] < 60 and f[2] < 60, info)
    check("filigrane effacé", info["morceaux_effaces"] >= 1, info)
    im = np.asarray(Image.open(os.path.join(t, "agent_detoure.png")))
    check("coins transparents", im[0, 0, 3] == 0 and im[-1, -1, 3] == 0 and im[0, -1, 3] == 0)
    check("sujet opaque au centre", im[im.shape[0] // 2, im.shape[1] // 2, 3] == 255)
    bord = (im[..., 3] > 20) & (im[..., 3] < 235)
    vert = im[..., 1].astype(int) - np.maximum(im[..., 0], im[..., 2]).astype(int)
    check("pas de liseré vert sur les bords", np.percentile(vert[bord], 95) < 25, np.percentile(vert[bord], 95))
    check("portrait carré, buste en bas", im.shape[0] == im.shape[1] and im[-1, im.shape[1] // 2, 3] > 200)
    for f, s in (("agent_256.png", 256), ("agent_64.png", 64)):
        x = Image.open(os.path.join(t, f)); check(f + " à la bonne taille", x.size == (s, s), x.size)
    # fond magenta (sujet vert) et fond non uni
    src2 = os.path.join(t, "plante.png"); fausse_image(src2, fond=(255, 0, 255), sujet=(40, 160, 60), filigrane=False)
    i2 = T.traiter(src2, "plante", "objet", t, [128]); im2 = np.asarray(Image.open(os.path.join(t, "plante_detoure.png")))
    check("fond magenta enlevé, sujet vert gardé", im2[0, 0, 3] == 0 and im2[im2.shape[0] // 2, im2.shape[1] // 2, 1] > 120, i2)
    src3 = os.path.join(t, "decor.png"); g = np.linspace(0, 255, 1024); Image.fromarray(np.dstack([np.tile(g, (1024, 1)), np.tile(g[:, None], (1, 1024)), np.full((1024, 1024), 90)]).astype(np.uint8)).save(src3)
    i3 = T.traiter(src3, "flou", "objet", t, [128]); check("fond non uni : pas de détourage, avertissement", "avertissement" in i3, i3)
    i4 = T.traiter(src3, "fond_ecran", "decor", t, [640]); check("décor : redimensionné sans détourage", Image.open(os.path.join(t, "fond_ecran_640.png")).size == (640, 640))
    # contour, pixel art, planche
    T.traiter(src, "icone", "icone", t, [128], px_contour=6, pixel=32)
    ic = np.asarray(Image.open(os.path.join(t, "icone_128.png"))); check("contour noir ajouté", ic[..., 3].mean() > 0 and (ic[ic[..., 3] > 200][..., :3].min(axis=1) < 30).mean() > 0.2)
    px = np.asarray(Image.open(os.path.join(t, "icone_pixel32.png"))); check("pixel art 32×32 à alpha binaire", px.shape[:2] == (32, 32) and set(np.unique(px[..., 3])) <= {0, 255})
    os.makedirs(os.path.join(t, "lot")); [Image.open(os.path.join(t, f)).save(os.path.join(t, "lot", f)) for f in ("agent_64.png", "plante_128.png", "icone_128.png")]
    n = T.planche(os.path.join(t, "lot"), 64, os.path.join(t, "planche.png")); at = json.load(open(os.path.join(t, "planche.json")))
    check("planche + atlas", n == 3 and len(at["sprites"]) == 3 and Image.open(os.path.join(t, "planche.png")).size == (128, 128), at)
import prompt as P
p1, f1 = P.construire("portrait", "a fictional police operator", "realiste"); p2, f2 = P.construire("icone", "a goblin dagger with a green jade handle", "plat")
check("prompt : fond vert par défaut, sans texte ni logo", f1 == "vert" and "#00FF00" in p1 and "no logo" in p1)
check("prompt : fond magenta si le sujet est vert", f2 == "magenta" and "#FF00FF" in p2)
p3, f3 = P.construire("decor", "a foggy forest road at night", "sombre"); check("prompt : décor sans fond à enlever", f3 is None and "#00FF00" not in p3)
print(f"\n{ok}/{tot} vérifications réussies"); sys.exit(0 if ok == tot else 1)
