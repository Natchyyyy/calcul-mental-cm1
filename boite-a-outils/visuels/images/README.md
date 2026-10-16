# Images de jeu générées par IA (Gemini, Meshy)

Pour qu'une conversation Claude puisse, sur simple demande (« génère-moi une icône avec une arme », « un portrait 2D
d'agent pour mon jeu »), obtenir une image d'une IA et la rendre **utilisable tout de suite dans un jeu**.

| Fichier | À quoi ça sert |
|---|---|
| `GEMINI.md` | **Le mode d'emploi** pas à pas : prompt → Gemini dans le navigateur de l'utilisateur → téléchargement → traitement. Meshy en secours. |
| `prompt.py` | Fabrique le prompt (cadrage selon le type, style ou charte du jeu, fond uni facile à enlever, « pas de texte ni de logo »). |
| `chartes/*.json` | Styles réutilisables : tactique, horreur, fantaisie, cartoon, pixel, icônes plates. Une charte par jeu = des images qui vont ensemble. |
| `traiter.py` | Prépare l'image : fond enlevé (bords doux, sans liseré vert), filigrane ou poussières effacés, recadrage, tailles, contour, pixel art, planche de sprites + atlas JSON. |
| `tests/test_traiter.py` | Vérifie le traitement sur des images de synthèse (`python3 tests/test_traiter.py`, `VOIR=dossier` pour garder les images). |

## En bref
```
python3 prompt.py --type icone --sujet "a combat knife with a black handle" --charte chartes/tactique.json --nom couteau
#   → coller le prompt dans Gemini (voir GEMINI.md), télécharger l'image
python3 traiter.py couteau_brut.png --nom couteau --type icone --contour 6 --sortie mon_jeu/icones
python3 traiter.py --planche mon_jeu/icones --taille 128 --sortie mon_jeu/icones_planche.png
```
Dans Unreal : importer les PNG (ils ont déjà la transparence) ; pour une planche, l'atlas JSON donne x, y, w, h de chaque
icône (Paper2D ou UMG « Draw As Image » avec une région). Dans un jeu web : `<img src="couteau_128.png">` ou une texture three.js.

Pré-requis : Python 3 avec numpy, scipy, Pillow (déjà là dans les conteneurs Claude).
