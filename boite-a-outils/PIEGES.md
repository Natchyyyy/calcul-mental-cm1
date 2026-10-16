# Pièges déjà rencontrés (et la solution)

## Voir la 3D depuis le conteneur
- Sans carte graphique : Chromium avec `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` (déjà dans `capture.py`).
- SwiftShader est **lent** (une image d'une grosse scène : 5 à 60 s ; le chargement de 40 modèles : plusieurs minutes).
  Lancer les rendus longs en arrière-plan (`setsid nohup … &`) et vérifier ensuite. Ne pas lancer deux gros rendus en même temps :
  ils se ralentissent et les captures dépassent le délai.
- Prévoir dans le jeu un **mode manuel** (`?manual=1`) : pas de boucle d'animation, `window.API.step(n, dt)` fait avancer le temps.
  Images reproductibles, et on peut placer la caméra par JavaScript avant chaque capture.
- `page.evaluate("…")` : si l'expression vaut une **fonction**, Playwright l'**appelle** (sans arguments, d'où des NaN partout).
  Pour définir une fonction : `(window.f = (a) => …, 0)`.
- Les animations CSS ont besoin de temps réel : `--etape wait:800` avant la capture.

## Promenade
- `PointerLockControls` de three.js tourne trop vite sur certaines souris (gros DPI) et fait des sauts : on gère la souris
  soi-même (`promenade.js`) avec 0,0008 rad/pixel × niveau, et on écrête chaque mouvement à ±80 px.
- Quand on ouvre un panneau (livre, menu), le navigateur rend la souris → l'évènement « unlock » ne doit pas faire quitter
  la promenade. Après la fermeture, il faut un clic pour reprendre la souris (règle des navigateurs).
- Placer les objets **entre** les colonnes, pas derrière : vérifier par calcul (angle et rayon) qu'ils ne se cachent pas
  derrière un pilier vu depuis le centre, puis vérifier en capture.
- Ajouter chaque meuble aux collisions (`P.cercles` / `P.boites`).

## Modèles Meshy
- Ne pas trop réduire les triangles (sinon c'est moche) : 10 000 petits objets, 30 000 moyens, 100 000 gros décors détaillés.
- Les modèles Meshy sont souvent trop clairs sous les lumières de la scène : baisser un peu la couleur (×0,85–0,9) et
  monter la rugosité (≥ 0,35).
- Objets répétés : `InstancedMesh` (un seul appel de dessin).
- Garder toujours un modèle de secours dessiné par programme.

## Lumière / rendu
- Beaucoup de lumières = lent (chaque lumière est calculée pour chaque pixel). Peu d'ombres portées (les spots les plus utiles).
- Ombres : `renderer.shadowMap.autoUpdate = false` et `needsUpdate = true` une image sur deux suffit si la scène bouge lentement.
- Si l'ordinateur rame (moyenne > 1/30 s pendant 4 s) : baisser la résolution, puis couper ombres des spots et halo (bloom).
- Le halo (bloom) avec un seuil trop bas rend tout laiteux : seuil ≈ 0,95, force ≈ 0,3.
- Verre (cloches, vitres) : opacité très faible (≈ 0,02) sinon voile blanc.
- Ciel de nuit : un shader sur une grande sphère (`gl_Position = p.xyww`, sans brouillard, sans tone mapping) ; étoiles par cellules
  aléatoires, Voie lactée en bruit fractal, lune avec cratères ; c'est beaucoup plus beau qu'une texture.

## Sons
- Les bips (oscillateurs purs) sonnent « robotique » : utiliser des échantillons fabriqués avec `sons/` (résonances, réverb, variantes).
- **Vérifier le volume** par rapport à l'existant : les premiers rendus étaient 7 à 30 dB trop forts. Régler le niveau moyen
  (`rms`) de chaque son, et un limiteur en sortie (dans `lecteur.js`).
- Jamais deux fois la même variante d'affilée ; petite variation de hauteur (`varie: .03`) pour les sons répétés (pas, clics).
- Le son ne peut démarrer qu'après un clic ou une touche : décoder les sons au premier geste.
- Opus (ogg) mono 40 kbit/s suffit pour les bruitages ; stéréo seulement pour les ambiances.
- Écouter, c'est l'utilisateur qui le fait : publier un banc d'écoute (`banc.py`) et lui demander ce qui ne va pas.

## Outils
- `rm` avec un chemin relatif après `cd` est bloqué par sécurité : utiliser des chemins absolus.
- Dans ces conteneurs, l'accès Internet est limité (pas de banques de sons) : tout se fabrique sur place.

## Sons de pas physiques (sons/pas)
- **Comparer à de vrais enregistrements, pas à son idée** : la v1 « à l'intuition » était 20 dB trop brillante et trop
  résonante, invisible sans mesure. GitHub est accessible : des dépôts de jeux libres contiennent des pas CC0
  (minetest_game, CDDA-Soundpacks avec credits.md). Mesurer (`mesure/mesures.py`), puis caler (`mesure/calibrer2.js`).
- Avoir une **échelle** avant de juger : l'écart d'un vrai pas à sa propre série (0,7–4,3) dit ce qu'est « assez proche ».
- **Regarder la structure temporelle** des vrais sons (planche de spectrogrammes, enveloppes aigus / graves séparées) :
  c'est comme ça qu'est apparu le second claquement du talon ~18 ms après le premier.
- Un banc de résonateurs qui s'arrête « quand c'est silencieux » doit attendre la **fin de l'excitation** (sinon il
  s'arrête avant l'impact et ne produit rien) ; borner plutôt par le temps de décroissance (t60 × 1,7 = −100 dB).
- Ne pas tronquer la liste des modes d'une plaque aux N premiers : ça supprime tous les aigus. Garder tout sous ~9 kHz.
- **Un générateur aléatoire par couche** (frottement, grincement…) : sinon bouger un curseur change le hasard de tout
  le reste, les A/B mentent et les mesures « avec / sans » sont fausses.
- Des curseurs en butée après calibration = échelle mal centrée : recentrer la formule (sans changer le son).
- Échos par sources-images parfaitement réguliers entre deux murs proches = son « en tube » qui gonfle ; ajouter une
  diffusion à chaque rebond (gain et signe aléatoires, petit décalage).
- Dans un jeu, calculer les pas dans un **Worker** (`Pas.__fabrique.toString()` dans un Blob) et garder une réserve de
  variantes, avec un secours synchrone si la réserve est vide (sinon le premier pas de course est muet).
- Un vrai enregistrement peut contenir un **grondement de micro** (vent, manipulation) sous 100 Hz qui fausse tout,
  jusqu'au repérage du début du pas : regarder la forme d'onde, filtrer (`mesures.py --passe-haut 90`), ignorer ces bandes
  (`fmin`). Et un enregistrement fait dans une pièce qui résonne se compare à la synthèse **avec** sa pièce.
- Sur béton, la dalle ne vibre presque pas : ce qu'on entend, c'est la chaussure et le choc. Ne pas forcer un modèle de
  planches : changer de modèle physique quand la matière change.

## Images générées par IA (visuels/images)
- Le conteneur ne joint pas l'API de Gemini : passer par le navigateur où l'utilisateur est connecté (Gemini refuse de
  créer des images sans compte). Ne jamais saisir de mot de passe : c'est l'utilisateur qui se connecte.
- Les images d'une page ne se lisent pas par JavaScript (protection du navigateur, adresses à jetons masquées) :
  utiliser le bouton de téléchargement du site, puis le dossier Téléchargements via l'ordinateur relié.
- Toujours demander un fond **uni** (vert pur, ou magenta si le sujet est vert) : c'est ce qui permet un détourage propre.
- Estimer le bruit du fond sur les seuls pixels de fond (un buste touche souvent le bord de l'image).
- Pixel art : calculer la palette sur les pixels visibles seulement (sinon le fond enlevé « teinte » le sujet).
- Ne pas lancer de génération (ni dépenser de crédits Meshy) sans que l'utilisateur l'ait demandé.
