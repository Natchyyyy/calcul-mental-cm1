# Générer une image de jeu avec Gemini (ou Meshy en secours) — mode d'emploi pour Claude

But : quand l'utilisateur demande « génère-moi un portrait 2D d'un agent pour mon jeu » ou « une icône avec une arme »,
Claude fabrique le prompt, fait générer l'image par Gemini dans le navigateur de l'utilisateur, la récupère,
puis la prépare pour le jeu (fond transparent, recadrage, tailles) avec `traiter.py`.

Le conteneur de Claude **ne peut pas** appeler l'API de Gemini (réseau limité aux dépôts de paquets et à GitHub) :
tout passe par un navigateur où **l'utilisateur est connecté** à son compte Google.

## 0. Avant de commencer
- **Navigateur** : Claude in Chrome (le vrai Chrome de l'utilisateur, outils `mcp__claude-in-chrome__*`) ou le navigateur
  intégré de l'appli Claude (`…Claude_Browser__*`). Lire d'abord la compétence du navigateur choisi.
- **Connexion** : Gemini **refuse de créer des images sans compte** (vérifié le 16/10/2026 : réponse « Connectez-vous pour
  accéder aux applis Google, créer des images et bien plus »). Si la page montre « Se connecter », demander à
  l'utilisateur de se connecter lui-même dans cet onglet (Claude ne saisit jamais de mot de passe). Une fois connecté,
  la connexion reste pour les fois suivantes.
- **Ce qu'on ne demande pas** : pas de vraie personne reconnaissable, pas de vrai logo, insigne officiel, drapeau ou
  marque (ex. « agent façon GIGN » → un agent d'intervention **fictif**, sans écusson), pas de personnage protégé
  (héros de films, de jeux, mascottes). Le prompt de `prompt.py` ajoute déjà « no logo, no real insignia, no text ».

## 1. Le prompt
```
python3 prompt.py --type portrait --sujet "a fictional French police tactical operator, black helmet, balaclava" --charte chartes/tactique.json --nom agent
```
- Types : `portrait`, `icone`, `objet`, `personnage`, `decor`, `texture`. Styles : `realiste`, `cartoon`, `pixel`, `plat`,
  `peint`, `sombre`, `tactique`, `jouet` — ou une **charte** de jeu (`chartes/*.json`) pour que toutes les images d'un même
  jeu aient le même style. Pour un nouveau jeu : copier une charte, l'adapter, la ranger avec le jeu.
- Le fond est un **vert pur uni** (ou **magenta** si le sujet contient du vert : choisi automatiquement), pour pouvoir
  l'enlever proprement ensuite. Écrire le sujet en anglais de préférence.

## 2. Dans Gemini
1. Ouvrir un **nouvel onglet** sur `https://gemini.google.com/app` (ne pas réutiliser les onglets de l'utilisateur).
2. Trouver le champ de saisie par son texte, pas par des coordonnées : `find` « Saisissez un prompt pour Gemini » (FR) ou
   « Enter a prompt » (EN). Cliquer, taper `Create an image: ` suivi du prompt, appuyer sur Entrée.
3. Attendre 10–40 s (`wait` par 10 s), puis une capture d'écran pour **regarder** le résultat. Si l'image ne convient pas,
   demander une correction dans la même conversation Gemini (« same image but … ») plutôt que tout recommencer.
4. Si Gemini répond qu'il ne peut pas créer d'image : vérifier la connexion (point 0) ; sinon passer à Meshy (section 4).

## 3. Récupérer l'image
- Les images de la page sont **protégées** : un `fetch` depuis la page échoue (vérifié sur Meshy), et les adresses avec
  jetons sont masquées dans les réponses des outils. Ne pas insister.
- Passer par le **bouton de téléchargement** de l'image (survoler l'image, puis chercher un bouton dont le libellé contient
  « Télécharger » / « Download », par `find` ou par JavaScript sur `aria-label`). Le fichier part dans le dossier
  **Téléchargements** de l'utilisateur. Demander d'abord son accord en une phrase (nom du fichier, gemini.google.com,
  ≈ 1–2 Mo) : c'est un téléchargement sur son ordinateur.
- Ramener le fichier ici :
  - si les outils de l'ordinateur relié (`mcp__remote-devices__device_*`) sont là : `device_request_folder_access`
    sur `~/Downloads` (une seule fois, l'utilisateur accepte), `device_list_dir` pour trouver le fichier le plus récent,
    `device_stage_files` → il arrive dans `/mnt/user-data/uploads/…` ;
  - sinon : demander à l'utilisateur de **joindre** l'image à la conversation.

## 4. Meshy en secours (même moteur Google « Nano Banana »)
Si Gemini n'est pas utilisable et que l'utilisateur est connecté à meshy.ai (vérifié dans son Chrome le 16/10/2026) :
`https://www.meshy.ai/fr/workspace` → bouton **Image** (barre de gauche) → modèle « Nano Banana Pro » → champ « Décrivez
l'image… » → format (1:1 coché par défaut) → nombre d'images → **Générer**. **Coût : 9 crédits par image** (affiché à côté
du bouton, ex. « 9 x 2 = 18 ») : prévenir l'utilisateur avant de dépenser ses crédits. ≈ 30–40 s. Chaque vignette a un bouton
de téléchargement (icône `tabler-icon-download`). Les vignettes générées apparaissent en haut à gauche de la grille.
Le fond vert demandé dans le prompt est bien respecté (vérifié).

## 5. Préparer pour le jeu
```
python3 traiter.py ~/…/image.png --nom agent --type portrait --sortie <dossier du jeu>/images
```
→ `agent_detoure.png` (pleine résolution, fond transparent), `agent_512.png`, `agent_256.png`, `agent_128.png`, `agent.json`.
- `--type icone` : 256/128/64/32 ; `--contour 6` pour un contour net (style autocollant) ; `--pixel 32` pour une vraie
  version pixel art (palette réduite, bords nets).
- Le petit logo que Gemini peut ajouter dans un coin est effacé automatiquement (morceau détaché du sujet) ; sur un
  **décor** (pas de détourage), recadrer ce coin si besoin.
- Plusieurs icônes → une planche de sprites + son atlas : `python3 traiter.py --planche dossier_png --taille 128 --sortie planche.png`.
- **Regarder** le résultat (Read sur le PNG, ou sur un damier) avant de l'intégrer, et le montrer à l'utilisateur.

## Ce qui a été vérifié / ce qui reste à confirmer (16/10/2026)
- Vérifié : Gemini exige d'être connecté pour les images ; Meshy génère bien sur fond vert uni ; les images d'une page
  ne se lisent pas par JavaScript ; `traiter.py` (tests : `python3 tests/test_traiter.py`).
- À confirmer à la première vraie utilisation connectée : le libellé exact du bouton de téléchargement de Gemini, et la
  présence ou non d'un filigrane visible. Mettre à jour ce fichier avec ce qui a marché (comme `modeles3d/MESHY.md`).
