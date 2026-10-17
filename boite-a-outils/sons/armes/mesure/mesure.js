// Mesures d'un coup de feu (ou d'une explosion), identiques pour les vrais enregistrements et pour nos synthèses.
// node mesure.js dossier [dossier…]          → résumé JSON de chaque dossier (moyenne et écart entre tirs réels)
"use strict";
const fs = require("fs"), path = require("path");
const SR = 48000;
const TIERS = [63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000];
// fenêtres (ms après l'attaque) du profil d'énergie
const FEN = [[0, 1], [1, 3], [3, 8], [8, 20], [20, 50], [50, 120], [120, 250], [250, 500], [500, 1000], [1000, 1500]];

function lireWav(f) {   // WAV PCM 16/24/32 bits ou flottant 32 bits, mono ou stéréo (moyenne), 48 kHz attendu
  const b = fs.readFileSync(f); let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString("ascii", p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === "data") data = b.subarray(p + 8, p + 8 + n); p += 8 + n + (n & 1); }
  const by = fmt.bits / 8, n = Math.floor(data.length / by / fmt.ch), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) { const o = (i * fmt.ch + c) * by;
    s += fmt.tag === 3 ? data.readFloatLE(o) : by === 2 ? data.readInt16LE(o) / 32768 : by === 3 ? data.readIntLE(o, 3) / 8388608 : data.readInt32LE(o) / 2147483648; }
    x[i] = s / fmt.ch; }
  if (fmt.sr !== SR) throw new Error(f + " : " + fmt.sr + " Hz (48000 attendu)");
  return x;
}
function ecrireWav(f, x, sr) {
  sr = sr || SR; const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(f, b);
}
function passeHaut(x, fc) {   // Butterworth 2e ordre (vent, grondement du micro)
  const w = Math.tan(Math.PI * fc / SR), q = Math.SQRT1_2, n = 1 / (1 + w / q + w * w);
  const b0 = n, b1 = -2 * n, b2 = n, a1 = 2 * (w * w - 1) * n, a2 = (1 - w / q + w * w) * n, y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function fftPow(x, n) {
  const re = new Float64Array(n), im = new Float64Array(n), M = x.length;
  for (let i = 0; i < M; i++) re[i] = x[i] * (M > 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (M - 1)) : 1);
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const p = i + k, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
      re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  const P = new Float64Array(n / 2 + 1); for (let k = 0; k <= n / 2; k++) P[k] = re[k] * re[k] + im[k] * im[k]; return P;
}
function tiers(x) {   // profil par tiers d'octave, en dB, normalisé (somme = 0 dB)
  let n = 1; while (n < Math.max(x.length, 8192)) n <<= 1; const P = fftPow(x, n), df = SR / n, out = [];
  for (const fc of TIERS) { const lo = fc / 2 ** (1 / 6), hi = fc * 2 ** (1 / 6); let s = 0;
    for (let k = Math.ceil(lo / df); k * df < hi && k < P.length; k++) s += P[k]; out.push(s); }
  const tot = out.reduce((a, b) => a + b, 0) || 1; return out.map(v => 10 * Math.log10(v / tot + 1e-12));
}
// attaque : premier échantillon à moins de 30 dB du maximum (enveloppe 0,25 ms), moins 0,5 ms
// on part du maximum et on remonte au plus 15 ms : le bruit de fond d'avant le tir ne peut pas passer pour l'attaque
function attaque(x) {
  let pk = 0, ip = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk) { pk = Math.abs(x[i]); ip = i; }
  const s = pk * 0.0316, lim = Math.max(0, ip - Math.round(0.015 * SR)); let i = lim; while (i < ip && Math.abs(x[i]) < s) i++;
  return Math.max(0, i - Math.round(0.0005 * SR));
}
function mesurer(y) {
  let x = passeHaut(y, 50); let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); x = x.map(v => v / (pk || 1));
  const i0 = attaque(x), ms = k => Math.round(k * SR / 1000);
  // bruit de fond (pré-roulement des vrais enregistrements ; nos synthèses n'en ont pas)
  let bruit = -150; if (i0 > ms(60)) { let s = 0; for (let i = 0; i < i0 - ms(10); i++) s += x[i] * x[i]; bruit = 10 * Math.log10(s / (i0 - ms(10)) + 1e-15); }
  const lvl = (a, b) => { let s = 0, n = 0; for (let i = i0 + ms(a); i < Math.min(x.length, i0 + ms(b)); i++) { s += x[i] * x[i]; n++; } return n ? 10 * Math.log10(s / n + 1e-15) : -150; };
  const L0 = Math.max(lvl(0, 1), lvl(1, 3));
  const profil = FEN.map(([a, b]) => lvl(a, b) - L0), plancher = bruit - L0;
  const direct = tiers(x.slice(i0, i0 + ms(12))), queue = tiers(x.slice(i0 + ms(60), i0 + ms(900)));
  // écrêtage / compression : part du temps (dans les 12 premières ms) à plus de 70 % du maximum
  let fort = 0; for (let i = i0; i < i0 + ms(12) && i < x.length; i++) if (Math.abs(x[i]) > 0.7) fort++;
  return { direct, queue, profil, plancher, fort: fort / SR * 1000 /* en ms */ };
}
function resume(ms) {
  const n = ms.length, moy = k => ms[0][k].map((_, b) => ms.reduce((a, m) => a + m[k][b], 0) / n);
  const et = (k, M) => ms[0][k].map((_, b) => Math.sqrt(ms.reduce((a, m) => a + (m[k][b] - M[b]) ** 2, 0) / Math.max(1, n - 1)));
  const r = { n };
  for (const k of ["direct", "queue", "profil"]) { r[k] = moy(k).map(v => +v.toFixed(2)); r[k + "_et"] = et(k, r[k]).map(v => +v.toFixed(2)); }
  r.plancher = +(Math.max(...ms.map(m => m.plancher))).toFixed(1);
  r.fort = +(ms.reduce((a, m) => a + m.fort, 0) / n).toFixed(3); r.fort_et = +Math.sqrt(ms.reduce((a, m) => a + (m.fort - r.fort) ** 2, 0) / Math.max(1, n - 1)).toFixed(3);
  return r;
}
// écart entre une synthèse (mesures S, résumé d'un groupe de rendus) et une cible C (résumé de vrais tirs), sans unité :
// ≈ 1 quand la synthèse est aussi proche de la cible qu'un vrai tir de l'autre
// carré pour les petits écarts, puis linéaire : un très gros écart pèse lourd mais garde une pente (l'optimiseur voit toujours le mieux)
const huber = d => { const a = Math.abs(d); return a < 3 ? a * a : 9 + 6 * (a - 3); };
function ecart(S, C, detail) {
  const bandes = (k, fmin) => { let e = 0, n = 0; for (let b = 0; b < TIERS.length; b++) { if (TIERS[b] < fmin) continue;
    const s = Math.max(2, C[k + "_et"][b]), d = (S[k][b] - C[k][b]) / s; e += huber(d); n++; } return e / n; };
  const ed = bandes("direct", 63), eq = C.profil[6] > C.plancher + 8 ? bandes("queue", 100) : 0;
  let ep = 0, np = 0; for (let w = 0; w < FEN.length; w++) {
    const c = C.profil[w]; if (c < C.plancher + 6) continue;   // sous le bruit de fond de l'enregistrement : on ne compare pas
    const s = Math.max(2, C.profil_et[w]), v = Math.max(S.profil[w], C.plancher), d = (v - c) / s; ep += huber(d); np++; }
  ep = np ? ep / np : 0;
  const ef = huber((S.fort - C.fort) / Math.max(0.15, C.fort_et)) / 4;
  const tot = ed + 0.6 * eq + 1.2 * ep + 0.4 * ef;
  return detail ? { total: +tot.toFixed(3), direct: +ed.toFixed(2), queue: +eq.toFixed(2), profil: +ep.toFixed(2), fort: +ef.toFixed(2) } : tot;
}
function mesurerDossier(d) {
  const fs_ = fs.readdirSync(d).filter(f => f.endsWith(".wav")).sort();
  return resume(fs_.map(f => mesurer(lireWav(path.join(d, f)))));
}
// écart « réel contre réel » : chaque tir réel contre le résumé des autres tirs du même dossier (sert d'échelle)
function etalon(d) {
  const fs_ = fs.readdirSync(d).filter(f => f.endsWith(".wav")).sort(), M = fs_.map(f => mesurer(lireWav(path.join(d, f))));
  if (M.length < 2) return null;
  const e = M.map((m, i) => ecart(resume([m]), resume(M.filter((_, j) => j !== i))));
  return +(e.reduce((a, b) => a + b, 0) / e.length).toFixed(2);
}
module.exports = { SR, TIERS, FEN, lireWav, ecrireWav, passeHaut, mesurer, resume, ecart, mesurerDossier, etalon };
if (require.main === module) for (const d of process.argv.slice(2)) {
  const r = mesurerDossier(d); console.log(path.basename(d), "n=" + r.n, "étalon", etalon(d), "plancher", r.plancher, "fort(ms)", r.fort);
  console.log("  profil", r.profil.join(" "), " ±", r.profil_et.map(v => v.toFixed(1)).join(" "));
  console.log("  direct", r.direct.map(v => v.toFixed(0)).join(" "));
  console.log("  queue ", r.queue.map(v => v.toFixed(0)).join(" "));
}
