// Échelle de référence : écart de vrais enregistrements par rapport à une cible (même mesure que la calibration)
const fs = require("fs"), path = require("path"), { mesurer, ecart, TIERS } = require("./calibrer.js");
function lireWav(f) { const b = fs.readFileSync(f); let o = 12, fmt = null, data = null;
  while (o < b.length - 8) { const id = b.toString("ascii", o, o + 4), sz = b.readUInt32LE(o + 4); if (id === "fmt ") fmt = { ch: b.readUInt16LE(o + 10), bits: b.readUInt16LE(o + 22) }; if (id === "data") data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = data.length / 2 / fmt.ch, y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = data.readInt16LE(i * 2 * fmt.ch) / 32767; return y; }
function groupe(files) { const ms = files.map(f => mesurer(lireWav(f))), n = ms.length;
  const T = TIERS.map((_, b) => ms.reduce((a, m) => a + m.tiers[b], 0) / n), D = {};
  for (const d of [10, 20, 30, 40]) { const v = ms.map(m => m.decroissance[d]).filter(z => z != null); D[d] = v.reduce((a, b) => a + b, 0) / v.length; }
  return { tiers: T, decroissance: D, centroides: [0, 1].map(k => ms.reduce((a, m) => a + m.centroides[k], 0) / n) }; }
module.exports = { lireWav, groupe };
if (require.main === module) {
  const cible = JSON.parse(fs.readFileSync(process.argv[2])).resume, dirs = process.argv.slice(3);
  for (const d of dirs) { const files = fs.readdirSync(path.dirname(d)).filter(f => f.startsWith(path.basename(d)) && f.endsWith(".wav")).map(f => path.join(path.dirname(d), f));
    console.log(path.basename(d).padEnd(12), "groupe", JSON.stringify(ecart(groupe(files), cible, true)), " pas seuls:", files.map(f => ecart(groupe([f]), cible).toFixed(1)).join(" ")); }
}
