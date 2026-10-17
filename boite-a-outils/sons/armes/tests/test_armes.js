// Tests du moteur d'armes : physique (ordres de grandeur connus) et fidélité aux vrais enregistrements.
// node tests/test_armes.js        (≈ 30 s)
"use strict";
const path = require("path"), fs = require("fs"), A = require("../armes.js"), M = require("../mesure/mesure.js");
let ok = 0, ko = 0; const t = (nom, cond, info) => { if (cond) ok++; else ko++; console.log((cond ? "  ok  " : "  RATÉ ") + nom + (info ? "  (" + info + ")" : "")); };
const crete = x => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p; };
const sec = (P, s) => A.tir(Object.assign({}, P, { micro: 175, coupeBas: 10, variation: 0 }), s || 1).sec;   // marge haute : pas de saturation

console.log("Physique");
{ const k = A.kinney(10, 0.36); t("grenade (0,2 kg TNT posée) à 10 m : 3 à 12 kPa", k.ps > 3e3 && k.ps < 12e3, (k.ps / 1000).toFixed(1) + " kPa");
  t("durée de la surpression à 10 m : 1,5 à 4 ms", k.td > 1.5e-3 && k.td < 4e-3, (k.td * 1000).toFixed(2) + " ms");
  const a = A.kinney(100, 0.36), b = A.kinney(200, 0.36); t("au loin le souffle baisse en 1/r (≈ −6 dB par doublement)", Math.abs(20 * Math.log10(b.ps / a.ps) + 6) < 1, (20 * Math.log10(b.ps / a.ps)).toFixed(2) + " dB"); }
{ const f = A.fiche(A.preset("Fusil d'assaut 5,56")); t("5,56 : Mach 2,4 à 2,9", f.mach > 2.4 && f.mach < 2.9, "Mach " + f.mach);
  t("5,56 : onde en N de 60 à 250 µs à 1 m (Whitham)", f.ondeN_us_1m > 60 && f.ondeN_us_1m < 250, f.ondeN_us_1m + " µs"); }
{ const P = A.preset("Fusil d'assaut 5,56"), dev = A.tir(Object.assign({}, P, { distance: 60, angle: 10 }), 1), der = A.tir(Object.assign({}, P, { distance: 60, angle: 170 }), 1);
  t("devant le tireur la balle claque, derrière non", dev.chocs > 0 && der.chocs === 0, dev.chocs + " / " + der.chocs);
  const f = A.fiche(Object.assign({}, P, { distance: 60, angle: 10 })); t("le claquement arrive avant le coup de feu (devant, 60 m)", f.avanceClaqueMs > 20, f.avanceClaqueMs + " ms d'avance");
  const f9 = A.fiche(Object.assign({}, A.preset("Pistolet 9 mm"), { distance: 60, angle: 10 })); t("9 mm (≈ vitesse du son) : pas de claquement à 60 m", !f9.claque); }
{ const P = Object.assign({}, A.preset("Pistolet 9 mm"), { meca: 0, douille: 0, vitesse: 300 });   // balle subsonique : on ne mesure que le souffle
  const p10 = crete(sec(Object.assign({}, P, { distance: 10, angle: 0 }))), p20 = crete(sec(Object.assign({}, P, { distance: 20, angle: 0 })));
  const d = 20 * Math.log10(p20 / p10); t("10 → 20 m : le coup baisse de 4 à 9 dB", d < -4 && d > -9, d.toFixed(1) + " dB");
  const av = crete(sec(Object.assign({}, P, { distance: 10, angle: 0 }))), ar = crete(sec(Object.assign({}, P, { distance: 10, angle: 180 })));
  const dd = 20 * Math.log10(av / ar); t("souffle plus faible derrière que devant (directivité)", dd > 4, dd.toFixed(1) + " dB");
  const ab = A.absAir(8000) * 300, ab1 = A.absAir(500) * 300; t("absorption de l'air sur 300 m : 8 kHz ≫ 500 Hz", ab > 15 && ab1 < 2, ab.toFixed(1) + " dB / " + ab1.toFixed(1) + " dB"); }
{ const P = A.preset("Fusil d'assaut 7,62×39"), a = A.rendre(P, 5), b = A.rendre(P, 5), c = A.rendre(P, 6);
  t("même graine = même son", a.length === b.length && a.every((v, i) => v === b[i]));
  t("autre graine = autre son", a.length !== c.length || a.some((v, i) => v !== c[i])); }
{ const P = Object.assign({}, A.preset("Pistolet 9 mm"), A.LIEUX["Intérieur — bunker en béton"], { distance: 3 }), T = A.tir(P, 1);
  let e = T.env[0].length; const p = crete(T.env[0]); while (e > 0 && Math.abs(T.env[0][e - 1]) < p * 1e-3) e--; t("bunker en béton : la réverbération dure plus de 0,8 s", e / 48000 > 0.8, (e / 48000).toFixed(2) + " s"); }
{ let fini = true; for (const n of Object.keys(A.PRESETS)) for (const lieu of Object.keys(A.LIEUX)) { const y = A.rendre(Object.assign(A.preset(n), A.LIEUX[lieu], { distance: 30 }), 2); if (!y.every(Number.isFinite) || crete(y) === 0) fini = false; }
  t("toutes les armes dans tous les lieux : son fini et non nul", fini); }
for (const q of ["pompe", "culasse", "verrou", "clic"]) { const y = A.action(A.preset("Fusil à pompe 12"), q, 1); t("action « " + q + " » : son fini", y.every(Number.isFinite) && crete(y) > 0); }

console.log("Fidélité aux vrais enregistrements (écart ≈ 1 : aussi proche qu'un vrai tir d'un autre ; seuil par cible)");
const SEUIL = pos => pos === "loin" ? 16 : 12;   // garde-fous : les valeurs du moment sont dans README.md
for (const [nom, cibles] of Object.entries(A.FIDELITE)) for (const [pos, v] of Object.entries(cibles)) t(`${nom} — ${pos} : écart ${v.ecart}${v.etalon ? " (vrai contre vrai : " + v.etalon + ")" : ""}`, v.ecart < SEUIL(pos));
console.log(`\n${ok} réussis, ${ko} ratés`); process.exit(ko ? 1 : 0);
