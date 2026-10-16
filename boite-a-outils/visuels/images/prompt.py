# Fabrique le prompt à donner à Gemini (ou Meshy / Nano Banana) pour une image de jeu, et la commande de traitement.
# Le prompt est en anglais (les générateurs le comprennent le mieux) ; le sujet peut être écrit en anglais ou en français.
#
# usage : python3 prompt.py --type portrait --sujet "fictional French police tactical operator, black helmet, balaclava" \
#                           [--style realiste | --charte chartes/tactique.json] [--fond auto|vert|magenta|aucun] [--nom agent]
# Types : portrait, icone, objet, personnage, decor, texture.   Styles : voir STYLES (ou une charte JSON de jeu).
import argparse, json, os, re, sys

STYLES = {
    "realiste": "stylized semi-realistic digital painting, game card art, crisp clean edges, soft dramatic studio lighting",
    "cartoon":  "stylized cartoon game art, bold clean outlines, vibrant flat colors with soft cel shading",
    "pixel":    "16-bit pixel art style, crisp hard pixel edges, limited palette, no anti-aliasing, no blur",
    "plat":     "flat vector icon style, simple bold geometric shapes, thick clean outline, minimal shading",
    "peint":    "hand-painted fantasy game art, painterly brush strokes, warm rich colors, soft rim light",
    "sombre":   "dark gritty horror game art, desaturated colors, harsh low-key lighting, unsettling mood",
    "tactique": "realistic military tactical game art, muted olive and grey palette, sharp details, cinematic lighting",
    "jouet":    "cute stylized 3D render like a vinyl toy, smooth rounded shapes, soft studio lighting",
}
CADRAGE = {
    "portrait":   "head-and-shoulders bust portrait, three-quarter view, centered, the shoulders reaching the bottom edge of the image",
    "icone":      "single game icon, the object centered and fully visible with generous empty margin around it, readable at small size, strong silhouette",
    "objet":      "single game item, centered, fully visible with empty margin around it, three-quarter view",
    "personnage": "full-body character, standing, neutral pose, head to feet fully visible with empty margin, centered",
    "decor":      "wide game background scene, no characters in the foreground, 16:9 composition",
    "texture":    "seamless tileable texture, flat top-down view, even lighting, no perspective, no objects, edges that tile perfectly",
}
SANS = "no text, no letters, no numbers, no watermark, no signature, no logo, no brand, no real insignia or emblem, no frame, no border"
FONDS = {"vert": ("bright pure green", "#00FF00"), "magenta": ("bright pure magenta", "#FF00FF")}
MOTS_VERTS = r"\b(vert|verte|green|plante|plant|herbe|grass|feuille|leaf|leaves|forêt|forest|gobelin|goblin|orc|slime|émeraude|emerald|jade|cactus|mousse|moss|zombie)\b"
DETOURE = {"portrait", "icone", "objet", "personnage"}


def construire(typ, sujet, style=None, charte=None, fond="auto"):
    st = STYLES.get(style or "realiste", style or STYLES["realiste"])
    extra = ""
    if charte:   # charte de jeu : même style pour toutes les images d'un jeu (cohérence)
        st = charte.get("style", st); extra = ", ".join(x.strip().rstrip(".") for x in (charte.get("palette"), charte.get("eclairage"), charte.get("ajouts")) if x)
    c = CADRAGE[typ]; morceaux = [f"{c[0].upper() + c[1:]}. Subject: {sujet.strip().rstrip('.')}.", st[0].upper() + st[1:] + "."]
    if extra: morceaux.append(extra[0].upper() + extra[1:] + ".")
    choix = None
    if typ in DETOURE and fond != "aucun":
        choix = fond if fond in FONDS else ("magenta" if re.search(MOTS_VERTS, sujet, re.I) else "vert")
        nom, hexa = FONDS[choix]
        morceaux.append(f"The subject is isolated on a perfectly flat, uniform {nom} background ({hexa}), "
                        f"with no shadow on the background, no gradient, no floor, and no {nom.split()[-1]} anywhere on the subject.")
    morceaux.append(SANS[0].upper() + SANS[1:] + ".")
    if typ != "decor": morceaux.append("Square 1:1 image.")
    return " ".join(morceaux), choix


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Prompt de génération d'image pour un jeu.")
    ap.add_argument("--type", default="objet", choices=list(CADRAGE)); ap.add_argument("--sujet", required=True)
    ap.add_argument("--style", help="un des styles : " + ", ".join(STYLES) + " (ou une description libre en anglais)")
    ap.add_argument("--charte", help="fichier JSON de charte d'un jeu (voir chartes/)"); ap.add_argument("--fond", default="auto")
    ap.add_argument("--nom", default="image")
    a = ap.parse_args()
    charte = json.load(open(a.charte, encoding="utf-8")) if a.charte else None
    p, choix = construire(a.type, a.sujet, a.style, charte, a.fond)
    print("PROMPT (à coller tel quel) :\n" + p)
    ici = os.path.dirname(os.path.abspath(__file__))
    print("\nENSUITE :\npython3 " + os.path.join(ici, "traiter.py") + f" <image téléchargée> --nom {a.nom} --type {a.type}" + (f" --fond {choix}" if choix else "") + " --sortie <dossier du jeu>")
