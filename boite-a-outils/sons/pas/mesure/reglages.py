# Regénère les réglages tout prêts de ../pas.js à partir des ancres calibrées (ancres_bois.json, ancres_beton.json).
# Avec une sortie de calibrer2.js, reporte d'abord les constantes du moteur et les nouvelles ancres.
# usage : python3 reglages.py                         (regénère seulement les réglages)
#         python3 reglages.py --bois sortie.json      (après node calibrer2.js cfg_bois.json sortie.json …)
#         python3 reglages.py --beton sortie.json     (après node calibrer2.js cfg_beton.json sortie.json …)
#         … --forcer : appliquer même si la calibration n'a pas fait mieux que son point de départ
# Les réglages « calés » SONT les ancres ; les autres en dérivent en ne changeant que ce qui change dans la réalité
# (essence, chaussure, poids, pièce…). Ensuite : node ../tests/test_pas.js
import json, os, re, sys
H = os.path.dirname(os.path.abspath(__file__)); PAS = os.path.join(H, "..", "pas.js")
s = open(PAS, encoding="utf-8").read()
def ancres(nom): p = os.path.join(H, f"ancres_{nom}.json"); return json.load(open(p)) if os.path.exists(p) else {}
A = {"bois": ancres("bois"), "beton": ancres("beton")}
for fam in ("bois", "beton"):
    if "--" + fam not in sys.argv: continue
    C = json.load(open(sys.argv[sys.argv.index("--" + fam) + 1]))
    if "depart" in C and C["ecart"] > C["depart"] - 1e-9 and "--forcer" not in sys.argv:
        sys.exit(f"{fam} : résultat refusé, écart {C['ecart']:.3f} pas meilleur que le départ {C['depart']:.3f} (--forcer pour l'appliquer quand même).")
    cfg = json.load(open(os.path.join(H, f"cfg_{fam}.json"))); bases = {c["cible"]: c.get("base", {}) for c in cfg["cibles"]}
    for r in C["reglages"]: A[fam][r["cible"]] = {**bases.get(r["cible"], {}), **A[fam].get(r["cible"], {}), **r["reglages"]}
    json.dump(A[fam], open(os.path.join(H, f"ancres_{fam}.json"), "w"), indent=1)
    for k, v in C["globales"].items(): s, n = re.subn(r"\b%s = [-0-9.e]+" % k, "%s = %s" % (k, f"{v:.4g}"), s, count=1); assert n == 1, k
    print(fam, ": constantes et ancres mises à jour, écart", round(C["ecart"], 3))

r3 = lambda d: {k: (round(v, 3) if isinstance(v, float) else v) for k, v in d.items()}
B = {k: r3(v) for k, v in A["bois"].items()}; K, M, KN = B["cibles/bois_kretopi.json"], B["cibles/bois_minetest.json"], B["cibles/bois_kenney.json"]
salon = {"longueur": 5.5, "largeur": 4.2, "hauteur": 2.6, "absorption": 0.22, "clarte": 0.45}
P = {
 # ---------- bois ----------
 "Parquet en chêne": {**M, **salon},
 "Vieux plancher massif": {**K, "longueur": 4.5, "largeur": 4, "hauteur": 2.7, "absorption": 0.2, "clarte": 0.4},
 "Parquet fin, semelles souples": {**KN, **salon},
 "Plancher qui grince": {**K, "essence": 0.4, "amorti": 0.6, "lache": 0.35, "grince": 0.5, "grinceForce": 0.55, "grinceHauteur": 260, "poussiere": 0.2, "longueur": 4.5, "largeur": 3.8, "hauteur": 2.5, "absorption": 0.18, "clarte": 0.4},
 "Escalier en bois": {**K, "essence": 0.6, "epaisseur": 30, "portee": 70, "support": 1, "amorti": 0.5, "pointe": 0.3, "appui": 0.6, "longueur": 3, "largeur": 1.4, "hauteur": 6, "absorption": 0.1, "clarte": 0.5},
 "Ponton au bord de l'eau": {**K, "essence": 0.35, "epaisseur": 28, "portee": 60, "support": 1, "amorti": 0.6, "lache": 0.45, "grince": 0.1, "grinceForce": 0.35, "poussiere": 0.3, "frottement": 0.25, "durete": 0.65, "longueur": 30, "largeur": 30, "hauteur": 12, "absorption": 0.9, "clarte": 0.3},
 "Baskets sur parquet vitrifié": {**M, "durete": 0.32, "claque": 0, "frottement": 0.2, "crissement": 0.25, "appui": 0.5, "pointe": 0.25, **salon, "absorption": 0.15, "clarte": 0.55},
 "Talons sur parquet": {**M, "durete": 0.97, "claque": 0.7, "talonF": 2900, "pointe": 0.3, "poids": 0.55, "appui": 0.6, "frottement": 0.05, "longueur": 9, "largeur": 6, "hauteur": 3.2, "absorption": 0.12, "clarte": 0.55},
 "Bottes, personnage lourd": {**K, "durete": 0.85, "claque": 0.35, "talonF": 1500, "poids": 1.3, "appui": 0.7, "pointe": 0.35, "allure": 1.6, "longueur": 6, "largeur": 5, "hauteur": 2.8, "absorption": 0.2},
 "Course sur plancher": {**K, "durete": 0.5, "allure": 2.8, "appui": 0.8, "pointe": 0.6, "variation": 0.6, "frottement": 0.25, "longueur": 6, "largeur": 5, "hauteur": 2.8},
 "Pas furtifs": {**K, "durete": 0.5, "appui": 0.04, "pointe": 0.5, "allure": 1.1, "frottement": 0.12, "variation": 0.6, "longueur": 6, "largeur": 5, "hauteur": 2.8},
 "Pieds nus": {**M, "durete": 0, "claque": 0, "frottement": 0.1, "poids": 0.5, "appui": 0.35, "pointe": 0.5, **salon},
 "Grenier poussiéreux": {**K, "essence": 0.3, "epaisseur": 22, "portee": 60, "support": 0.9, "amorti": 0.48, "lache": 0.3, "grince": 0.35, "grinceForce": 0.45, "grinceHauteur": 380, "poussiere": 0.6, "frottement": 0.3, "durete": 0.7, "allure": 1.4, "longueur": 8, "largeur": 5, "hauteur": 2.2, "absorption": 0.3, "clarte": 0.3},
 "Chalet en bois": {**K, "essence": 0.35, "epaisseur": 30, "portee": 50, "support": 0.8, "amorti": 0.55, "lache": 0.15, "longueur": 5, "largeur": 4, "hauteur": 2.4, "absorption": 0.15, "clarte": 0.35},
 "Grande salle de taverne": {**K, "durete": 0.75, "poids": 0.9, "lache": 0.15, "grince": 0.1, "grinceForce": 0.35, "longueur": 14, "largeur": 10, "hauteur": 5, "absorption": 0.12, "clarte": 0.4},
}
CAL = {"Parquet en chêne": "minetest", "Vieux plancher massif": "kretopi", "Parquet fin, semelles souples": "kenney"}
if A["beton"]:
    T = {k: r3(v) for k, v in A["beton"].items()}; IJ, MT = T["cibles/beton_ij.json"], T["cibles/beton_mt.json"]
    sec = {"lache": 0, "grince": 0}
    P.update({
     # ---------- béton ----------
     "Béton, chaussures de ville": {**MT, **sec, **salon, "absorption": 0.12, "clarte": 0.55},
     "Cave en béton, talons": {**IJ, **sec},
     "Couloir en béton": {**MT, **sec, "longueur": 30, "largeur": 2.4, "hauteur": 3, "absorption": 0.06, "clarte": 0.6},
     "Parking souterrain": {**MT, **sec, "poussiere": 0.4, "frottement": 0.25, "longueur": 30, "largeur": 25, "hauteur": 2.8, "absorption": 0.05, "clarte": 0.45},
     "Escalier de secours en béton": {**MT, **sec, "pointe": 0.3, "appui": 0.65, "longueur": 4, "largeur": 2.5, "hauteur": 12, "absorption": 0.04, "clarte": 0.6},
     "Trottoir, dehors": {**MT, **sec, "poussiere": 0.45, "frottement": 0.25, "longueur": 30, "largeur": 30, "hauteur": 12, "absorption": 0.9, "clarte": 0.3},
     "Rangers militaires sur béton": {**MT, **sec, "durete": 0.85, "claque": 0.25, "talonF": 1400, "poids": 1.2, "appui": 0.75, "pointe": 0.45, "allure": 1.9, "poussiere": 0.3, "longueur": 12, "largeur": 8, "hauteur": 3.5, "absorption": 0.1},
     "Baskets sur béton": {**MT, **sec, "durete": 0.32, "claque": 0, "frottement": 0.2, "crissement": 0.15, "appui": 0.5, "pointe": 0.3, **salon, "absorption": 0.12},
     "Pas furtifs sur béton": {**MT, **sec, "durete": 0.5, "appui": 0.04, "pointe": 0.5, "allure": 1.1, "frottement": 0.15, "variation": 0.6, "longueur": 12, "largeur": 8, "hauteur": 3, "absorption": 0.08},
     "Pieds nus sur béton": {**MT, **sec, "durete": 0, "claque": 0, "frottement": 0.1, "poids": 0.5, "appui": 0.35, "pointe": 0.5, "poussiere": 0.15, **salon, "absorption": 0.12},
    })
    CAL.update({"Béton, chaussures de ville": "minetest (sol dur)", "Cave en béton, talons": "InspectorJ"})
bloc = ("  // ---------- réglages tout prêts (générés par mesure/reglages.py ; les réglages de CALES sont calés sur de vrais pas) ----------\n"
        "  PRESETS = " + json.dumps(P, ensure_ascii=False, indent=1).replace("\n", "\n  ") + ";\n"
        "  api.CALES = " + json.dumps(CAL, ensure_ascii=False) + ";   // réglages calés automatiquement sur de vrais enregistrements\n")
s, n = re.subn(r"  // ---------- réglages tout prêts.*?api\.CALES = .*?\n", lambda m: bloc, s, count=1, flags=re.S); assert n == 1
open(PAS, "w", encoding="utf-8").write(s); print("réglages écrits dans pas.js :", len(P))
