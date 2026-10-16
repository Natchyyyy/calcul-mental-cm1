# Transforme des .glb en petits fichiers « modeles/<nom>.js » : MODELES_ADD("<nom>", "<base64>")
# Avantages : chargés par une simple balise <script> (marche aussi en file://, sans serveur), un fichier par modèle,
# et une liste.json (taille + sha256) pour qu'un programme de mise à jour sache quoi télécharger.
# usage : python3 glb_en_js.py dossier_glb dossier_sortie
import sys, os, base64, hashlib, json
src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True); liste = []
for f in sorted(os.listdir(src)):
    if not f.endswith(".glb") or f.endswith("_raw.glb"): continue
    k = f[:-4]; js = ('MODELES_ADD("%s","' % k + base64.b64encode(open(os.path.join(src, f), "rb").read()).decode() + '");\n').encode()
    open(os.path.join(dst, k + ".js"), "wb").write(js); liste.append({"n": k + ".js", "taille": len(js), "sha256": hashlib.sha256(js).hexdigest()})
    print(k, round(len(js)/1e6, 2), "Mo")
json.dump({"fichiers": liste}, open(os.path.join(dst, "liste.json"), "w"), indent=1)
print(len(liste), "modèles,", round(sum(x["taille"] for x in liste)/1e6, 1), "Mo")
