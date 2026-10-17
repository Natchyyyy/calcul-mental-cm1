# Coups de feu et explosions

**Version 2 : de vrais tirs enregistrés, placés dans l'espace par la physique.**

La version 1 fabriquait le coup de feu entier par le calcul. Les mesures ressemblaient aux vrais tirs, mais à l'oreille
ça sonnait comme de l'airsoft : un « clic » sec suivi d'un souffle. On fait donc comme les vrais jeux. Le **coup** est
un vrai tir enregistré (Free Firearm Sound Library, CC0), pris derrière le tireur, de près, à mi-distance et de loin.
La **physique** fait le reste :
- la distance : niveau, air qui avale les aigus, retard du son ;
- le claquement de la balle supersonique, qui arrive **avant** le coup quand on est devant le canon ;
- l'arrière du tireur, plus sourd ;
- la réverbération du lieu.

| Fichier | À quoi ça sert |
|---|---|
| `sons-d-armes.js` | Le lecteur pour un **jeu web** : vrais sons + espace (Web Audio). |
| `banque/` | Les vrais sons (.ogg, 1,8 Mo) et `banque.json` (niveau mesuré, claquement, durée de chaque tir). `banque-data.js` est la même chose en un seul script, pour une page en un seul fichier (`python3 banque_js.py`). |
| `armes.js` | La physique : réverbération des lieux, cône de Mach et avance du claquement, absorption de l'air, et l'ancien moteur de synthèse (`Armes.tir`, version 1, gardé pour l'étude). |
| `atelier.html` | Page pour **écouter** : on place son oreille sur un terrain vu du ciel, on choisit l'arme et le lieu. |
| `exporter.py` | Pour **Unreal / Godot / Unity** : rend des `.ogg` avec le **même lecteur** (dans Chromium), par arme et par position. |
| `banque.py` | Refait la banque à partir des enregistrements (découpe, nettoyage, niveau, claquement). |
| `tests/` | `test_armes.js` (physique), `verif_pages.py` (pages et rendu réel du lecteur, niveaux cohérents). |

## Les armes (toutes sont de vrais enregistrements)

| Arme | Enregistrements | Manipulations |
|---|---|---|
| Pistolet 9 mm | pistolet à percuteur, 9×19 | culasse, chargeur, clic |
| Pistolet-mitrailleur 9 mm | pistolet-mitrailleur suédois M45 (rafales 600/min) | culasse, chargeur, clic |
| Fusil d'assaut 5,56 | carabine type AR-15 (rafales 750/min) | culasse, chargeur, clic |
| Fusil d'assaut 7,62×39 | AK-47 et SKS (rafales 600/min) | culasse, chargeur, clic |
| Fusil de précision 7,62×54 | fusil à verrou | verrou, clic |
| Fusil à pompe 12 | trois fusils à pompe | pompe, cartouche, clic |
| Grenade à main | explosions CC0 / CC BY 3.0 (voir crédits) | — |
| Explosion lourde | explosion CC0 | — |

Chaque arme a 2 à 6 vrais tirs par position d'écoute : on n'entend jamais deux fois de suite le même.
Lieux (`Armes.LIEUX`) : Stand de tir (plein air), Champ ouvert, Forêt, Village / rue, Vallée de montagne, Neige,
Intérieur — pièce, couloir, entrepôt, bunker en béton.

## Dans un jeu web
```html
<script src="armes.js"></script>
<script src="sons-d-armes.js"></script>
<script src="banque/banque-data.js"></script>   <!-- ou SonsDArmes.creer({ banque: "banque/" }) avec les .ogg à côté -->
<script>
const armes = SonsDArmes.creer({ lieu: "Forêt" });
await armes.charger("Fusil d'assaut 5,56");                       // décode les sons de l'arme (à faire avant de tirer)
armes.tirer("Fusil d'assaut 5,56");                                // c'est le joueur qui tire
armes.rafale("Fusil d'assaut 5,56", { coups: 5 });
armes.action("Fusil d'assaut 5,56", "chargeur");                   // voir armes.actions(nom)
armes.tirer("Fusil d'assaut 7,62×39", { distance: 80, angle: 10, pan: -0.3 });   // un ennemi qui tire vers nous
armes.tirer("Grenade à main", { distance: 30 });
armes.lieu("Intérieur — couloir");
</script>
```
- `angle` : 0° = l'auditeur est devant le canon (la balle claque avant le coup), 90° = à côté, 180° = derrière le tireur.
- Les sons lointains arrivent **en retard** (343 m/s) ; `SonsDArmes.creer({ retard: false })` pour l'ignorer.
- `sortie: pannerNode` (relié à `armes.entree`) pour un placement 3D ; la réverbération du lieu arrive de partout.
- Options de `creer` :
  - `dynamique` (0 à 1, 0,5 par défaut) : les tirs lointains un peu moins faibles qu'en vrai ;
  - `graves` (0 à 1, 0,6 par défaut) : renfort de graves comme dans les jeux (le « coup dans la poitrine » que les micros
    et les petits haut-parleurs perdent), 0 = enregistrements bruts ;
  - `reverb` (multiplicateur, 1 par défaut).
- Au **stand de tir**, on entend la vraie réverbération des enregistrements. Ailleurs, le coup est coupé à 0,12 s et la
  réverbération du lieu est calculée (son niveau est calé pour que celle du stand égale la vraie).

## Pour Unreal, Godot, Unity
```
python3 construire.py
python3 exporter.py --sortie Sons/Armes --armes "Pistolet 9 mm,Fusil à pompe 12" --lieu "Village / rue" \
        --positions "tireur,15,60:90,250" --variantes 6 --actions
```
Le script produit des fichiers comme `pistolet_9_mm_tireur_0.ogg`, `pistolet_9_mm_60m_90_0.ogg` ou
`fusil_a_pompe_12_pompe_0.ogg`, plus un `manifeste.json`. Les niveaux sont communs à tout l'export. Le temps de vol
n'est pas inclus (le moteur de jeu le gère), mais le claquement en avance l'est. Pour une explosion, « tireur » veut
dire « à 6 m ». Dans Unreal : un Sound Cue « Random » par position, choisi selon la distance au joueur.

## Ce qui est vérifié
- `node tests/test_armes.js` : la physique (grenade de Kinney-Graham, onde en N de Whitham, cône de Mach et avance du
  claquement, 1/r, directivité, absorption de l'air, réverbération) et l'ancien moteur de synthèse.
- `python3 tests/verif_pages.py` : le vrai lecteur, rendu hors ligne. Au stand, la vraie queue est 20 dB sous le coup ;
  à 150 m le coup est au moins 15 dB plus faible ; en forêt, dans un couloir et dans une rue, la réverbération reste
  12 à 40 dB sous le coup.

## Crédits
- Tirs et manipulations : **Free Firearm Sound Library** (buddingmonkey / Still North Media), domaine public **CC0**,
  https://github.com/buddingmonkey/FreeFirearmsSFXLibrary
- Explosions (via CDDA-Soundpacks) :
  - j1987 (Freesound 140727, **CC0**) ;
  - unfa (Freesound 352143, **CC0**) ;
  - bmlake (Freesound 251617, **CC BY 3.0** : garder la mention « bmlake » si on les utilise).
- Physique : R. C. Maher (acoustique des tirs), G. B. Whitham (onde de choc), G. F. Kinney et K. J. Graham (souffle),
  M. E. Delany et E. N. Bazley (sols), ISO 9613-1 (air).
