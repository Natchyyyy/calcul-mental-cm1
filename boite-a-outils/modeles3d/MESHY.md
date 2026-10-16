# Faire un modèle 3D avec Meshy (meshy.ai) et le mettre dans un jeu web

Ce qui a marché pour la salle des trophées (41 modèles).

## Dans Meshy (dans le navigateur de l'utilisateur, connecté à son compte)
1. **Image d'abord** : panneau « Image », modèle Nano Banana Pro, 2 images (≈ 18 crédits). Prompt court : l'objet seul,
   fond neutre, vue de trois quarts, style voulu (ex. « stylized carved wooden lectern, game asset, neutral background »).
2. Survoler l'image retenue → **« Image vers 3D »**, texture activée (≈ 35 crédits).
3. **Remaillage** (gratuit) : choisir le nombre de triangles. Ne pas trop réduire, sinon c'est moche :
   petits objets 10 000 · objets moyens et statues 30 000 · gros décor détaillé (bibliothèque, porte, cheminée) 100 000.
4. **Télécharger** en GLB.
5. Ne jamais créer de compte, saisir de mot de passe ou payer : c'est à l'utilisateur de le faire.

Astuce pour piloter l'interface : la taille de la fenêtre change les positions des boutons ; mieux vaut
trouver les boutons par leur texte (petites fonctions JavaScript) que cliquer à des coordonnées fixes.

## Ensuite, ici
1. Récupérer le .glb (fichier joint, ou dossier Téléchargements si l'ordinateur est relié).
2. Alléger les textures (la géométrie ne change pas) :
   `python3 alleger_glb.py brut.glb objet.glb 1024,1024,512`  (couleur, relief, métal/rugosité ; 2048 pour les très gros objets)
3. `python3 glb_en_js.py dossier_glb modeles` → `modeles/objet.js` + `liste.json`.
4. Dans la page : three.js + GLTFLoader, `chargeur.js`, puis `Modeles.charger([...])` et `Modeles.copie("objet", largeur, hauteur)`.
5. Toujours garder un modèle de secours dessiné par programme si le fichier manque.
6. Les répétitions (arbustes, poteaux, bougies…) : un seul `InstancedMesh` au lieu de 20 copies.
