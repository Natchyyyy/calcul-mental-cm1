// Exporte des coups de feu en fichiers sons, pour un autre moteur de jeu (Unreal, Godot, Unity…) ou pour sons/integrer.py.
// usage : node exporter.js --sortie dossier [--armes "Pistolet 9 mm,Fusil à pompe 12" | --json reglages.json]
//                         [--lieu "Forêt"] [--positions "tireur,10,50:90,300"] [--variantes 6] [--sec]
//                         [--actions] [--format ogg|wav|les-deux] [--sr 48000] [--graine 1]
//   --positions : « tireur » (c'est le joueur qui tire) ou distance en m, avec « :angle » (° depuis l'axe du canon, 15 par défaut)
//   --sec : son direct mono SANS le lieu (à mettre dans la réverbération du moteur de jeu). Sans : stéréo avec le lieu.
//   --actions : ajoute la pompe / la culasse / le clic à vide de chaque arme (vue du tireur)
//   --json : un fichier copié depuis l'atelier ({ "depart": "…", "changements": {…} }) ou une liste de ceux-ci
// Produit <arme>_<position>_<i>.wav/.ogg et manifeste.json ({ nom: [fichiers] }, le format de sons/integrer.py).
// Les niveaux sont physiques ET communs à tout l'export : un tir lointain est vraiment plus faible qu'un tir proche,
// et un fusil plus fort qu'un pistolet (le plus fort de l'export culmine à −1 dBFS).
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process"), A = require("./armes.js");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; }, has = k => process.argv.includes("--" + k);
const out = arg("sortie", "armes_exportees"), n = +arg("variantes", 6), sr = +arg("sr", 48000), fmt = arg("format", "ogg"), graine = +arg("graine", 1);
const lieuNom = arg("lieu", Object.keys(A.LIEUX)[0]); if (!A.LIEUX[lieuNom]) throw new Error("Lieu inconnu : « " + lieuNom + " »\nPossibles : " + Object.keys(A.LIEUX).join(", "));
fs.mkdirSync(out, { recursive: true });
let liste = [];
if (arg("json")) { let j = JSON.parse(fs.readFileSync(arg("json"), "utf8")); if (!Array.isArray(j)) j = [j];
  liste = j.map((q, k) => { if (q.depart && !A.PRESETS[q.depart]) throw new Error("Arme inconnue : « " + q.depart + " »\nPossibles : " + Object.keys(A.PRESETS).join(", "));
    const ch = q.changements || Object.fromEntries(Object.entries(q).filter(([c]) => c in A.DEFAUT));
    return { nom: q.nom || (q.depart || "perso") + (j.length > 1 ? " " + k : ""), P: Object.assign(q.depart ? A.preset(q.depart) : Object.assign({}, A.DEFAUT), ch) }; }); }
else liste = (arg("armes") ? arg("armes").split(",") : Object.keys(A.PRESETS)).map(s => s.trim()).map(nom => {
  if (!A.PRESETS[nom]) throw new Error("Arme inconnue : " + nom + "\nPossibles : " + Object.keys(A.PRESETS).join(", ")); return { nom, P: A.preset(nom) }; });
const positions = arg("positions", "tireur,15,60,250").split(",").map(s => s.trim()).map(s => s === "tireur" ? { nom: "tireur", tireur: 1 } : (() => { const [d, a] = s.split(":"); return { nom: d + "m" + (a ? "_" + a : ""), distance: +d, angle: a == null ? 15 : +a }; })());
const slug = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
function wav(file, chans) {
  const len = chans[0].length, nc = chans.length, b = Buffer.alloc(44 + len * nc * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + len * nc * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(nc, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * nc * 2, 28); b.writeUInt16LE(nc * 2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(len * nc * 2, 40);
  for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + (i * nc + c) * 2);
  fs.writeFileSync(file, b);
}
function fin(c) {   // coupe le silence de fin (sous −70 dB du maximum) avec un petit fondu
  let pk = 0; for (const v of c[0]) pk = Math.max(pk, Math.abs(v)); let e = c[0].length; const th = pk * 3e-4;
  while (e > 1 && c.every(ch => Math.abs(ch[e - 1]) < th)) e--; e = Math.min(c[0].length, e + Math.round(sr * 0.05));
  return c.map(ch => { const o = ch.slice(0, e), f = Math.min(o.length, Math.round(sr * 0.05)); for (let k = 0; k < f; k++) o[o.length - 1 - k] *= k / f; return o; });
}
const sons = [];   // { cle, chans, info }
for (const { nom, P } of liste) {
  const Pl = Object.assign({}, P, A.LIEUX[lieuNom]);
  for (const pos of positions) {
    const Q = Object.assign({}, Pl, pos.tireur ? { tireur: 1, distance: Pl.type >= 0.5 ? 6 : 0.6, angle: 170 } : { tireur: 0, distance: pos.distance, angle: pos.angle });
    const cle = slug(nom) + "_" + slug(pos.nom);
    for (let i = 0; i < n; i++) {
      const T = A.tir(Q, graine * 1000 + i, { sr }), len = Math.max(T.sec.length, T.env[0].length);
      const ch = has("sec") ? [Float32Array.from(T.sec)] : [0, 1].map(c => { const o = new Float32Array(len); for (let k = 0; k < len; k++) o[k] = (k < T.sec.length ? T.sec[k] : 0) + (k < T.env[c].length ? T.env[c][k] : 0); return o; });
      sons.push({ cle, chans: fin(ch), info: { retard_s: +T.retard.toFixed(4), claquement: T.chocs > 0 } });
    }
  }
  if (has("actions") && P.type < 0.5) for (const quoi of [P.meca >= 1 ? "culasse" : P.projectiles > 1 || /pompe/i.test(nom) ? "pompe" : "verrou", "clic"])
    for (let i = 0; i < Math.min(n, 4); i++) sons.push({ cle: slug(nom) + "_" + quoi, chans: fin([A.action(Object.assign({}, P, { tireur: 1 }), quoi, graine * 1000 + i, { sr })]), info: {} });
}
let pk = 0; for (const s of sons) for (const c of s.chans) for (const v of c) pk = Math.max(pk, Math.abs(v));
const g = Math.pow(10, -1 / 20) / (pk || 1), man = fs.existsSync(path.join(out, "manifeste.json")) ? JSON.parse(fs.readFileSync(path.join(out, "manifeste.json"))) : {}, infos = {};
let ffmpeg = true; try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch (e) { ffmpeg = false; if (fmt !== "wav") console.warn("ffmpeg absent : export en .wav seulement"); }
const compte = {};
for (const s of sons) {
  const i = compte[s.cle] = (compte[s.cle] ?? -1) + 1, base = path.join(out, `${s.cle}_${i}`); wav(base + ".wav", s.chans.map(c => c.map(v => v * g)));
  let f = path.basename(base + ".wav");
  if (ffmpeg && fmt !== "wav") { execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", base + ".wav", "-c:a", "libopus", "-b:a", s.chans.length > 1 ? "96k" : "64k", base + ".ogg"]); f = path.basename(base + ".ogg"); if (fmt === "ogg") fs.unlinkSync(base + ".wav"); }
  (man[s.cle] = i ? man[s.cle] : []).push(f); infos[s.cle] = s.info;
}
fs.writeFileSync(path.join(out, "manifeste.json"), JSON.stringify(man, null, 1));
fs.writeFileSync(path.join(out, "infos_armes.json"), JSON.stringify({ lieu: lieuNom, gain_dB: +(20 * Math.log10(g)).toFixed(2), sons: infos }, null, 1));
console.log(Object.keys(compte).map(k => `${k} ×${compte[k] + 1}`).join("\n"));
console.log("manifeste.json :", Object.keys(man).length, "sons dans", out, "— lieu :", lieuNom, "— infos_armes.json : temps de vol (retard_s) de chaque position");
