// Calibration (sep-CMA-ES) d'une arme sur de vrais enregistrements : réglages de l'arme communs à toutes les cibles,
// géométrie (distance, angle) et marge du micro propres à chaque cible (chaque position de micro).
// usage : node calibrer.js config.json sortie.json [générations]
// config : { arme: {réglages de départ}, cles: [...], bornes: {clé: [min, max]}, site: {réglages du lieu, fixes},
//            cibles: [{ dossier, fixe: {…}, libres: {clé: [min, max]}, depart: {…}, n: 3 }], graine, sigma }
"use strict";
const fs = require("fs"), path = require("path"), A = require(process.env.ARMESJS || path.join(__dirname, "..", "armes.js")), M = require("./mesure.js");
const info = Object.fromEntries(A.PARAMS.map(p => [p[0], p]));
A._limiteIR(1.7);
const PRE = new Float64Array(Math.round(0.3 * M.SR));
function mesurerSynth(P, n, base) {
  const ms = [];
  for (let i = 0; i < n; i++) { const y = A.rendre(P, base + i), z = new Float64Array(PRE.length + y.length); z.set(y, PRE.length); ms.push(M.mesurer(z)); }
  return M.resume(ms);
}
const arrondi = (k, v) => { const s = info[k] && info[k][5]; return s >= 1 ? Math.round(v) : v; };
function lireCfg(f) {
  const cfg = JSON.parse(fs.readFileSync(f)), dir = path.dirname(path.resolve(f));
  if (typeof cfg.site === "string") cfg.site = JSON.parse(fs.readFileSync(path.resolve(dir, cfg.site)));
  if (process.env.SITE) Object.assign(cfg.site, JSON.parse(fs.readFileSync(process.env.SITE)));
  return cfg;
}
function preparer(cfg, dir) {
  const dims = [];
  for (const k of cfg.cles) { if (!info[k]) throw new Error("réglage inconnu : " + k); dims.push(["a", -1, k, ...(cfg.bornes && cfg.bornes[k] || [info[k][3], info[k][4]])]); }
  cfg.cibles.forEach((c, i) => {
    // cible : un dossier de vrais tirs (.wav 48 kHz) ou leur résumé déjà mesuré (resumes/*.json)
    const d = path.resolve(dir, c.dossier); c.T = fs.existsSync(d) && fs.statSync(d).isDirectory() ? M.mesurerDossier(d) : JSON.parse(fs.readFileSync(d.endsWith(".json") ? d : path.resolve(dir, "../resumes", path.basename(d) + ".json")));
    c.nom = path.basename(d).replace(/\.json$/, "");
    for (const [k, b] of Object.entries(c.libres || {})) { if (!info[k]) throw new Error("réglage inconnu : " + k); dims.push(["c", i, k, b[0], b[1]]); }
  });
  return dims;
}
function decode(cfg, dims, u) {
  const arme = Object.assign({}, A.DEFAUT, cfg.site || {}, cfg.arme), Ps = [];
  dims.forEach((d, j) => { if (d[0] === "a") arme[d[2]] = arrondi(d[2], d[3] + Math.min(1, Math.max(0, u[j])) * (d[4] - d[3])); });
  cfg.cibles.forEach((c, i) => { const P = Object.assign({}, arme, c.fixe || {}, c.depart || {}); Ps.push(P); });
  dims.forEach((d, j) => { if (d[0] === "c") Ps[d[1]][d[2]] = arrondi(d[2], d[3] + Math.min(1, Math.max(0, u[j])) * (d[4] - d[3])); });
  return { arme, Ps };
}
function evaluer(cfg, dims, u, detail) {
  const { Ps } = decode(cfg, dims, u); let pen = 0;
  for (const v of u) { if (v < 0) pen += v * v * 50; if (v > 1) pen += (v - 1) ** 2 * 50; }
  const parts = cfg.cibles.map((c, i) => M.ecart(mesurerSynth(Ps[i], c.n || 3, 100), c.T, detail));
  const tot = parts.reduce((a, p) => a + (detail ? p.total : p) * 1, 0) / parts.length;
  return { f: tot + pen, parts };
}
if (require.main === module) {
  const [cfgF, outF, genS] = process.argv.slice(2), cfg = lireCfg(cfgF), GEN = +(genS || 120);
  if (process.env.DEPUIS) { const r = JSON.parse(fs.readFileSync(process.env.DEPUIS)); Object.assign(cfg.arme, r.arme);
    r.cibles.forEach((c, i) => { if (cfg.cibles[i]) cfg.cibles[i].depart = Object.assign({}, cfg.cibles[i].depart, c.reglages); }); }
  const dims = preparer(cfg, path.dirname(path.resolve(cfgF))), n = dims.length;
  const depart = d => { const v = d[0] === "a" ? cfg.arme[d[2]] ?? A.DEFAUT[d[2]] : (cfg.cibles[d[1]].depart || {})[d[2]] ?? (d[3] + d[4]) / 2; return (v - d[3]) / (d[4] - d[3]); };
  let m = dims.map(depart);
  const lam = cfg.lambda || 4 + Math.floor(3 * Math.log(n)), mu = Math.floor(lam / 2), wr = []; for (let i = 0; i < mu; i++) wr.push(Math.log(mu + 0.5) - Math.log(i + 1));
  const ws = wr.reduce((a, b) => a + b, 0), w = wr.map(v => v / ws), mueff = 1 / w.reduce((a, b) => a + b * b, 0);
  const cs = (mueff + 2) / (n + mueff + 5), ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs, cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n);
  let c1 = 2 / ((n + 1.3) ** 2 + mueff), cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff)); c1 *= (n + 2) / 3; cmu = Math.min(1 - c1, cmu * (n + 2) / 3);
  const EN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n)); let sigma = +process.env.SIGMA || cfg.sigma || 0.2; const C = new Array(n).fill(1), ps = new Array(n).fill(0), pc = new Array(n).fill(0);
  const R = A.rng(cfg.graine || 11), gauss = () => { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
  const t0 = Date.now(), b0 = evaluer(cfg, dims, m); let best = { f: b0.f, u: m.slice(), parts: b0.parts };
  console.log("départ", b0.f.toFixed(3), b0.parts.map(p => p.toFixed(2)).join(" "), "dims", n, "λ", lam);
  const ecrire = g => {
    const { arme, Ps } = decode(cfg, dims, best.u), det = evaluer(cfg, dims, best.u, true);
    const res = { ecart: best.f, depart: b0.f, generation: g, parts: det.parts.map((p, i) => Object.assign({ cible: cfg.cibles[i].nom }, p)),
      arme: Object.fromEntries(cfg.cles.map(k => [k, +(+arme[k]).toPrecision(7)])),
      cibles: cfg.cibles.map((c, i) => ({ dossier: c.dossier, reglages: Object.fromEntries(Object.keys(c.libres || {}).map(k => [k, +(+Ps[i][k]).toPrecision(7)])) })) };
    fs.writeFileSync(outF, JSON.stringify(res, null, 1));
  };
  for (let g = 0; g < GEN; g++) {
    const pop = [];
    for (let k = 0; k < lam; k++) { const z = Array.from({ length: n }, gauss), y = z.map((v, j) => v * Math.sqrt(C[j])), u = m.map((v, j) => v + sigma * y[j]); pop.push({ y, u, ...evaluer(cfg, dims, u) }); }
    pop.sort((a, b) => a.f - b.f); if (pop[0].f < best.f) best = { f: pop[0].f, u: pop[0].u.slice(), parts: pop[0].parts };
    const yw = new Array(n).fill(0); for (let i = 0; i < mu; i++) for (let j = 0; j < n; j++) yw[j] += w[i] * pop[i].y[j];
    for (let j = 0; j < n; j++) m[j] += sigma * yw[j];
    for (let j = 0; j < n; j++) ps[j] = (1 - cs) * ps[j] + Math.sqrt(cs * (2 - cs) * mueff) * yw[j] / Math.sqrt(C[j]);
    const nps = Math.sqrt(ps.reduce((a, b) => a + b * b, 0)), hs = nps / Math.sqrt(1 - (1 - cs) ** (2 * (g + 1))) < (1.4 + 2 / (n + 1)) * EN ? 1 : 0;
    for (let j = 0; j < n; j++) {
      pc[j] = (1 - cc) * pc[j] + hs * Math.sqrt(cc * (2 - cc) * mueff) * yw[j];
      let s = 0; for (let i = 0; i < mu; i++) s += w[i] * pop[i].y[j] ** 2;
      C[j] = (1 - c1 - cmu) * C[j] + c1 * (pc[j] ** 2 + (1 - hs) * cc * (2 - cc) * C[j]) + cmu * s;
    }
    sigma = Math.min(0.5, sigma * Math.exp((cs / ds) * (nps / EN - 1)));
    if (g % 5 === 0 || g === GEN - 1) { console.log(`gén ${g} meilleur ${best.f.toFixed(3)} [${best.parts.map(p => p.toFixed(2)).join(" ")}] σ ${sigma.toFixed(3)} ${((Date.now() - t0) / 1000).toFixed(0)} s`); ecrire(g); }
  }
}
module.exports = { mesurerSynth, preparer, decode, evaluer, lireCfg };
