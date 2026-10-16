# Sons de pas — synthèse physique, calée sur de vrais enregistrements

Des bruits de pas **calculés**, sans aucun fichier son : le talon qui écrase le sol, les planches qui vibrent, la pièce
qui répond. Chaque pas est différent, comme en vrai. Deux matières : **le bois** (parquet, plancher, escalier, ponton…)
et **le béton / la pierre** (cave, couloir, parking, escalier de secours, trottoir…).

Les réglages marqués « calé » ont été ajustés automatiquement pour que leur spectre, leur décroissance et leur brillance
collent à de vrais enregistrements : **13 pas sur bois** (3 sources) et **12 pas sur béton** (2 sources). Résultat mesuré : nos pas sont aussi
proches de ces enregistrements qu'un vrai pas l'est de sa propre série (voir « Fidélité » plus bas).

| Fichier | À quoi ça sert |
|---|---|
| `pas.js` | Le moteur (aucune dépendance, navigateur et Node). `Pas.rendre(réglages, graine)` → un pas (Float32Array, 48 kHz). |
| `sons-de-pas.js` | **Le lecteur pour un jeu web** : réserve de variantes calculées dans un Worker (aucune image qui saute), changement de sol et de pièce, distance et côté pour les autres personnages, branchement direct sur `promenade/promenade.js`. |
| `atelier.html` | Page pour **régler à l'oreille** (curseurs, plancher à frapper, spectrogramme, A/B, comparaison avec les vrais enregistrements). À publier comme artifact pour l'utilisateur. Construite par `construire.py`. |
| `exemple.html` | Petite démo jouable (vue de dessus : salon, escalier, taverne avec un marcheur, ponton). `exemple_seul.html` = la même en un seul fichier. |
| `exporter.js` | Fabrique des **fichiers** (.ogg / .wav) pour un autre moteur (Unreal, Godot, Unity) ou pour `sons/integrer.py`. |
| `mesure/` | Les outils de mesure et de calibration (voir « Caler une nouvelle surface »). |
| `vrais/` | Les vrais enregistrements utilisés dans l'atelier pour comparer à l'oreille (kretopi et Kenney en CC0, InspectorJ en CC BY 4.0 : voir `vrais/CREDITS.md`). |
| `tests/` | `node tests/test_pas.js` (moteur + fidélité) et `python3 tests/verif_pages.py` (les deux pages dans Chromium). |

## Dans un jeu web (le plus simple)
```html
<script src="pas.js"></script>
<script src="sons-de-pas.js"></script>
<script>
const pas = SonsDePas.creer({ surface: "Parquet en chêne" });     // le son démarre au premier clic / touche
pas.jouer();                                                       // un pas du joueur
pas.jouer({ force: .7, cote: -1 });                                // pied gauche, plus doux (force 0–1,5)
pas.jouer({ course: true });                                       // pas de course
pas.jouer({ surface: "Bottes, personnage lourd", distance: 6, pan: .4 });   // un autre personnage, à 6 m à droite
pas.surface("Escalier en bois");                                   // on change de sol (la pièce reste la même)
pas.piece({ longueur: 14, largeur: 10, hauteur: 5, absorption: .12 });   // on change de pièce (l'écho, calculé en arrière-plan)
pas.piece("Grande salle de taverne");                              // ou : la pièce d'un réglage tout prêt
pas.precharger("Ponton au bord de l'eau");                         // préparer d'avance le sol de la zone voisine
</script>
```
Avec la promenade de la boîte à outils : `Promenade(camera, renderer.domElement, { …, pas: pas.pourPromenade() })` (le
rappel `pas` reçoit `{cote, course, force}` et joue le bon pied). Dans `gabarit/index.html`, remplacer la ligne
`pas: p => Son.jouer("pas", …)` par `pas: sonsDePas.pourPromenade()` après `const sonsDePas = SonsDePas.creer({ surface: "…" })`
(charger `../sons/pas/pas.js` et `../sons/pas/sons-de-pas.js`). En 3D avec three.js : créer un `PannerNode` relié à `pas.entree` (`panner.connect(pas.entree)`, pour garder volume et
limiteur) puis `pas.jouer({ sortie: panner })`. Tant que le son n'a pas démarré (avant le premier clic / la première
touche, ou contexte audio en pause), `jouer()` renvoie `false` et ne joue rien : pas de pas empilés qui partiraient d'un coup.
Pour un autre personnage (`surface` donné à `jouer`), un pas tombé avant que son sol soit prêt est sauté (renvoie `false`) :
appeler `pas.precharger("…")` au chargement du niveau pour les sols des personnages.
Pour une page publiée en un seul fichier : coller le contenu de `pas.js` puis de `sons-de-pas.js` dans deux balises `<script>`
(comme le fait `construire.py`).

**Réglages perso** : dans l'atelier, « Copier les réglages » donne `{"depart": "…", "changements": {…}}`.
On le passe tel quel : `SonsDePas.creer({ reglages: ceJSON })` ou `pas.surface(ceJSON)`.

Cadences réalistes si le jeu déclenche lui-même les pas : ~0,75 m par pas en marchant (≈ 1,9 pas/s à 1,4 m/s),
~1,2 m en courant (≈ 3 pas/s).

## Les réglages tout prêts
| Réglage | Ce que c'est |
|---|---|
| **Parquet en chêne** · calé | Lames de chêne (≈ 13 mm) sur lambourdes rapprochées, chaussures à semelle dure, pas décidés. Résonance ≈ 400 Hz. |
| **Vieux plancher massif** · calé | Planches de bois dur (≈ 30 mm) sur solives à 50 cm, chaussures de ville. Résonance calculée 274 Hz (mesurée sur les vrais enregistrements : 223–278 Hz). |
| **Parquet fin, semelles souples** · calé | Parquet posé presque sur la dalle, semelles souples : un son sourd et grave (le style de beaucoup de jeux). |
| Plancher qui grince | Vieux plancher en pin, planches mal fixées qui retapent, grincements. |
| Escalier en bois | Marches creuses, cage d'escalier haute et réverbérante. |
| Ponton au bord de l'eau | Planches en pin sur pilotis, dehors (presque pas d'écho), sable et planches lâches. |
| Baskets sur parquet vitrifié | Semelle caoutchouc (contact ≈ 7 ms), petits « couics ». |
| Talons sur parquet | Talon dur (contact ≈ 0,6 ms), claquement, grand hall. |
| Bottes, personnage lourd | Pour un garde, un monstre, un géant… |
| Course sur plancher | Pas rapides (2,8 pas/s), appui fort, déroulé du pied court. |
| Pas furtifs | Pied posé tout doucement : pour se cacher (jeu d'horreur, infiltration). |
| Pieds nus | Coussinet du talon (contact ≈ 10 ms) et claquement de peau sur le vernis. |
| Grenier poussiéreux | Pin, grains de poussière, grincements, petite pièce sous le toit. |
| Chalet en bois | Tout en bois : sol et murs, écho court et chaleureux. |
| Grande salle de taverne | Plancher massif, salle de 14 × 10 × 5 m (écho ≈ 1,7 s). |
| **Béton, chaussures de ville** · calé | Dalle de béton, semelles dures, pièce aux murs nus. |
| **Cave en béton, talons** · calé | Talons durs sur un béton poussiéreux, grand espace en béton brut (avec son écho). |
| Couloir en béton | Long couloir étroit (30 × 2,4 m) : écho long et « flottant ». Idéal jeu d'horreur. |
| Parking souterrain | Immense, bas de plafond, très réverbérant, un peu de sable. |
| Escalier de secours en béton | Cage d'escalier haute (12 m) en béton nu. |
| Trottoir, dehors | Béton dehors, grains de sable, presque pas d'écho. |
| Rangers militaires sur béton | Grosses semelles, pas lourds et décidés, hangar. |
| Baskets sur béton | Semelle caoutchouc, petits crissements. |
| Pas furtifs sur béton | Pied posé tout doucement. |
| Pieds nus sur béton | Coussinet du talon et peau sur la pierre. |

`SonsDePas.reglagesPossibles()` donne la liste. Tous les curseurs (28) sont décrits dans `Pas.PARAMS` et dans l'atelier.

## Pour un autre moteur de jeu (Unreal, Godot, Unity…)
```
node exporter.js --sortie pas_exportes --reglages "Parquet en chêne,Escalier en bois" --variantes 8
node exporter.js --sortie pas_exportes --json mes_reglages.json --format wav       # réglages copiés depuis l'atelier
node exporter.js --sortie pas_exportes --reglages "Grande salle de taverne" --avec-piece   # avec l'écho (stéréo)
```
Sans `--avec-piece`, les sons sont **secs** (mono) : c'est le mieux pour un moteur qui ajoute sa propre réverbération
(Unreal : importer les .wav, un *Sound Cue* « Random » sur les variantes + un léger *Modulator*). Le `manifeste.json`
produit est celui de `sons/fabriquer.py`. **Attention** : `integrer.py` remplace tous les sons de la page par ceux du dossier
donné ; exporter donc dans le **même dossier** que les autres sons de la page (l'exportateur complète le `manifeste.json`
existant), par ex. `node exporter.js --sortie ../../gabarit/sons_out …` puis `python3 ../integrer.py ../../gabarit/sons_out ../../gabarit/index.html`,
et jouer `Son.jouer("pas_parquet_en_chene", {varie: .02})`. (Mais dans un jeu web, `sons-de-pas.js` fait mieux : variantes infinies.)

## Comment c'est fait (en bref)
1. **Contact talon / sol** — modèle de Hunt-Crossley (F = k·x^1,5·(1 + μ·v), celui des travaux de Turchet et al. sur la
   synthèse de pas). Masse effective du talon ≈ 1–6 kg, vitesse d'arrivée 0,16–0,55 m/s. La dureté de la semelle donne la
   durée du choc : pied nu ≈ 9 ms, basket ≈ 7 ms, chaussure de ville ≈ 1 ms, talon ≈ 0,6 ms.
2. **Le talon bascule** : il touche par son arête puis se pose à plat **10–25 ms** après (mesuré sur les vrais pas : un
   second petit claquement vers 18 ms, présent dans presque tous les enregistrements).
3. **Les planches** — modes de flexion d'une plaque de bois orthotrope sur solives :
   f(n,m) = π/2 · h · √(E_L/12ρ·(n/L)⁴ + E_R/12ρ·(m/W)⁴ + …), avec l'essence (pin → chêne → bois exotique), l'épaisseur
   et l'écart des solives. Rayonnement selon la fréquence de coïncidence. Amortissement : bois, clous, et surtout **le pied
   posé dessus** (c'est lui qui rend un pas mat).
4. **Craquement de contact** (bruit large bande qui suit les variations brutales de la force), claquement du talon,
   avant du pied ≈ 70 ms après, frottements, poussière, crissement de basket, planche lâche, grincement (frottement
   collé-glissé). Chaque couche a son propre tirage aléatoire : bouger un curseur ne change pas le hasard des autres.
5. **Le béton** (`matiere: 1`) — une dalle est environ mille fois plus lourde par mode qu'une planche : elle ne vibre
   presque pas (≈ −60 dB). On entend donc le choc rayonné par la surface rigide (∝ variation de la force), le **corps de la
   chaussure** (semelle + tige : résonances ≈ 490 Hz × 1 ; 1,5 ; 2,1 ; 3 ; 4,4, très amorties), le claquement du talon, le
   craquement de contact sur une surface minérale, les grains et les frottements. Les curseurs propres au bois sont ignorés
   (l'atelier les cache ; liste dans `Pas.BOIS_SEULEMENT`).
6. **La pièce** — premiers échos par sources-images (avec diffusion à chaque rebond) + queue de réverbération dont la
   durée vient de la formule d'Eyring (dimensions + absorption) et dont la quantité vient de la distance critique
   (source posée au sol). Écho d'un salon ≈ 0,4 s, cage d'escalier ≈ 0,6 s, grande salle ≈ 1,7 s, dehors ≈ rien.

## Fidélité (comment on sait que c'est réaliste)
`mesure/mesures.py` mesure un pas : énergie par tiers d'octave (50 Hz–16 kHz), décroissance (−10/−20/−30/−40 dB),
centroïde spectral de l'attaque et de la suite. `mesure/calibrer.js` refait les mêmes mesures en JS (vérifié identique),
et `mesure/calibrer2.js` (CMA-ES) ajuste ensemble les constantes du moteur (communes) et les réglages de chaque source.
Échelle (`mesure/etalon.js`) : un vrai pas pris seul est à **0,7–4,3** de la moyenne de sa série ; du vrai bois d'une autre
source est à **6,3**. Nos réglages calés, mesurés sur des pas que l'optimiseur n'a jamais vus : **2,2** (kretopi),
**2,3** (Minetest), **3,4** (Kenney) — tous dans la fourchette d'un vrai pas.
Béton : un vrai pas Minetest seul est à 1,2–2,0 de sa série, un vrai pas InspectorJ à 2,4–20,8 (médiane ≈ 7 : extraits
chargés d'écho et d'autres bruits) ; nos réglages calés : **3,1** (Minetest, sec) et **5,9** (InspectorJ, avec sa pièce).
Les spectres des deux sources de béton concordent entre eux (écart de bandes ≈ 2) : seule leur pièce diffère.
Les enregistrements d'InspectorJ ont un grondement de micro sous 100 Hz : ils sont mesurés avec `--passe-haut 90`
et la comparaison ignore leurs bandes sous 100 Hz (`fmin` dans la cible). Variation d'un pas à l'autre : 4,3 dB par
bande en moyenne (réel : 4,1 dB) ; niveau : ±2,5 dB à variation 0,5.
`node tests/test_pas.js` vérifie que ça reste vrai après chaque modification du moteur.

## Caler une nouvelle surface sur de vrais enregistrements
1. Trouver des enregistrements **libres** (CC0) : le conteneur n'a pas accès aux banques de sons, mais **GitHub oui** —
   chercher des dépôts de jeux libres qui en contiennent (ex. `minetest/minetest_game` `mods/default/sounds/`,
   `Fris0uman/CDDA-Soundpacks` `sound/CC-Sounds/plmove/` avec un `credits.md` par dossier). Cloner sans tout télécharger :
   `git clone --depth 1 --filter=blob:none --no-checkout URL d && cd d && git checkout HEAD -- chemin/des/sons/`.
   Ces dépôts ont déjà : béton, carrelage pieds nus, moquette, métal, gravier, neige, sable, herbe, terre, eau.
2. Convertir en mono 48 kHz : `ffmpeg -i x.ogg -ac 1 -ar 48000 x.wav`, un dossier par groupe de pas.
3. `python3 mesure/mesures.py dossier` → `mesures.json` (la cible) ; `python3 mesure/planche_spectro.py planche.png *.wav`
   pour **voir** la structure (événements, durée des aigus, résonances).
4. Écrire une config comme `mesure/cfg_bois.json` et lancer `cd mesure && node calibrer2.js cfg.json sortie.json 150`
   (≈ 6 min en arrière-plan). Viser un écart < 4. `python3 reglages.py --bois sortie.json` (ou `--beton`) reporte les
   constantes et les ancres dans `pas.js` et regénère les 25 réglages ; il refuse un résultat moins bon que le départ.
   Un enregistrement fait dans une pièce qui résonne se compare avec `"piece": true` dans la config (voir `cfg_beton.json`). Si l'écart reste haut, c'est que le **modèle** manque d'une couche
   physique : regarder la planche de spectrogrammes, comparer bande par bande, ajouter la couche, recommencer.
5. Ajouter le réglage dans `mesure/reglages.py`, son seuil dans `tests/test_pas.js`, et relancer les tests.
Le moteur sait faire le **bois** et le **béton / la pierre**. Métal, gravier, neige, herbe… demandent leur propre modèle
physique (tôle peu amortie pour le métal, grains PhISEM de Perry Cook pour gravier et neige, etc.) ; de vrais
enregistrements pour les caler sont déjà repérés (Minetest, CDDA-Soundpacks).

## Limites connues
- Les couches de détail (grincement, crissement, poussière, planche lâche) ont été dosées par mesure de niveau par
  rapport au pas (frottement ≈ −26 dB, poussière ≈ −30 dB, grincement ≈ −10 dB, crissement ≈ −14 dB) mais pas calées sur de vrais
  enregistrements de grincements.
- Seule l'oreille de l'utilisateur dit si c'est bon : publier l'atelier, lui faire écouter, lui demander ce qui cloche.

## Crédits des enregistrements de référence
- kretopi, « StepOnWood » (Freesound 406744–406749), **CC0**, via `Fris0uman/CDDA-Soundpacks`.
- Kenney, « Impact Sounds » `footstep_wood_000–004`, **CC0** (kenney.nl).
- Minetest Game `default_wood_footstep.1/2` : utilisés seulement pour la mesure (les mesures sont dans `mesure/cibles/`), pas redistribués.
- SpliceSound, « Footsteps, barefoot on wet tile » (Freesound 338106), **CC0** : mesure du claquement de peau.
- InspectorJ (www.jshaw.co.uk), « Footsteps, Concrete, A.wav » (Freesound 336598), **CC BY 4.0** : calibration du béton,
  et 4 extraits (filtrés sous 90 Hz) dans l'atelier. Toute page qui les réutilise doit citer l'auteur.
- Minetest Game `default_hard_footstep.1–3` : mesure du béton (mesures dans `mesure/cibles/`), pas redistribués.
