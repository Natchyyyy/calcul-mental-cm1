// Calibration automatique : cherche les réglages qui font ressembler nos pas synthétiques à de vrais enregistrements.
// Les mesures sont les mêmes que mesures.py (tiers d'octave, décroissance, centroïdes), recodées ici pour aller vite.
// usage : node calibrer.js cible.json "Preset de départ" cle1,cle2,… [evals] [--globales] [--graine n]
//   cible.json : sortie de mesures.py (champ resume) pour un groupe d'enregistrements
const fs = require("fs"), Pas = require(process.env.PASJS || require("path").join(__dirname, "..", "pas.js"));
const SR = 48000, TIERS = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000];

// ---------- mesures (copie fidèle de mesures.py) ----------
function envDb(x, ms) {
  const w = Math.max(1, Math.round(SR * ms / 1000)), n = x.length, c = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) c[i + 1] = c[i] + x[i] * x[i];
  const off = Math.floor((w - 1) / 2), e = new Float64Array(n);
  for (let k = 0; k < n; k++) { const j = k + off, hi = Math.min(n - 1, j), lo = Math.max(0, j - w + 1); e[k] = 20 * Math.log10(Math.sqrt(Math.max(0, c[hi + 1] - c[lo]) / w) + 1e-9); }
  return e;
}
function decoupe(x) {
  const e = envDb(x, 1); let pk = -1e9; for (const v of e) if (v > pk) pk = v;
  let i0 = 0; while (i0 < e.length && !(e[i0] > pk - 30)) i0++; i0 = Math.max(0, i0 - Math.round(0.005 * SR));
  let i1 = e.length - 1; while (i1 > 0 && !(e[i1] > pk - 50)) i1--;
  return x.slice(i0, i1 + 1);
}
function fftPow(x, n) {   // |FFT|² d'un signal fenêtré (Hann « numpy »), zéros jusqu'à n
  const re = new Float64Array(n), im = new Float64Array(n), M = x.length;
  for (let i = 0; i < M; i++) re[i] = x[i] * (M > 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (M - 1)) : 1);
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const p = i + k, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
      re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  const P = new Float64Array(n / 2 + 1); for (let k = 0; k <= n / 2; k++) P[k] = re[k] * re[k] + im[k] * im[k]; return P;
}
function tiers(x) {
  let n = 1; while (n < Math.max(x.length, 4096)) n <<= 1; const P = fftPow(x, n), df = SR / n, out = [];
  for (const fc of TIERS) { const lo = fc / 2 ** (1 / 6), hi = fc * 2 ** (1 / 6); let s = 0; for (let k = Math.ceil(lo / df); k * df < hi && k < P.length; k++) if (k * df >= lo) s += P[k]; out.push(s); }
  const tot = out.reduce((a, b) => a + b, 0); return out.map(v => 10 * Math.log10(v / tot + 1e-12));
}
function decroissance(x) {
  const e = envDb(x, 2); let ip = 0; for (let i = 0; i < e.length; i++) if (e[i] > e[ip]) ip = i; const pk = e[ip], out = {};
  for (const d of [10, 20, 30, 40]) { let k = ip; while (k < e.length && !(e[k] < pk - d)) k++; out[d] = k < e.length ? (k - ip) / SR * 1000 : null; }
  return out;
}
function centroide(seg) { if (seg.length < 64) return 0; const n = seg.length; let N = 1; while (N < n) N <<= 1;
  // numpy rfft(seg*hanning) sans zéros : on approche avec la longueur suivante (écart négligeable pour un centroïde)
  const P = fftPow(seg, N); let s = 0, w = 0; for (let k = 0; k < P.length; k++) { s += k * SR / N * P[k]; w += P[k]; } return s / (w + 1e-12); }
function mesurer(y) {
  let p = 0; for (const v of y) p = Math.max(p, Math.abs(v)); let x = Float64Array.from(y, v => v / (p || 1));
  x = decoupe(x); p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); x = x.map(v => v / p);
  const e = envDb(x, 1); let ip = 0; for (let i = 0; i < e.length; i++) if (e[i] > e[ip]) ip = i;
  const c1 = centroide(x.slice(Math.max(0, ip - Math.round(0.002 * SR)), ip + Math.round(0.01 * SR))), c2 = centroide(x.slice(ip + Math.round(0.01 * SR), ip + Math.round(0.08 * SR)));
  return { tiers: tiers(x), decroissance: decroissance(x), centroides: [c1, c2] };
}
// convolution rapide (FFT complexe) pour ajouter la pièce comme dans un vrai enregistrement
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const p = i + k, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
      re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function convoluer(x, h) {
  let n = 1; while (n < x.length + h.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(h); fft(ar, ai); fft(br, bi);
  for (let k = 0; k < n; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; }
  fft(ar, ai, true); return ar.subarray(0, x.length + h.length - 1);
}
const irCache = new Map();
function avecPiece(y, P) {   // son tel qu'entendu depuis la tête (direct + pièce), canal gauche
  const key = [P.longueur, P.largeur, P.hauteur, P.absorption, P.clarte].join();
  let R = irCache.get(key); if (!R) { R = Pas.piece(Object.assign({}, P, { distance: 0 }), SR); irCache.set(key, R); }
  const w = convoluer(y, R.ir[0]), out = new Float64Array(w.length);
  for (let i = 0; i < w.length; i++) out[i] = (i < y.length ? y[i] : 0) + w[i] * P.mix;
  return out;
}
let PIECE = process.argv.includes("--piece");
function mesurerGroupe(P, n, base, piece) {   // piece : true/false pour forcer (sinon option --piece)
  const ms = [], avec = piece == null ? PIECE : piece;
  for (let i = 0; i < n; i++) { const y = Pas.rendre(Object.assign({}, P, { distance: 0 }), (base || 100) + i, { sr: SR }); ms.push(mesurer(avec ? avecPiece(y, P) : y)); }
  const T = TIERS.map((_, b) => ms.reduce((a, m) => a + m.tiers[b], 0) / n), D = {};
  for (const d of [10, 20, 30, 40]) { const v = ms.map(m => m.decroissance[d]).filter(z => z != null); D[d] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 300; }
  const C = [0, 1].map(k => ms.reduce((a, m) => a + m.centroides[k], 0) / n);
  return { tiers: T, decroissance: D, centroides: C };
}

// ---------- écart entre une synthèse et la cible ----------
function ecart(S, C, detail) {
  let eb = 0, nb = 0;
  // les bandes sous C.fmin (si la cible en a un : grondement de micro dans l'enregistrement) sont ignorées ;
  // on compare alors les profils renormalisés sur les bandes gardées
  const b0 = Math.max(1, TIERS.findIndex(f => f >= (C.fmin || 0))), keep = [];
  for (let b = b0; b < TIERS.length - 1; b++) keep.push(b);
  const lin = v => keep.reduce((a, b) => a + 10 ** (v[b] / 10), 0), ns = 10 * Math.log10(lin(S.tiers)), nc = 10 * Math.log10(lin(C.tiers_moy));
  for (const b of keep) { const s = Math.max(2.5, C.tiers_ecart[b]), d = C.fmin ? ((S.tiers[b] - ns) - (C.tiers_moy[b] - nc)) / s : (S.tiers[b] - C.tiers_moy[b]) / s; eb += d * d; nb++; }
  eb /= nb; let ed = 0;
  for (const [d, w] of [[10, 0.5], [20, 1], [30, 0.8], [40, 0.15]]) { const t = C.decroissance_moy[d]; if (t) ed += w * (Math.log(S.decroissance[d] / t) / 0.3) ** 2; }
  let ec = 0; for (const k of [0, 1]) ec += (Math.log((S.centroides[k] + 1) / (C.centroide_moy[k] + 1)) / 0.3) ** 2;
  const tot = eb + 0.35 * ed + 0.5 * ec;
  if (detail) return { total: +tot.toFixed(3), bandes: +eb.toFixed(3), decroissance: +ed.toFixed(3), centroides: +ec.toFixed(3) };
  return tot;
}

if (require.main === module && process.argv.length < 5) console.log("usage : node calibrer.js cible.json \"Réglage de départ\" cle1,cle2,… [evaluations] [--globales] [--piece]");
else if (require.main === module) {
  const args = process.argv.slice(2), C = JSON.parse(fs.readFileSync(args[0])).resume, start = args[1], keys = args[2].split(","), evals = +(args[3] || 400);
  const glob = args.includes("--globales"), gi = args.indexOf("--graine"), r = Pas.rng(gi > 0 ? +args[gi + 1] : 5);
  const info = Object.fromEntries(Pas.PARAMS.map(p => [p[0], p]));
  const G = { TILT: [0, 1.5], CLAQUE: [0, 15], BASCULE: [0, 1.2], CRAQUE: [0, 25], CRAQUE_F: [1500, 9000], PEAU: [0, 30] }, gk = glob ? Object.keys(G) : [];
  const lo = [...keys.map(k => info[k][3]), ...gk.map(k => G[k][0])], hi = [...keys.map(k => info[k][4]), ...gk.map(k => G[k][1])];
  const P0 = Pas.preset(start), c0 = Pas._calib();
  let x = [...keys.map(k => P0[k]), ...gk.map(k => c0[k])].map((v, i) => (v - lo[i]) / (hi[i] - lo[i]));
  const evalue = u => { const P = Object.assign({}, P0); keys.forEach((k, i) => P[k] = lo[i] + u[i] * (hi[i] - lo[i]));
    if (glob) { const c = {}; gk.forEach((k, j) => c[k] = lo[keys.length + j] + u[keys.length + j] * (hi[keys.length + j] - lo[keys.length + j])); Pas._calib(c); }
    return ecart(mesurerGroupe(P, 6), C); };
  let fx = evalue(x), sigma = 0.18, n = 1; const lam = 8;
  console.log("départ", fx.toFixed(3));
  while (n < evals) {   // stratégie d'évolution (1, λ) avec élitisme et pas adaptatif
    let best = null, fb = Infinity;
    for (let j = 0; j < lam; j++) {
      const u = x.map(v => { let g = 0; for (let q = 0; q < 6; q++) g += r(); return Math.min(1, Math.max(0, v + sigma * (g - 3) / 0.707)); });
      const f = evalue(u); n++; if (f < fb) { fb = f; best = u; }
    }
    if (fb < fx) { x = best; fx = fb; sigma = Math.min(0.3, sigma * 1.25); } else sigma = Math.max(0.01, sigma * 0.8);
    if (n % 40 < lam) console.log(n, fx.toFixed(3), "σ", sigma.toFixed(3));
  }
  const P = {}; keys.forEach((k, i) => P[k] = +(lo[i] + x[i] * (hi[i] - lo[i])).toPrecision(3));
  const c = {}; gk.forEach((k, j) => c[k] = +(lo[keys.length + j] + x[keys.length + j] * (hi[keys.length + j] - lo[keys.length + j])).toPrecision(3));
  if (glob) Pas._calib(c);
  const S = mesurerGroupe(Object.assign({}, P0, P), 10, 500);
  console.log(JSON.stringify({ reglages: P, globales: c, ecart: ecart(S, C, true) }));
  console.log("bandes synth", S.tiers.map(v => v.toFixed(1)).join(" ")); console.log("bandes cible", C.tiers_moy.join(" "));
  console.log("décr synth", JSON.stringify(Object.fromEntries(Object.entries(S.decroissance).map(([k, v]) => [k, +v.toFixed(1)]))), "cible", JSON.stringify(C.decroissance_moy), "centr", S.centroides.map(Math.round), C.centroide_moy);
}
module.exports = { mesurer, mesurerGroupe, ecart, TIERS, avecPiece, convoluer, set piece(v) { PIECE = v; } };
