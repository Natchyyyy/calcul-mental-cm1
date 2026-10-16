# Prépare une image générée par une IA (Gemini, Meshy…) pour un jeu :
#   fond uni enlevé (transparence douce, sans liseré coloré), petits dépôts isolés effacés (filigrane dans un coin),
#   recadrage serré + marge, format carré ou libre, plusieurs tailles, contour optionnel, version pixel art optionnelle.
#
# usage :
#   python3 traiter.py image.png --nom agent_gign [--type portrait|icone|objet|personnage|decor|texture]
#                      [--sortie dossier] [--tailles 512,256,128,64] [--fond auto|vert|magenta|blanc|noir|aucun|#RRGGBB]
#                      [--marge 0.06] [--contour 0] [--couleur-contour #000000] [--pixel 64] [--aucun-nettoyage]
#   python3 traiter.py --planche dossier_png --taille 128 --sortie planche.png     (planche de sprites + atlas JSON)
#
# Sorties : <nom>_<taille>.png pour chaque taille, <nom>_detoure.png (pleine résolution), <nom>.json (infos).
import sys, os, json, argparse, glob
import numpy as np
from PIL import Image
from scipy import ndimage

TYPES = {   # recadrage par type d'image
    "portrait":   {"carre": True,  "ancre": "bas",    "detourer": True,  "tailles": [512, 256, 128]},
    "icone":      {"carre": True,  "ancre": "centre", "detourer": True,  "tailles": [256, 128, 64, 32]},
    "objet":      {"carre": True,  "ancre": "centre", "detourer": True,  "tailles": [512, 256, 128]},
    "personnage": {"carre": False, "ancre": "bas",    "detourer": True,  "tailles": [1024, 512]},
    "decor":      {"carre": False, "ancre": "centre", "detourer": False, "tailles": [1920, 1280]},
    "texture":    {"carre": True,  "ancre": "centre", "detourer": False, "tailles": [1024, 512, 256]},
}
NOMMES = {"vert": (0, 255, 0), "magenta": (255, 0, 255), "blanc": (255, 255, 255), "noir": (0, 0, 0), "bleu": (0, 0, 255)}


def couleur(s):
    s = s.strip().lstrip("#"); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def bordure(rgb, k=0.03):
    """pixels de la bordure de l'image (où se trouve le fond)"""
    h, w, _ = rgb.shape; e = max(2, int(min(h, w) * k))
    return np.concatenate([rgb[:e].reshape(-1, 3), rgb[-e:].reshape(-1, 3), rgb[:, :e].reshape(-1, 3), rgb[:, -e:].reshape(-1, 3)])


def detecter_fond(rgb):
    """couleur du fond (médiane de la bordure) et à quel point il est uni ; None si le fond n'est pas uni"""
    b = bordure(rgb); med = np.median(b, axis=0); d = np.linalg.norm(b - med, axis=1)
    part_unie = float(np.mean(d < 40)); bruit = float(np.percentile(d[d < 40], 90)) if np.any(d < 40) else 99.0   # le sujet peut toucher le bord (buste) : bruit mesuré sur le fond seulement
    return (med, bruit) if part_unie > 0.7 else (None, bruit)


def detourer(rgb, fond, bruit):
    """alpha doux d'après la distance à la couleur du fond, puis « démélange » des couleurs des bords (plus de liseré)"""
    K = np.array(fond, dtype=np.float64); x = rgb.astype(np.float64)
    vert = K[1] > 180 and K[0] < 120 and K[2] < 120
    if vert:   # fond vert : la « verdeur » sépare beaucoup mieux que la simple distance (ombres, reflets)
        g = x[..., 1] - np.maximum(x[..., 0], x[..., 2]); gk = K[1] - max(K[0], K[2])
        d = (gk - g)   # 0 sur le fond, grand sur le sujet
    else:
        d = np.linalg.norm(x - K, axis=-1)
    t0 = max(18.0, bruit * 1.5); t1 = t0 + 70.0
    a = np.clip((d - t0) / (t1 - t0), 0, 1)
    # démélange : couleur observée = a·sujet + (1−a)·fond  →  sujet = (observé − (1−a)·fond) / a
    am = np.maximum(a, 1e-3)[..., None]; c = (x - (1 - a)[..., None] * K) / am
    c = np.where(a[..., None] > 0.02, c, 0)   # pixels transparents : couleur remise à zéro (sinon le vert ressort au redimensionnement)
    if vert:   # anti-débordement du vert sur le sujet
        c[..., 1] = np.minimum(c[..., 1], np.maximum(c[..., 0], c[..., 2]) * 1.06 + 8)
    return np.clip(c, 0, 255), a


def nettoyer(a, garde=0.004):
    """efface les petits morceaux détachés du sujet principal (filigrane, poussières, bouts de fond),
    y compris leur halo presque transparent : on ne garde que ce qui touche les gros morceaux"""
    m = a > 0.5; lab, n = ndimage.label(m)
    if n == 0: return a, 0
    tailles = ndimage.sum(m, lab, range(1, n + 1)); grand = tailles.max()
    gros = [i for i, t in enumerate(tailles, start=1) if not (t < garde * m.size or t < 0.02 * grand)]
    coeur = np.isin(lab, gros)
    faible, nf = ndimage.label(a > 0.004)   # tout ce qui est visible, même à peine
    garder = np.unique(faible[coeur]); garder = garder[garder > 0]
    a = np.where(np.isin(faible, garder), a, 0.0)
    return a, int(n - len(gros)) + int(nf - len(garder) > 0)


def boite(a, seuil=0.02):
    ys, xs = np.nonzero(a > seuil)
    if not len(xs): return 0, 0, a.shape[1], a.shape[0]
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def cadrer(img, a, carre, ancre, marge):
    """recadre sur le sujet + marge ; carré si demandé (portrait : sujet posé en bas du cadre)"""
    x0, y0, x1, y1 = boite(a); w, h = x1 - x0, y1 - y0; m = int(round(max(w, h) * marge))
    if carre:
        c = max(w, h) + 2 * m; cx = (x0 + x1) / 2
        X0 = int(round(cx - c / 2))
        Y0 = y1 - c if ancre == "bas" else int(round((y0 + y1) / 2 - c / 2))   # portrait : le buste touche le bas du cadre
        box = (X0, Y0, X0 + c, Y0 + c)
    else:
        box = (x0 - m, y0 - m, x1 + m, y1 + (0 if ancre == "bas" else m))
    return img.crop(box)   # Pillow complète par du transparent hors de l'image


def redimensionner(img, taille, carre):
    """redimensionne en alpha prémultiplié (pas de halo sombre ou coloré autour du sujet)"""
    if carre: cible = (taille, taille)
    else: r = taille / max(img.size); cible = (max(1, round(img.width * r)), max(1, round(img.height * r)))
    p = np.asarray(img).astype(np.float64); al = p[..., 3:4] / 255; pm = np.concatenate([p[..., :3] * al, p[..., 3:4]], -1)
    pm_img = Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGBA").resize(cible, Image.LANCZOS)
    q = np.asarray(pm_img).astype(np.float64); al2 = np.maximum(q[..., 3:4] / 255, 1e-6)
    out = np.concatenate([np.where(al2 > 1e-3, q[..., :3] / al2, 0), q[..., 3:4]], -1)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def contour(img, px, col):
    """contour net autour du sujet (style icône / autocollant)"""
    if px <= 0: return img
    p = np.asarray(img).astype(np.float64); a = p[..., 3] / 255
    d = ndimage.grey_dilation(a, footprint=disque(px)); fond = np.zeros_like(p); fond[..., :3] = col; fond[..., 3] = d * 255
    # sujet par-dessus le contour (composition « over »)
    ao = a + (d) * (1 - a); c = (p[..., :3] * a[..., None] + fond[..., :3] * (d * (1 - a))[..., None]) / np.maximum(ao, 1e-6)[..., None]
    return Image.fromarray(np.clip(np.concatenate([c, ao[..., None] * 255], -1), 0, 255).astype(np.uint8), "RGBA")


def disque(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]; return x * x + y * y <= r * r


def pixeliser(img, n):
    """vrai pixel art : réduction à n pixels, palette limitée, alpha binaire, puis agrandissement net (×8)"""
    small = redimensionner(img, n, img.width == img.height)
    p = np.asarray(small).copy(); p[..., 3] = np.where(p[..., 3] > 127, 255, 0)
    vis = p[p[..., 3] > 0][:, :3]   # palette calculée sur les seuls pixels visibles
    if not len(vis): vis = p[..., :3].reshape(-1, 3)
    pal = Image.fromarray(vis[None, :, :]).quantize(colors=24, method=Image.MEDIANCUT)
    rgb = Image.fromarray(p[..., :3]).quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    out = np.dstack([np.asarray(rgb), p[..., 3]]).astype(np.uint8)
    s = Image.fromarray(out, "RGBA"); return s, s.resize((s.width * 8, s.height * 8), Image.NEAREST)


def traiter(chemin, nom, typ="objet", sortie=".", tailles=None, fond="auto", marge=0.06, px_contour=0, col_contour=(0, 0, 0), pixel=0, nettoie=True):
    T = TYPES[typ]; tailles = tailles or T["tailles"]; os.makedirs(sortie, exist_ok=True)
    src = Image.open(chemin).convert("RGB"); rgb = np.asarray(src)
    info = {"source": os.path.basename(chemin), "type": typ, "taille_source": list(src.size)}
    detoure = T["detourer"] and fond != "aucun"
    if detoure:
        if fond == "auto": K, bruit = detecter_fond(rgb)
        else:
            K = np.array(NOMMES.get(fond) or couleur(fond), dtype=float); Km, bruit = detecter_fond(rgb)
            # la couleur réellement rendue (JPEG, « vert » de Gemini ≈ (8,246,3)) diffère un peu de la couleur demandée :
            # si la bordure est unie et proche, on prend la couleur mesurée, sinon tout le fond garde un voile d'alpha
            if Km is not None and np.linalg.norm(Km - K) < 60: K = Km
        if K is None:
            detoure = False; info["avertissement"] = "fond non uni : pas de détourage (redemander l'image sur un fond uni, ou --fond #RRGGBB)"
    if detoure:
        c, a = detourer(rgb, K, bruit); enl = 0
        if nettoie: a, enl = nettoyer(a)
        info.update({"fond": "#%02x%02x%02x" % tuple(int(v) for v in K), "morceaux_effaces": enl, "part_sujet": round(float(np.mean(a > 0.5)), 3)})
        img = Image.fromarray(np.dstack([c, a * 255]).astype(np.uint8), "RGBA")
        img = cadrer(img, a, T["carre"], T["ancre"], marge)
    else:
        img = src.convert("RGBA")
        if T["carre"]: s = min(img.size); img = img.crop(((img.width - s) // 2, (img.height - s) // 2, (img.width + s) // 2, (img.height + s) // 2))
    img = contour(img, int(round(px_contour * img.width / 256)), col_contour)
    img.save(os.path.join(sortie, f"{nom}_detoure.png")); fichiers = [f"{nom}_detoure.png"]
    for t in tailles:
        f = f"{nom}_{t}.png"; redimensionner(img, t, T["carre"] or typ == "texture").save(os.path.join(sortie, f)); fichiers.append(f)
    if pixel:
        petit, grand = pixeliser(img, pixel); petit.save(os.path.join(sortie, f"{nom}_pixel{pixel}.png")); grand.save(os.path.join(sortie, f"{nom}_pixel{pixel}_x8.png"))
        fichiers += [f"{nom}_pixel{pixel}.png", f"{nom}_pixel{pixel}_x8.png"]
    info["fichiers"] = fichiers; info["taille_finale"] = list(img.size)
    json.dump(info, open(os.path.join(sortie, f"{nom}.json"), "w"), ensure_ascii=False, indent=1)
    return info


def planche(dossier, taille, sortie, colonnes=None):
    """planche de sprites (une case carrée par image) + atlas JSON {nom: {x, y, w, h}}"""
    fs = [f for f in sorted(glob.glob(os.path.join(dossier, "*.png"))) if not f.endswith(os.path.basename(sortie))]
    if not fs: sys.exit("aucun PNG dans " + dossier)
    n = len(fs); col = colonnes or int(np.ceil(np.sqrt(n))); lig = int(np.ceil(n / col))
    sheet = Image.new("RGBA", (col * taille, lig * taille), (0, 0, 0, 0)); atlas = {}
    for i, f in enumerate(fs):
        im = Image.open(f).convert("RGBA"); im.thumbnail((taille, taille), Image.LANCZOS)
        x, y = (i % col) * taille, (i // col) * taille; sheet.paste(im, (x + (taille - im.width) // 2, y + (taille - im.height) // 2), im)
        atlas[os.path.splitext(os.path.basename(f))[0]] = {"x": x, "y": y, "w": taille, "h": taille}
    sheet.save(sortie); json.dump({"image": os.path.basename(sortie), "taille_case": taille, "sprites": atlas}, open(os.path.splitext(sortie)[0] + ".json", "w"), ensure_ascii=False, indent=1)
    return len(fs)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Prépare une image générée pour un jeu (détourage, recadrage, tailles).")
    ap.add_argument("image", nargs="?"); ap.add_argument("--nom"); ap.add_argument("--type", default="objet", choices=list(TYPES))
    ap.add_argument("--sortie", default="."); ap.add_argument("--tailles"); ap.add_argument("--fond", default="auto")
    ap.add_argument("--marge", type=float, default=0.06); ap.add_argument("--contour", type=float, default=0); ap.add_argument("--couleur-contour", default="#000000")
    ap.add_argument("--pixel", type=int, default=0); ap.add_argument("--aucun-nettoyage", action="store_true")
    ap.add_argument("--planche"); ap.add_argument("--taille", type=int, default=128); ap.add_argument("--colonnes", type=int)
    a = ap.parse_args()
    if a.planche:
        out = a.sortie if a.sortie.endswith(".png") else os.path.join(a.sortie, "planche.png")
        print("planche :", planche(a.planche, a.taille, out, a.colonnes), "images →", out); sys.exit(0)
    if not a.image: ap.error("donner une image (ou --planche dossier)")
    info = traiter(a.image, a.nom or os.path.splitext(os.path.basename(a.image))[0], a.type, a.sortie,
                   [int(t) for t in a.tailles.split(",")] if a.tailles else None, a.fond, a.marge, a.contour, couleur(a.couleur_contour), a.pixel, not a.aucun_nettoyage)
    print(json.dumps(info, ensure_ascii=False, indent=1))
