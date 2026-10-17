# Coups de feu et explosions physiques

Un moteur qui **calcule** les coups de feu au lieu de rejouer des enregistrements : chaque tir est unique, et il change
vraiment selon l'endroit où l'on se trouve (c'est moi qui tire, je suis à côté, à 200 m devant le canon, derrière un mur…),
selon le sol et selon le lieu (forêt, rue, vallée, couloir, bunker). Les armes marquées « calé » ont été ajustées
automatiquement sur de **vrais tirs enregistrés** (Free Firearm Sound Library, CC0) à plusieurs distances.

| Fichier | À quoi ça sert |
|---|---|
| `armes.js` | Le moteur (navigateur et Node, sans dépendance). `Armes.tir(réglages, graine)` → `{ sec, env: [G, D], retard }`. |
| `sons-d-armes.js` | Pour un **jeu web** : variantes calculées d'avance dans un Worker, position d'écoute, rafales, pompe/culasse, lieux. |
| `atelier.html` | Page pour **écouter et régler** : on place son oreille sur un terrain vu du ciel, on compare au vrai, on copie les réglages. |
| `exporter.js` | Pour **Unreal / Godot / Unity** : écrit des `.ogg`/`.wav` par arme et par position d'écoute + `manifeste.json`. |
| `mesure/` | Les outils de calage : mesures, calibration (CMA-ES), comparaison au vrai, résumés des vrais tirs (`resumes/`). |
| `tests/test_armes.js` | Vérifie la physique (ordres de grandeur connus) et la fidélité aux enregistrements. |

## Les armes

| Réglage | Quoi | Calé sur de vrais tirs |
|---|---|---|
| Pistolet 9 mm | pistolet semi-automatique, balle à peine plus rapide que le son | oui (4 positions de micro) |
| Pistolet-mitrailleur 9 mm | canon plus long, rafales (800 coups/min) | dérivé du pistolet |
| Fusil d'assaut 5,56 | type M4 / AR-15, balle à Mach 2,7, ressort de culasse, rafales (750/min) | oui (4 positions) |
| Carabine courte 5,56 | canon court : plus fort, plus de gaz | dérivé |
| Fusil d'assaut 7,62×39 | type AK, culasse lourde, rafales (600/min) | oui (AK-47 et SKS, 3 positions) |
| Fusil de précision 7,62×54 | fusil à verrou, très fort, gros claquement | oui (3 positions) |
| Fusil de combat 7,62×51 | semi-automatique, type FAL / G3 | dérivé |
| Fusil à pompe 12 | chevrotine (9 plombs), pompe | oui (3 fusils, 4 positions) |
| Fusil de chasse 12 (petits plombs) | 30 petits plombs freinés très vite | dérivé |
| Grenade à main | 0,2 kg équivalent TNT posée au sol, éclats, terre qui retombe | physique seulement (voir plus bas) |
| Explosion lourde (2 kg) | grosse charge | physique seulement |

Lieux : `Armes.LIEUX` — Stand de tir (plein air, celui des enregistrements), Champ ouvert, Forêt, Village / rue,
Vallée de montagne, Neige, Intérieur — pièce, couloir, entrepôt, bunker en béton.

## Dans un jeu web
```html
<script src="armes.js"></script><script src="sons-d-armes.js"></script>
<script>
const armes = SonsDArmes.creer({ lieu: "Forêt" });
armes.charger("Fusil d'assaut 5,56", { distances: [25, 150] });          // facultatif : prêt dès le 1er tir
// le joueur tire (vue du tireur)
armes.tirer("Fusil d'assaut 5,56");
armes.rafale("Fusil d'assaut 5,56", { coups: 5 });                        // cadence de l'arme (ou cadence: 900)
armes.action("Fusil à pompe 12", "pompe");                                 // "pompe", "culasse", "verrou", "clic"
// un ennemi à 80 m qui tire presque vers nous (angle 0 = pile dans l'axe de son canon)
armes.tirer("Fusil d'assaut 7,62×39", { distance: 80, angle: 10, pan: -0.3 });
armes.tirer("Grenade à main", { distance: 30 });
armes.lieu("Intérieur — couloir");                                          // on entre dans un bâtiment
</script>
```
- `angle` : 0° = l'auditeur est devant le canon (la balle passe près de lui : on entend le **claquement avant le coup**),
  90° = à côté, 180° = derrière le tireur. Sans `distance`, c'est le joueur qui tire (mécanique et douille tout près).
- Le son arrive **en retard** selon la distance (343 m/s), comme en vrai ; `retard: false` pour l'ignorer.
- `sortie: pannerNode` (relié à `armes.entree`) pour un placement 3D ; la réverbération du lieu, elle, arrive de partout.
- `dynamique` (0 à 1, 0,3 par défaut) dans `creer` : les tirs lointains un peu moins faibles qu'en vrai, pour le jeu.
- Chaque tir coûte ≈ 50 ms de calcul, fait dans un Worker : quelques variantes sont gardées d'avance par arme et par
  position (tireur, 1,5 / 4 / 10 / 25 / 60 / 150 / 400 / 1000 m, devant / à côté / derrière). Jamais deux fois le même.

## Pour Unreal, Godot, Unity
```
node exporter.js --sortie Sons/Armes --armes "Pistolet 9 mm,Fusil à pompe 12" --lieu "Village / rue" \
     --positions "tireur,15,60:90,250" --variantes 6 --actions
```
→ `pistolet_9_mm_tireur_0.ogg`, `pistolet_9_mm_15m_0.ogg`, `pistolet_9_mm_60m_90_0.ogg`, `…_culasse_0.ogg`…,
`manifeste.json` et `infos_armes.json` (temps de vol de chaque position). Les niveaux sont **communs à tout l'export** :
un tir lointain est vraiment plus faible, un fusil plus fort qu'un pistolet. Pour une explosion, « tireur » veut dire « à 6 m ». `--sec` : son direct seul (mono) pour
utiliser la réverbération du moteur de jeu. Dans Unreal : un Sound Cue « Random » par position, et choisir la position
selon la distance au joueur (ou un « Crossfade by Distance » entre `tireur`, `15m`, `60m`, `250m`).

## La physique (ce que calcule chaque tir)
1. **Onde de souffle** de la bouche : forme de Friedlander `p(t) = P·(1 − t/T)·e^(−βt/T)`, précurseur (l'air chassé devant
   la balle), cellules de choc du jet de gaz, gaz brûlants (bruit filtré), coup sourd grave. La surpression s'étire avec
   la distance (onde de choc faible). **Directivité** : 10 à 30 dB de moins derrière le tireur que devant (mesures de
   Maher, Montana State University), plus marquée dans les aigus.
2. **Onde de choc de la balle** (si elle va plus vite que le son) : onde en N, durée et force par les formules de
   Whitham (Mach, diamètre, longueur, distance à la trajectoire), balle freinée par l'air ; elle n'existe que dans le
   cône de Mach devant le tireur et arrive **avant** le coup de feu. Chevrotine : un claquement par plomb.
3. **Propagation** : 1/r, absorption de l'air ISO 9613-1 (20 °C, 70 %), **reflet sur le sol** avec l'impédance de
   Delany et Bazley (neige, herbe, terre, béton) — c'est lui qui donne la couleur « creuse » d'un tir lointain sur l'herbe.
4. **Mécanique** : chocs de la culasse (déverrouillage, butée, verrouillage) qui font sonner les pièces d'acier (synthèse
   modale), ressort récupérateur (AR) ; **douille** qui tombe et rebondit (anneau du laiton vers 6–9 kHz, comme mesuré).
5. **Lieu** : en plein air, réverbération des arbres et du relief (arrivées éparses, les graves mal renvoyés, les aigus
   éteints par le long trajet) et échos francs des murs ou talus ; en intérieur, sources-images de la pièce + queue
   diffuse (formule d'Eyring).
6. **Micro** : au-delà de sa marge le son sature, comme dans les vrais enregistrements (et dans tous les jeux).
7. **Grenade** : onde de souffle de **Kinney et Graham** (surpression et durée selon la distance réduite R/W^⅓, charge
   posée au sol ×1,8), boule de feu, éclats supersoniques (claquements avant le souffle), terre qui retombe 0,2–1,8 s.
   Pas d'enregistrement libre et fiable d'une vraie grenade trouvé : ce son est **physique mais pas calé** (ordres de
   grandeur vérifiés dans les tests : ≈ 6 kPa et 2,7 ms à 10 m).

## Fidélité
Pour chaque arme calée, l'écart entre la synthèse et les vrais tirs, mesuré sur le spectre du coup (12 premières ms),
le spectre de la réverbération, le profil d'énergie de 0 à 1,5 s et la saturation. Échelle : ≈ l'écart entre deux
vrais tirs de la même arme au même micro (« vrai contre vrai »). Voir `Armes.FIDELITE` et `node tests/test_armes.js`.

| Arme | de près | mi-distance | de loin | derrière le tireur |
|---|---|---|---|---|
| Pistolet 9 mm | 6,4 (vrai/vrai 1,9) | 8,3 (vrai/vrai 2,8) | 10,8 (vrai/vrai 1,6) | 6,9 (vrai/vrai 1,6) |
| Fusil d'assaut 5,56 | 6,1 (vrai/vrai 2,4) | 5,9 (vrai/vrai 1,0) | 14,8 (vrai/vrai 3,7) | 10,2 (vrai/vrai 0,8) |
| Fusil d'assaut 7,62×39 | 5,8 (vrai/vrai 3,9) | — | 11,4 (vrai/vrai 2,7) | 5,8 (vrai/vrai 1,6) |
| Fusil de précision 7,62×54 | 9,2 (vrai/vrai 1,4) | 4,1 (vrai/vrai 4,9) | 7,8 (vrai/vrai 2,1) | — |
| Fusil à pompe 12 | 5,6 (vrai/vrai 2,5) | 6,9 (vrai/vrai 2,4) | 6,6 (vrai/vrai 2,2) | 8,5 (vrai/vrai 2,3) |

Lecture : en général la synthèse est à 2–4 fois l'écart entre deux vrais tirs (davantage pour le 5,56 derrière le tireur,
dont les vrais tirs sont presque identiques entre eux) ; c'est **de loin** qu'elle est la moins fidèle (un lointain mêle le claquement de la balle, le sol et le
relief du stand, que le modèle ne reproduit qu'en partie). Écarts mesurés avec des graines jamais vues pendant la calibration.

## Recaler ou ajouter une arme
```
cd mesure
python3 extraire.py dossier_des_wav_mono_48k cibles/monarme_proche Fichier1 Fichier2   # découpe chaque tir (0,3 s avant)
node mesure.js cibles/monarme_proche                                                   # résumé mesuré
# une config (voir cfg/9mm.json) : réglages de départ, clés à caler, et une cible par position de micro
node calibrer.js cfg/monarme.json res/monarme.json 120                                 # ≈ 15 min sur 2 cœurs
node comparer.js cfg/monarme.json res/monarme.json /tmp/cmp && python3 voir2.py /tmp/cmp.png vrai.wav /tmp/cmp/…_synth.wav
python3 ../presets.py                                                                   # écrit les réglages dans armes.js
```

## Crédits
Enregistrements de référence : **Free Firearm Sound Library** (buddingmonkey / Still North Media, domaine public CC0),
https://github.com/buddingmonkey/FreeFirearmsSFXLibrary — utilisés pour caler le moteur et pour la comparaison
« vrai ou synthèse » de l'atelier (extraits de 1,5 s). Physique : R. C. Maher (acoustique des tirs, directivité),
G. B. Whitham (onde de choc des projectiles), G. F. Kinney et K. J. Graham (*Explosive Shocks in Air*, 1985),
M. E. Delany et E. N. Bazley (impédance des sols), ISO 9613-1 (absorption de l'air).
