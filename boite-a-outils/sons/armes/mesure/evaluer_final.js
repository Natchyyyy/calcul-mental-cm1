// Évalue chaque arme calée avec des graines JAMAIS vues pendant la calibration (4 tirs par cible) : l'écart honnête.
// node evaluer_final.js suffixe [arme…]  → res/<arme>_<suffixe>_eval.json et fidelite.json
const fs = require("fs"), path = require("path"), C = require("./calibrer.js"), M = require("./mesure.js");   // à lancer depuis mesure/
const [suf, ...noms] = process.argv.slice(2), sortie = {};
for (const n of noms.length ? noms : ["9mm", "556", "762", "76254", "pompe"]) {
  const cf = `cfg/${n}.json`, rf = `res/${n}_${suf}.json`; if (!fs.existsSync(rf)) { console.log("absent", rf); continue; }
  const cfg = C.lireCfg(cf), r = JSON.parse(fs.readFileSync(rf)); Object.assign(cfg.arme, r.arme); r.cibles.forEach((c, i) => cfg.cibles[i].depart = Object.assign({}, cfg.cibles[i].depart, c.reglages));
  const dims = C.preparer(cfg, path.dirname(path.resolve(cf))), u = dims.map(d => { const v = d[0] === "a" ? cfg.arme[d[2]] : cfg.cibles[d[1]].depart[d[2]]; return (v - d[3]) / (d[4] - d[3]); });
  const { Ps } = C.decode(cfg, dims, u); sortie[n] = {};
  cfg.cibles.forEach((c, i) => { const S = C.mesurerSynth(Ps[i], 4, 300), e = M.ecart(S, c.T, true); sortie[n][c.nom] = e; console.log(n, c.nom, JSON.stringify(e)); });
}
fs.writeFileSync(`res/fidelite_${suf}.json`, JSON.stringify(sortie, null, 1));
