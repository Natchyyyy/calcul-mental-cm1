# Boîte à outils — petits jeux 3D dans le navigateur

Outils mis au point en construisant la salle des trophées 3D de l'appli Pythagore (three.js, modèles Meshy,
promenade à la première personne, bruitages). Tout est indépendant de l'appli : on peut s'en servir pour n'importe quel
nouveau projet (par exemple une taverne / un lobby où l'on se promène).

Pré-requis dans l'espace de travail : Python 3 avec numpy, scipy, Pillow, playwright (Chromium) ; ffmpeg avec libopus.
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` si Chromium est préinstallé là.

## Démarrer
```
cp -r boite-a-outils/ mon-jeu/              # ou travailler directement dedans
python3 boite-a-outils/serveur.py boite-a-outils 8765 &   # http://127.0.0.1:8765/gabarit/index.html
```
`gabarit/index.html` est un point de départ qui marche : scène three.js (r159, fichiers locaux dans `gabarit/vendor/`),
lumière, ombres, un modèle Meshy (un buis en pot), vue libre à la souris ET promenade (bouton « Se promener »), sons.

## Ce qu'il y a dedans

| Dossier / fichier | À quoi ça sert |
|---|---|
| `capture.py` | **Voir** une page 3D depuis le conteneur : captures d'écran avec WebGL logiciel, JavaScript entre les captures. Indispensable pour vérifier ce qu'on construit. |
| `planche.py` | Assembler plusieurs captures en une seule image. |
| `serveur.py` | Petit serveur local sans cache. |
| `promenade/promenade.js` | Marche à la première personne : ZQSD/WASD/flèches, Maj pour courir, souris (vitesse réglable 5 niveaux, touches + / −, sauts écrêtés), glisser si le verrou de souris est refusé, collisions (cercles, boîtes, limite ronde ou rectangulaire), sol à hauteur variable, balancement de tête, rappel à chaque pas (pour le son), touche E sur l'objet visé. |
| `modeles3d/MESHY.md` | La méthode Meshy qui a marché (image → 3D → remaillage → GLB) et les bons nombres de triangles. |
| `modeles3d/alleger_glb.py` | Réduire les textures d'un GLB Meshy (PNG → JPEG redimensionné) sans toucher la géométrie. |
| `modeles3d/glb_en_js.py` + `chargeur.js` | GLB → petits fichiers `.js` chargés par balise script (marche hors ligne), puis `Modeles.copie(nom, largeur, hauteur)`. |
| `sons/dsp.py` | Synthèse de bruitages naturels hors ligne : synthèse modale (objets frappés), bruit filtré, réverbération de pièce/salle/extérieur, normalisation, export Opus. |
| `sons/fabriquer.py` | Rend un module de sons → `.ogg` + `manifeste.json` (niveau moyen réglé par son, variantes). |
| `sons/exemples.py` | Exemples courts : clic bois, réussite marimba, carillon, pas, vent, pluie. |
| `sons/exemples_jeu.py`, `exemples_ambiance.py`, `exemples_doux.py` | Les ~55 sons de Pythagore : marimba, xylophone, cloches, pièces, bulle, tambour, sifflet, trombone, oiseaux, hibou, caisses ; pas pierre/tapis, feu et crépitements, armure, pendule, chouette, gramophone, page, coffre, télescope… |
| `sons/banc.py` | Page d'écoute (un bouton par son) à publier pour faire écouter et choisir. |
| **`sons/pas/`** | **Bruits de pas physiques, calés sur de vrais enregistrements** (bois et béton : 25 réglages tout prêts). `sons-de-pas.js` pour un jeu web (Worker, changement de sol et de pièce, autres personnages, branchement sur la promenade), `atelier.html` pour régler à l'oreille, `exporter.js` pour Unreal / Godot / Unity, outils pour caler une nouvelle surface. Voir `sons/pas/README.md`. |
| **`sons/armes/`** | **Coups de feu et explosions : de vrais tirs enregistrés (CC0) placés dans l'espace par la physique** (9 mm, pistolet-mitrailleur, 5,56, 7,62×39, 7,62×54, calibre 12, grenade) : distance, air, retard du son, claquement de la balle avant le coup, lieu. `sons-d-armes.js` + `banque/` pour un jeu web (le joueur tire, ennemis à distance, rafales, pompe, chargeur), `atelier.html` pour écouter, `exporter.py` pour Unreal / Godot / Unity. Voir `sons/armes/README.md`. |
| **`visuels/images/`** | **Images de jeu générées par IA** (Gemini dans le navigateur de l'utilisateur, Meshy en secours) : `prompt.py` (prompts + chartes de style par jeu), `traiter.py` (fond enlevé, recadrage, tailles, contour, pixel art, planche de sprites), mode d'emploi `GEMINI.md`. |
| `sons/integrer.py` + `lecteur.js` | Mettre les sons dans la page (un seul fichier) et les jouer : `Son.jouer("pas", {pan, vol, varie, reverb})`, limiteur en sortie. |
| `tests/verif_page.py` | Modèle de test automatique (Playwright) : ouvrir, agir, vérifier, compter les erreurs JS. |
| `PIEGES.md` | Les erreurs déjà rencontrées et leur solution. **À lire avant de commencer.** |

## Exemples (chaque ligne se lance depuis `boite-a-outils/`)
```
# voir la scène (mode manuel : le jeu n'avance que quand on appelle API.step)
python3 capture.py "http://127.0.0.1:8765/gabarit/index.html?manual=1" vue --attendre "window.PRET" \
   --etape "js:(API.step(3), 0)" --etape shot
# des sons
(cd sons && python3 fabriquer.py exemples --sortie ../gabarit/sons_out && python3 banc.py ../gabarit/sons_out ../banc.html)
# des pas physiques (voir sons/pas/README.md) : tests, page de réglage à publier, puis des fichiers dans le même dossier que les autres sons
(cd sons/pas && node tests/test_pas.js && python3 construire.py)
(cd sons/pas && node exporter.js --sortie ../../gabarit/sons_out --reglages "Parquet en chêne" --variantes 8)
(cd sons/armes && python3 construire.py && python3 exporter.py --sortie ../../gabarit/sons_out --armes "Pistolet 9 mm" --positions "tireur,40")
(cd sons && python3 integrer.py ../gabarit/sons_out ../gabarit/index.html)
# un modèle Meshy téléchargé
python3 modeles3d/alleger_glb.py brut.glb glb/objet.glb 1024,1024,512 && python3 modeles3d/glb_en_js.py glb gabarit/modeles
```
