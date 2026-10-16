// Rend N pas séparés (sans pièce) d'un preset en WAV : node rendre_pas.js "Preset" N dossier [json_modifs] [prefixe]
const fs = require("fs"), path = require("path"), Pas = require(process.env.PASJS || require("path").join(__dirname, "..", "pas.js"));
const [name, n, out, mods, pre] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const P = Object.assign(Pas.preset(name), mods ? JSON.parse(mods) : {}, { reverbT: 0, mix: 0, distance: 0 });
function wav(file, y, sr) { const b = Buffer.alloc(44 + y.length * 2); b.write("RIFF", 0); b.writeUInt32LE(36 + y.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(y.length * 2, 40); let p = 0; for (const v of y) p = Math.max(p, Math.abs(v));
  for (let i = 0; i < y.length; i++) b.writeInt16LE(Math.round(y[i] / (p || 1) * 0.9 * 32767), 44 + i * 2); fs.writeFileSync(file, b); }
for (let i = 0; i < +n; i++) { const y = Pas.rendre(P, 100 + i, { sr: 48000 }); wav(path.join(out, `${pre || "synth"}_${i}.wav`), y, 48000); }
