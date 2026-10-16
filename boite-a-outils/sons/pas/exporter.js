// Exporte des pas en fichiers sons, pour un autre moteur de jeu (Unreal, Godot, Unity…) ou pour sons/integrer.py.
// usage : node exporter.js --sortie dossier [--reglages "Parquet en chêne,Escalier en bois" | --json reglages.json]
//                         [--variantes 8] [--avec-piece] [--format ogg|wav|les-deux] [--sr 48000] [--graine 1]
//   --json : un fichier copié depuis l'atelier ({ "depart": "…", "changements": {…} }) ou une liste de ceux-ci
//   --avec-piece : ajoute l'écho de la pièce (stéréo). Sans : son sec mono, à mettre dans la réverbération du moteur.
// Produit <nom>_<i>.wav/.ogg et manifeste.json ({ nom: [fichiers] }, le format de sons/fabriquer.py → sons/integrer.py).
// Le niveau : la variante la plus forte de chaque réglage culmine à −3 dBFS, les autres gardent leur différence naturelle.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process"), Pas = require("./pas.js");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; }, has = k => process.argv.includes("--" + k);
const out = arg("sortie", "pas_exportes"), n = +arg("variantes", 8), sr = +arg("sr", 48000), fmt = arg("format", "ogg"), graine = +arg("graine", 1);
fs.mkdirSync(out, { recursive: true });
let liste = [];
if (arg("json")) { let j = JSON.parse(fs.readFileSync(arg("json"), "utf8")); if (!Array.isArray(j)) j = [j];
  liste = j.map((q, k) => {
    // { depart, changements } (copié depuis l'atelier) ou un simple objet de réglages (appliqué sur les valeurs par défaut)
    const simple = !q.depart && !q.changements, ch = simple ? Object.fromEntries(Object.entries(q).filter(([c]) => c in Pas.DEFAUT)) : (q.changements || {});
    if (q.depart && !Pas.PRESETS[q.depart]) throw new Error("Réglage de départ inconnu : « " + q.depart + " »\nPossibles : " + Object.keys(Pas.PRESETS).join(", "));
    const inconnus = Object.keys(simple ? q : ch).filter(c => !(c in Pas.DEFAUT) && c !== "nom" && c !== "moteur"); if (inconnus.length) console.warn("Réglages ignorés (inconnus) :", inconnus.join(", "));
    return { nom: q.nom || ((q.depart || "perso") + (Object.keys(ch).length && q.depart ? " perso" : "") + (j.length > 1 ? " " + k : "")), P: Object.assign(q.depart ? Pas.preset(q.depart) : Object.assign({}, Pas.DEFAUT), ch) };
  }); }
else liste = (arg("reglages") ? arg("reglages").split(",") : Object.keys(Pas.PRESETS)).map(nom => { if (!Pas.PRESETS[nom.trim()]) throw new Error("Réglage inconnu : " + nom + "\nPossibles : " + Object.keys(Pas.PRESETS).join(", ")); return { nom: nom.trim(), P: Pas.preset(nom.trim()) }; });
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function wav(file, chans) {
  const len = chans[0].length, nc = chans.length, b = Buffer.alloc(44 + len * nc * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + len * nc * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(nc, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * nc * 2, 28); b.writeUInt16LE(nc * 2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(len * nc * 2, 40);
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + (i * nc + c) * 2);
  fs.writeFileSync(file, b);
}
function conv(x, h) {   // convolution directe par blocs FFT (simple et suffisante hors ligne)
  let N = 1; while (N < x.length + h.length) N <<= 1;
  const fft = (re, im, inv) => { const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) { const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; } };
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N); ar.set(x); br.set(h); fft(ar, ai); fft(br, bi);
  for (let k = 0; k < N; k++) { const r = ar[k] * br[k] - ai[k] * bi[k], i = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; ai[k] = i; } fft(ar, ai, true);
  return ar.subarray(0, x.length + h.length - 1);
}
const man = fs.existsSync(path.join(out, "manifeste.json")) ? JSON.parse(fs.readFileSync(path.join(out, "manifeste.json"))) : {};
let ffmpeg = true; try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch (e) { ffmpeg = false; if (fmt !== "wav") console.warn("ffmpeg absent : export en .wav seulement"); }
for (const { nom, P } of liste) {
  const s = "pas_" + slug(nom), sons = [];
  const R = has("avec-piece") ? Pas.piece(P, sr) : null;
  for (let i = 0; i < n; i++) {
    const y = Pas.rendre(P, graine * 1000 + i, { sr });
    if (R) { const tail = Math.round(sr * R.T * 1.1), ch = R.ir.map(h => { const w = conv(y, h), o = new Float32Array(y.length + tail); for (let k = 0; k < o.length; k++) o[k] = (k < y.length ? y[k] * Math.min(1, R.sec) : 0) + (k < w.length ? w[k] * Math.min(1, R.sec) * P.mix : 0); return o; });
      // fondu de fin pour ne pas couper la queue d'écho
      for (const c of ch) { const f = Math.round(tail * 0.2); for (let k = 0; k < f; k++) c[c.length - 1 - k] *= (k / f) ** 2; } sons.push(ch); }   // fondu sur le dernier 5e de la queue
    else sons.push([y]);
  }
  let pk = 0; for (const ch of sons) for (const c of ch) for (const v of c) pk = Math.max(pk, Math.abs(v));
  const g = Math.pow(10, -3 / 20) / (pk || 1), files = [];
  sons.forEach((ch, i) => {
    const base = path.join(out, `${s}_${i}`); wav(base + ".wav", ch.map(c => c.map(v => v * g)));
    if (ffmpeg && fmt !== "wav") { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", base + ".wav", "-c:a", "libopus", "-b:a", ch.length > 1 ? "64k" : "40k", base + ".ogg"]); files.push(path.basename(base + ".ogg")); if (fmt === "ogg") fs.unlinkSync(base + ".wav"); }
    else files.push(path.basename(base + ".wav"));
  });
  man[s] = files; console.log(`${nom} → ${s}_0…${n - 1} (${R ? "stéréo avec écho " + R.T.toFixed(2) + " s" : "mono sec"})`);
}
fs.writeFileSync(path.join(out, "manifeste.json"), JSON.stringify(man, null, 1));
console.log("manifeste.json :", Object.keys(man).length, "sons dans", out);
