# Calcul mental CM1

Appli de calcul mental et de français pour un élève de CM1 (hibou « Pythagore »).

Ce dépôt sert aux **mises à jour automatiques** : sur le PC de l'enfant, le gardien Windows lit `version.json`
à chaque lancement et télécharge `appli.html` (et `gardien.ps1`) quand une nouvelle version est publiée.

- `appli.html` : l'appli (un seul fichier, fonctionne hors ligne).
- `gardien.ps1` : le gardien Windows (ouvre l'appli en plein écran, code du jour, mises à jour).
- `version.json` : numéro de version de l'appli et du gardien, adresse du tableau de suivi.
- `suivi/Code.gs` : le script Google Sheets du tableau de suivi des parents.

Aucune donnée personnelle n'est stockée ici.
