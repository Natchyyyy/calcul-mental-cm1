// rend la synthèse de chaque cible d'une config (avec un résultat de calibration éventuel) et écrit des wav pour comparer
// node comparer.js cfg.json [resultat.json] dossier_sortie
const fs = require("fs"), path = require("path"), C = require("./calibrer.js"), M = require("./mesure.js"), A = require("../armes.js");
const [cf, rf, out] = process.argv.length > 4 ? process.argv.slice(2) : [process.argv[2], null, process.argv[3]];
const cfg = C.lireCfg(cf), dims = C.preparer(cfg, path.dirname(path.resolve(cf)));
if (rf) { const r = JSON.parse(fs.readFileSync(rf)); Object.assign(cfg.arme, r.arme); r.cibles.forEach((c, i) => cfg.cibles[i].depart = Object.assign({}, cfg.cibles[i].depart, c.reglages)); }
const u = dims.map(d => { const v = d[0] === "a" ? cfg.arme[d[2]] : cfg.cibles[d[1]].depart[d[2]]; return (v - d[3]) / (d[4] - d[3]); });
const { Ps } = C.decode(cfg, dims, u), ev = C.evaluer(cfg, dims, u, true); fs.mkdirSync(out, { recursive: true });
cfg.cibles.forEach((c, i) => { console.log(c.nom, JSON.stringify(ev.parts[i]));
  const y = A.rendre(Ps[i], 100), z = new Float64Array(Math.round(0.3 * 48000) + y.length); z.set(y, Math.round(0.3 * 48000));
  let p = 0; for (const v of z) p = Math.max(p, Math.abs(v)); M.ecrireWav(path.join(out, c.nom + "_synth.wav"), z.map(v => v / p * 0.95));
  const S = C.mesurerSynth(Ps[i], 3, 100);
  console.log("  profil synth", S.profil.map(v => v.toFixed(0)).join(" "), "\n  profil réel ", c.T.profil.map(v => v.toFixed(0)).join(" "), " plancher", c.T.plancher);
  console.log("  direct synth", S.direct.map(v => v.toFixed(0)).join(" "), "\n  direct réel ", c.T.direct.map(v => v.toFixed(0)).join(" "));
  console.log("  queue  synth", S.queue.map(v => v.toFixed(0)).join(" "), "\n  queue  réel ", c.T.queue.map(v => v.toFixed(0)).join(" "), " fort", S.fort.toFixed(2), c.T.fort);
});
