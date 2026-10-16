// Calibration conjointe (sep-CMA-ES) : les constantes du moteur sont communes, chaque cible a ses propres réglages.
// usage : node calibrer2.js config.json sortie.json [generations]
// config : { globales: {NOM: [min, max], …}, cibles: [{ cible, preset, base: {…}, cles: [...], depart: {…}, piece: bool }, …], depart_globales: {…} }
//   piece: true = la synthèse est entendue avec sa pièce (pour un enregistrement fait dans une pièce qui résonne)
const fs = require("fs"), Pas = require(process.env.PASJS || require("path").join(__dirname, "..", "pas.js")), { mesurerGroupe, ecart } = require("./calibrer.js");
const [cfgF, outF, genS] = process.argv.slice(2), cfg = JSON.parse(fs.readFileSync(cfgF)), GEN = +(genS || 150);
const info = Object.fromEntries(Pas.PARAMS.map(p => [p[0], p]));
const dims = [];   // [type, cible, clé, min, max]
for (const k of Object.keys(cfg.globales || {})) if (!(k in Pas._calib())) console.warn("constante inconnue ignorée :", k, "— connues :", Object.keys(Pas._calib()).join(", "));
const gk = Object.keys(cfg.globales || {}).filter(k => k in Pas._calib()); for (const k of gk) dims.push(["g", -1, k, ...cfg.globales[k]]);
cfg.cibles.forEach((c, i) => {
  if (!Pas.PRESETS[c.preset]) throw new Error("Réglage de départ inconnu : « " + c.preset + " » — possibles : " + Object.keys(Pas.PRESETS).join(", "));
  c.T = JSON.parse(fs.readFileSync(c.cible)).resume; c.P0 = Object.assign(Pas.preset(c.preset), c.base || {});
  c.cles = c.cles.filter(k => info[k] || (console.warn("réglage inconnu ignoré :", k), false));
  for (const k of c.cles) { dims.push(["p", i, k, ...(c.bornes && c.bornes[k] || [info[k][3], info[k][4]])]); }
});
const n = dims.length, g0 = Object.assign(Pas._calib(), cfg.depart_globales || {});   // sans depart_globales : on part des constantes actuelles
const decode = u => { const G = {}, Ps = cfg.cibles.map(c => Object.assign({}, c.P0)); dims.forEach((d, j) => { const v = d[3] + Math.min(1, Math.max(0, u[j])) * (d[4] - d[3]); if (d[0] === "g") G[d[2]] = v; else Ps[d[1]][d[2]] = v; }); return { G, Ps }; };
function f(u) {
  const { G, Ps } = decode(u); Pas._calib(G); let tot = 0, pen = 0;
  for (let j = 0; j < n; j++) { if (u[j] < 0) pen += u[j] * u[j] * 50; if (u[j] > 1) pen += (u[j] - 1) ** 2 * 50; }
  const parts = cfg.cibles.map((c, i) => ecart(mesurerGroupe(Ps[i], c.n || 6, 100, !!c.piece), c.T)); for (const p of parts) tot += p;
  return { f: tot / parts.length + pen, parts };
}
// départ
let m = dims.map(d => { const v = d[0] === "g" ? g0[d[2]] : (cfg.cibles[d[1]].depart || {})[d[2]] ?? cfg.cibles[d[1]].P0[d[2]]; return (v - d[3]) / (d[4] - d[3]); });
const lam = 4 + Math.floor(3 * Math.log(n)), mu = Math.floor(lam / 2), wr = []; for (let i = 0; i < mu; i++) wr.push(Math.log(mu + 0.5) - Math.log(i + 1));
const ws = wr.reduce((a, b) => a + b, 0), w = wr.map(v => v / ws), mueff = 1 / w.reduce((a, b) => a + b * b, 0);
const cs = (mueff + 2) / (n + mueff + 5), ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs, cc = (4 + mueff / n) / (n + 4 + 2 * mueff / n);
let c1 = 2 / ((n + 1.3) ** 2 + mueff), cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) ** 2 + mueff)); c1 *= (n + 2) / 3; cmu = Math.min(1 - c1, cmu * (n + 2) / 3);
const EN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n)); let sigma = cfg.sigma || 0.2, C = new Array(n).fill(1), ps = new Array(n).fill(0), pc = new Array(n).fill(0);
const R = Pas.rng(cfg.graine || 11), gauss = () => { let u = 0; while (!u) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
let best = { f: Infinity }, t0 = Date.now(); const b0 = f(m); best = { f: b0.f, u: m.slice(), parts: b0.parts };
console.log("départ", b0.f.toFixed(3), b0.parts.map(p => p.toFixed(2)).join(" "));
for (let g = 0; g < GEN; g++) {
  const pop = [];
  for (let k = 0; k < lam; k++) { const z = Array.from({ length: n }, gauss), y = z.map((v, j) => v * Math.sqrt(C[j])), u = m.map((v, j) => v + sigma * y[j]); const r = f(u); pop.push({ y, u, ...r }); }
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
  sigma *= Math.exp((cs / ds) * (nps / EN - 1)); sigma = Math.min(0.5, sigma);
  if (g % 5 === 0 || g === GEN - 1) {
    console.log(`gén ${g} meilleur ${best.f.toFixed(3)} [${best.parts.map(p => p.toFixed(2)).join(" ")}] σ ${sigma.toFixed(3)} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const { G, Ps } = decode(best.u); const res = { ecart: best.f, depart: b0.f, parts: best.parts, globales: G, reglages: cfg.cibles.map((c, i) => ({ preset: c.preset, cible: c.cible, reglages: Object.fromEntries(c.cles.map(k => [k, +Ps[i][k].toPrecision(4)])) })) };
    fs.writeFileSync(outF, JSON.stringify(res, null, 1));
  }
}
