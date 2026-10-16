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
