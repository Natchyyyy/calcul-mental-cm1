// Tests du moteur de pas : node tests/test_pas.js   (quelques secondes)
// Vérifie chaque réglage (son valide, niveau, durée, pas de clic), le déterminisme, la vitesse, la pièce,
// et que les réglages calés restent proches des vrais enregistrements (non-régression de la calibration).
const path = require("path"), fs = require("fs"), Pas = require("../pas.js"), M = path.join(__dirname, "..", "mesure");
const { mesurerGroupe, ecart } = require(path.join(M, "calibrer.js"));
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log("  ✗", msg); } };
const SR = 48000;
console.log("Réglages tout prêts :");
for (const nom of Object.keys(Pas.PRESETS)) {
  const P = Pas.preset(nom); let pire = "";
  for (let s = 0; s < 6; s++) {
    const y = Pas.rendre(P, 50 + s, { sr: SR }); let pk = 0, fin = true;
    for (const v of y) { if (!Number.isFinite(v)) fin = false; pk = Math.max(pk, Math.abs(v)); }
    ok(fin, `${nom} : valeurs non finies`); ok(pk > 0.12 && pk < 1.2, `${nom} : crête ${pk.toFixed(3)} hors de [0,12 ; 1,2]`);
    ok(y.length > 0.05 * SR && y.length < 1.7 * SR, `${nom} : durée ${(y.length / SR).toFixed(2)} s`);
    ok(Math.abs(y[0]) < 0.01 * pk, `${nom} : clic au début`); ok(Math.abs(y[y.length - 1]) < 1e-3 * pk + 1e-6, `${nom} : coupure à la fin`);
    if (s === 0) pire = `${(y.length / SR * 1000).toFixed(0)} ms, crête ${pk.toFixed(2)}`;
  }
  console.log("  ·", nom.padEnd(32), pire);
}
console.log("Déterminisme, vitesse, pièce :");
const a = Pas.rendre(Pas.DEFAUT, 7), b = Pas.rendre(Pas.DEFAUT, 7); ok(a.length === b.length && a.every((v, i) => v === b[i]), "même graine → même son");
const c = Pas.rendre(Pas.DEFAUT, 8); ok(!(a.length === c.length && a.every((v, i) => v === c[i])), "graine différente → son différent");
const t0 = Date.now(); for (let i = 0; i < 30; i++) Pas.rendre(Pas.preset("Parquet en chêne"), 200 + i); const ms = (Date.now() - t0) / 30;
console.log(`  · ${ms.toFixed(1)} ms par pas`); ok(ms < 60, "rendu trop lent");
for (const nom of ["Parquet en chêne", "Grande salle de taverne", "Ponton au bord de l'eau"]) {
  const R = Pas.piece(Pas.preset(nom), SR); ok(R.ir[0].every(Number.isFinite) && R.ir[1].every(Number.isFinite), nom + " : pièce non finie"); ok(R.T > 0.03 && R.T < 8, nom + " : écho " + R.T);
}
ok(Pas.fiche(Pas.preset("Talons sur parquet")).contactMs < 1, "talon dur : contact < 1 ms");
ok(Pas.fiche(Pas.preset("Pieds nus")).contactMs > 6, "pied nu : contact > 6 ms");
console.log("Fidélité aux vrais enregistrements (écart ; un vrai pas seul est à 0,7–4,3 de sa série) :");
const A = JSON.parse(fs.readFileSync(path.join(M, "ancres_bois.json"))), seuils = { "cibles/bois_kretopi.json": 3.5, "cibles/bois_minetest.json": 3.5, "cibles/bois_kenney.json": 4.5 };
for (const [cible, q] of Object.entries(A)) {
  const T = JSON.parse(fs.readFileSync(path.join(M, cible))).resume, e = ecart(mesurerGroupe(Object.assign(Pas.preset("x"), q), 10, 900), T);
  console.log(`  · ${cible.padEnd(28)} ${e.toFixed(2)} (seuil ${seuils[cible]})`); ok(e < seuils[cible], cible + " : la synthèse s'éloigne du vrai");
}
console.log(fails ? `${fails} échec(s)` : "Tout est bon."); process.exit(fails ? 1 : 0);
