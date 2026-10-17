// Coups de feu et explosions physiques, pour des jeux.
// Chaque tir est calculé à partir de la physique : onde de souffle de la bouche (forme de Friedlander), onde de choc de la
// balle supersonique (onde en N, formules de Whitham), propagation (distance, absorption de l'air ISO 9613-1, reflet sur
// le sol selon sa nature — modèle de Delany et Bazley), bruits de mécanique (culasse, ressort), douille qui tombe,
// écho et réverbération du lieu (plein air ou pièce). Les réglages sont calés sur de vrais enregistrements (voir README).
// Explosion (grenade) : onde de souffle de Kinney et Graham, boule de feu, éclats supersoniques, terre qui retombe.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { const api = factory(); api.__fabrique = factory; root.Armes = api; }
})(typeof self !== "undefined" ? self : this, function factory() {
  "use strict";
  let LIMITE_IR = 8; const C_AIR = 343, P0 = 101325, PREF = 2e-5, TAU = 2 * Math.PI, LN1000 = Math.log(1000);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t, db = v => Math.pow(10, v / 20);

  function rng(seed) {   // mulberry32
    let a = (seed >>> 0) || 1;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gauss = r => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return (s - 3) / 0.7071; };

  // ---------- réglages ----------
  // [clé, groupe, libellé, min, max, pas, défaut, unité, aide, choix?]
  const PARAMS = [
    ["type", "Arme", "Type", 0, 1, 1, 0, "", "0 : arme à feu, 1 : explosion (grenade)", ["arme à feu", "explosion"]],
    ["niveau", "Arme", "Puissance du souffle", 140, 175, 0.5, 160, "dB", "niveau de crête de l'onde de souffle à 1 m devant la bouche (9 mm ≈ 157, fusil ≈ 162, calibre 12 ≈ 162)"],
    ["tplus", "Arme", "Durée du souffle", 0.15, 2.5, 0.01, 0.6, "ms", "durée de la phase de surpression à 1 m : courte = claquant, longue = grave et ample"],
    ["beta", "Arme", "Raideur du souffle", 0.6, 4, 0.05, 1.4, "", "vitesse de retombée de la surpression (forme de Friedlander)"],
    ["montee", "Arme", "Montée du front", 1, 200, 1, 20, "µs", "temps de montée du front de souffle : plus long = moins d'aigus"],
    ["allonge", "Arme", "Allongement avec la distance", 0, 1.5, 0.01, 0.5, "", "l'onde de souffle s'étire en voyageant (effet non linéaire) : plus grave au loin"],
    ["precurseur", "Arme", "Onde précurseur", -40, 0, 0.5, -14, "dB", "petit souffle de l'air chassé devant la balle, juste avant le vrai souffle"],
    ["avance", "Arme", "Avance du précurseur", 0.05, 1.5, 0.01, 0.35, "ms", ""],
    ["cellules", "Arme", "Rebonds du souffle", 0, 4, 1, 2, "", "cellules de choc du jet de gaz : petites répliques du souffle"],
    ["cellNiv", "Arme", "Force des rebonds", -30, 0, 0.5, -9, "dB", ""],
    ["cellEsp", "Arme", "Espacement des rebonds", 0.2, 3, 0.01, 0.8, "ms", ""],
    ["gaz", "Arme", "Souffle des gaz", -40, 0, 0.5, -18, "dB", "chuintement des gaz brûlants qui sortent du canon"],
    ["gazDuree", "Arme", "Durée des gaz", 0.5, 30, 0.1, 4, "ms", ""],
    ["gazF", "Arme", "Couleur des gaz", 300, 8000, 10, 2200, "Hz", ""],
    ["corps", "Arme", "Coup sourd", -40, 0, 0.5, -16, "dB", "le « boum » grave de la masse de gaz (gros calibres, canons courts)"],
    ["corpsF", "Arme", "Hauteur du coup sourd", 40, 600, 1, 180, "Hz", ""],
    ["corpsDuree", "Arme", "Durée du coup sourd", 1, 40, 0.1, 6, "ms", ""],
    ["phaseNeg", "Arme", "Retour en dépression", 0.3, 20, 0.05, 3, "ms", "la surpression est suivie d'une dépression qui la compense (moins de graves si court)"],
    ["directivite", "Arme", "Directivité", 0, 30, 0.5, 14, "dB", "combien le souffle est plus faible derrière le tireur que devant (mesuré : 10 à 30 dB)"],
    ["cadence", "Arme", "Cadence en rafale", 0, 1200, 10, 0, "coups/min", "0 = coup par coup seulement"],
    ["vitesse", "Balle", "Vitesse de la balle", 200, 1100, 5, 360, "m/s", "au-dessus de 343 m/s la balle claque (onde de choc). 9 mm ≈ 360, 5,56 ≈ 920, 7,62×39 ≈ 715, 7,62×51 ≈ 830"],
    ["diametre", "Balle", "Diamètre", 2, 20, 0.1, 9, "mm", "diamètre d'un projectile (plomb de chasse ≈ 2,5–3,5, chevrotine ≈ 8,4)"],
    ["longueur", "Balle", "Longueur", 2, 40, 0.1, 15, "mm", ""],
    ["projectiles", "Balle", "Nombre de projectiles", 1, 30, 1, 1, "", "plusieurs pour un fusil de chasse (chevrotine : 9)"],
    ["freinage", "Balle", "Portée de freinage", 30, 3000, 10, 600, "m", "distance sur laquelle la balle perd 63 % de sa vitesse (petits plombs : court)"],
    ["meca", "Mécanique", "Mécanique", 0, 3, 1, 1, "", "ce qui bouge après le tir", ["aucune (verrou, pompe)", "pistolet (culasse)", "fusil (emprunt de gaz)", "fusil lourd (piston)"]],
    ["mecaNiv", "Mécanique", "Niveau de la mécanique", 80, 140, 0.5, 118, "dB", "à 1 m"],
    ["mecaCycle", "Mécanique", "Durée du cycle", 5, 120, 0.5, 22, "ms", "aller-retour de la culasse"],
    ["mecaF", "Mécanique", "Hauteur du métal", 800, 9000, 10, 3400, "Hz", ""],
    ["ressort", "Mécanique", "Ressort", -50, 0, 0.5, -30, "dB", "« boing » du ressort récupérateur (fusils type AR)"],
    ["ressortF", "Mécanique", "Hauteur du ressort", 300, 6000, 10, 1500, "Hz", ""],
    ["douille", "Douille", "Douille", 0, 2, 1, 1, "", "", ["aucune", "laiton / acier", "cartouche de chasse (plastique)"]],
    ["douilleNiv", "Douille", "Niveau de la douille", 50, 100, 0.5, 78, "dB", "à 1 m"],
    ["douilleF", "Douille", "Tintement", 2000, 14000, 50, 7500, "Hz", "anneau de la douille : petite douille = aigu"],
    ["sol", "Lieu", "Sol", 0, 4, 1, 1, "", "nature du sol : reflet du souffle et bruit de la douille", ["neige", "herbe", "terre battue", "béton / asphalte", "parquet"]],
    ["lieu", "Lieu", "Lieu", 0, 1, 1, 0, "", "", ["plein air", "intérieur"]],
    ["queue", "Lieu", "Réverbération", -80, -20, 0.5, -52, "dB", "plein air : force du grondement renvoyé par les arbres, le relief, les bâtiments"],
    ["queueDebut", "Lieu", "Distance des obstacles", 2, 200, 0.5, 20, "m", "plein air : distance des premiers obstacles (arbres, talus)"],
    ["queueMontee", "Lieu", "Arrivée de la réverbération", 2, 300, 1, 30, "ms", "plein air : vite = un bloc d'obstacles (talus, lisière) ; lent = obstacles étalés"],
    ["queueGrave", "Lieu", "Graves de la réverbération", 100, 1200, 10, 350, "Hz", "plein air : les obstacles renvoient mal les graves (plus haut = réverbération plus fine)"],
    ["queueT", "Lieu", "Durée de la réverbération", 0.2, 6, 0.05, 1.8, "s", "plein air : forêt ≈ 1,5–2,5 s, vallée ≈ 3–5 s, champ ouvert ≈ 0,5 s"],
    ["queueClarte", "Lieu", "Clarté du lointain", 0, 1, 0.01, 0.4, "", "plus bas = grondement plus sourd"],
    ["echos", "Lieu", "Échos francs", 0, 10, 1, 3, "", "nombre de murs ou de talus qui renvoient un écho net"],
    ["echoNiv", "Lieu", "Force des échos", -40, 0, 0.5, -12, "dB", "coefficient de réflexion : mur ≈ −2, talus ≈ −8, lisière d'arbres ≈ −20"],
    ["echoLoin", "Lieu", "Distance des échos", 5, 400, 1, 40, "m", ""],
    ["portee", "Lieu", "Étendue du lieu", 20, 2000, 5, 150, "m", "au-delà, la réverbération faiblit avec la distance au tireur"],
    ["longueurP", "Lieu", "Pièce : longueur", 2, 60, 0.5, 8, "m", "intérieur"],
    ["largeurP", "Lieu", "Pièce : largeur", 2, 40, 0.5, 5, "m", "intérieur"],
    ["hauteurP", "Lieu", "Pièce : hauteur", 2, 15, 0.1, 2.7, "m", "intérieur"],
    ["absorption", "Lieu", "Pièce : absorption", 0.03, 0.9, 0.01, 0.15, "", "intérieur : béton nu ≈ 0,05, bureau ≈ 0,2, salle meublée ≈ 0,35"],
    ["distance", "Écoute", "Distance du tireur", 0.3, 1500, 0.1, 5, "m", "0,3–1 m : c'est vous qui tirez"],
    ["angle", "Écoute", "Angle", 0, 180, 1, 30, "°", "0 = pile devant le canon, 90 = à côté, 180 = derrière le tireur"],
    ["hauteurArme", "Écoute", "Hauteur de l'arme", 0.1, 3, 0.05, 1.5, "m", ""],
    ["hauteurOreille", "Écoute", "Hauteur de l'oreille", 0.1, 3, 0.05, 1.6, "m", ""],
    ["tireur", "Écoute", "Vue du tireur", 0, 1, 1, 0, "", "1 : l'oreille est collée à l'arme (mécanique et douille tout près)", ["non", "oui"]],
    ["micro", "Enregistrement", "Marge du micro", 120, 175, 0.5, 150, "dB", "au-dessus, le son sature comme un vrai enregistrement (plus bas = plus écrasé)"],
    ["coupeBas", "Enregistrement", "Coupe-bas du micro", 10, 400, 1, 30, "Hz", "filtre des graves de l'enregistreur (vent, grondement)"],
    ["variation", "Enregistrement", "Variation entre tirs", 0, 3, 0.05, 1, "dB", ""],
    ["charge", "Explosion", "Charge", 0.02, 5, 0.01, 0.2, "kg", "équivalent TNT (grenade à main ≈ 0,15–0,25)"],
    ["eclats", "Explosion", "Éclats", 0, 60, 1, 20, "", "éclats supersoniques qui claquent avant le souffle"],
    ["debris", "Explosion", "Retombées", -70, -10, 0.5, -42, "dB", "terre et cailloux qui retombent"],
    ["feu", "Explosion", "Boule de feu", -40, 0, 0.5, -16, "dB", "grondement de la combustion"],
  ];
  const DEFAUT = Object.fromEntries(PARAMS.map(p => [p[0], p[6]]));
  const GROUPES = [...new Set(PARAMS.map(p => p[1]))];
  // résistance au passage de l'air des sols (Pa·s/m²) pour le reflet ; null = sol dur
  const SOLS = [{ nom: "neige", sigma: 2e4 }, { nom: "herbe", sigma: 2e5 }, { nom: "terre battue", sigma: 2e6 }, { nom: "béton", sigma: null }, { nom: "parquet", sigma: null }];

  // ---------- FFT complexe (radix 2) ----------
  const tw = new Map();
  function fft(re, im, inv) {
    const n = re.length; let T = tw.get(n);
    if (!T) { T = [new Float64Array(n / 2), new Float64Array(n / 2)]; for (let k = 0; k < n / 2; k++) { T[0][k] = Math.cos(TAU * k / n); T[1][k] = -Math.sin(TAU * k / n); } tw.set(n, T); }
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    const sg = inv ? -1 : 1;
    for (let len = 2; len <= n; len <<= 1) { const h = len >> 1, st = n / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) {
        const wr = T[0][k * st], wi = sg * T[1][k * st], p = i + k, q = p + h, vr = re[q] * wr - im[q] * wi, vi = re[q] * wi + im[q] * wr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; } }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  const pow2 = n => { let m = 1; while (m < n) m <<= 1; return m; };
  function convoluer(x, h, out, at, gain) {   // out[at + …] += gain · (x * h)
    const N = pow2(x.length + h.length), ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
    ar.set(x); br.set(h); fft(ar, ai); fft(br, bi);
    for (let k = 0; k < N; k++) { const r = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; }
    fft(ar, ai, true); const L = Math.min(x.length + h.length - 1, out.length - at);
    for (let i = 0; i < L; i++) if (at + i >= 0) out[at + i] += ar[i] * gain;
  }

  // convolution d'un son mono par la réponse stéréo du lieu : les deux canaux en une seule FFT (G en réel, D en imaginaire),
  // spectre de la réponse gardé en cache
  function convStereo(x, R, out, at) {
    const L = R.ir[0].length, N = pow2(x.length + L); R.spec = R.spec || {};
    let H = R.spec[N]; if (!H) { const hr = new Float64Array(N), hi = new Float64Array(N); hr.set(R.ir[0]); hi.set(R.ir[1]); fft(hr, hi); H = R.spec[N] = [hr, hi]; }
    const ar = new Float64Array(N), ai = new Float64Array(N); ar.set(x); fft(ar, ai);
    for (let k = 0; k < N; k++) { const r = ar[k] * H[0][k] - ai[k] * H[1][k]; ai[k] = ar[k] * H[1][k] + ai[k] * H[0][k]; ar[k] = r; }
    fft(ar, ai, true); const n = Math.min(x.length + L - 1, out[0].length - at);
    for (let i = 0; i < n; i++) if (at + i >= 0) { out[0][at + i] += ar[i]; out[1][at + i] += ai[i]; }
  }

  // ---------- physique de la propagation ----------
  // absorption de l'air (dB/m) à 20 °C et 70 % d'humidité, d'après ISO 9613-1 (interpolée en log)
  const ABS_F = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 24000], ABS_A = [0.0001, 0.0003, 0.0011, 0.0024, 0.0042, 0.0082, 0.0234, 0.0836, 0.296, 0.62];
  function absAir(f) {
    if (f <= ABS_F[0]) return ABS_A[0] * (f / ABS_F[0]) ** 2;
    for (let i = 1; i < ABS_F.length; i++) if (f <= ABS_F[i]) { const t = Math.log(f / ABS_F[i - 1]) / Math.log(ABS_F[i] / ABS_F[i - 1]); return Math.exp(lerp(Math.log(ABS_A[i - 1]), Math.log(ABS_A[i]), t)); }
    return ABS_A[ABS_A.length - 1] * (f / 24000) ** 2;
  }
  // coefficient de réflexion (onde plane) d'un sol poreux : impédance de Delany et Bazley, convention e^{+iωt}
  function reflet(f, sinPsi, sigma) {
    if (!sigma) return [0.97, 0];
    const X = clamp(1.2 * Math.max(f, 10) / sigma, 1e-4, 2), zr = 1 + 0.0571 * X ** -0.754, zi = -0.087 * X ** -0.732;
    const ar = zr * sinPsi - 1, ai = zi * sinPsi, br = zr * sinPsi + 1, bi = zi * sinPsi, d = br * br + bi * bi;
    return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
  }
  // directivité du souffle (gain en amplitude) : plus marquée dans les aigus ; angle en radians depuis l'axe du canon
  const directivite = (P, phi, f) => db(-P.directivite * (1 - Math.cos(phi)) / 2 * (0.45 + 0.55 * f / (f + 1200)));

  // Un son émis en un point (mesuré à 1 m, x) qui arrive par le chemin direct et par le reflet du sol.
  // Ajoute dans out à partir de l'indice « at » (échantillon d'arrivée du chemin direct), avec la fraction d'échantillon.
  function propager(out, x, at, frac, g) {
    // g : { r, rg, sinPsi, sigma, phi, phig, P, dirige, gain }
    const sr = g.sr, dly = g.rg ? (g.rg - g.r) / C_AIR * sr : 0, GD = Math.ceil(sr * 0.003), N = pow2(x.length + Math.ceil(dly) + 2 * GD + 64), re = new Float64Array(N), im = new Float64Array(N);
    re.set(x, GD); fft(re, im);   // GD : marge avant le signal (le filtre de l'air est symétrique)
    for (let k = 0; k <= N / 2; k++) {
      const f = k * sr / N, w = TAU * k / N;
      // chemin direct
      let gd = g.gain / Math.max(g.r, 0.05) * db(-absAir(f) * g.r); if (g.dirige) gd *= directivite(g.P, g.phi, f);
      let hr = gd * Math.cos(w * frac), hi = -gd * Math.sin(w * frac);
      // reflet sur le sol
      if (g.rg) { let gg = g.gain / g.rg * db(-absAir(f) * g.rg); if (g.dirige) gg *= directivite(g.P, g.phig, f);
        const [Rr, Ri] = reflet(f, g.sinPsi, g.sigma), ph = w * (frac + dly), cr = Math.cos(ph), ci = -Math.sin(ph);
        hr += gg * (Rr * cr - Ri * ci); hi += gg * (Rr * ci + Ri * cr); }
      const a = re[k], b = im[k]; re[k] = a * hr - b * hi; im[k] = a * hi + b * hr;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) { const j = at + i - GD; if (j >= 0 && j < out.length) out[j] += re[i]; }
  }

  // version économique pour les petits sons (mécanique, douille) : 1/r et un passe-bas d'une pôle pour l'air
  function ajouterLoin(out, x, at, r, sr) {
    let fc = 24000; if (r > 5) { fc = 500; while (fc < 24000 && absAir(fc) * r < 3) fc *= 1.05; }
    const a = fc >= 0.45 * sr ? 1 : 1 - Math.exp(-TAU * fc / sr), g = 1 / Math.max(r, 0.05); let y = 0;
    for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); const j = at + i; if (j >= 0 && j < out.length) out[j] += y * g; }
  }

  // ---------- formes d'onde ----------
  // onde de Friedlander p(t) = (1 − t/T)·exp(−β t/T), moyennée sur chaque échantillon (pas de crénelage), début à t0 (s)
  function friedlander(buf, t0, amp, T, beta, sr, tr) {
    const i0 = Math.floor(t0 * sr), len = Math.ceil((T * (6 + 8 / beta)) * sr) + 2, S = 8, ir = tr ? 1 / tr : 0;
    for (let i = Math.max(0, i0); i < Math.min(buf.length, i0 + len); i++) {
      let s = 0; for (let q = 0; q < S; q++) { const t = (i + (q + 0.5) / S) / sr - t0; if (t >= 0) s += (1 - t / T) * Math.exp(-beta * t / T) * (ir ? 1 - Math.exp(-t * ir) : 1); }
      buf[i] += amp * s / S;
    }
  }
  // onde en N : saut +P, descente linéaire jusqu'à −P en T, puis retour à 0 (moyennée sur chaque échantillon)
  function ondeN(buf, t0, P, T, sr) {
    const i0 = Math.floor(t0 * sr), i1 = Math.ceil((t0 + T) * sr) + 1, S = 16;
    for (let i = Math.max(0, i0); i <= Math.min(buf.length - 1, i1); i++) {
      let s = 0; for (let q = 0; q < S; q++) { const t = (i + (q + 0.5) / S) / sr - t0; if (t >= 0 && t <= T) s += 1 - 2 * t / T; }
      buf[i] += P * s / S;
    }
  }
  function biquadBP(x, f, q, sr) {   // passe-bande (RBJ, gain 0 dB au sommet)
    const w = TAU * clamp(f, 10, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0, y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  }
  function passeHaut1(x, f, sr) { const a = Math.exp(-TAU * f / sr); let px = 0, py = 0; for (let i = 0; i < x.length; i++) { const v = a * (py + x[i] - px); px = x[i]; py = v; x[i] = v; } return x; }
  // résonateurs (synthèse modale) excités par e : modes [[f, gain, t60]]
  function modal(dst, e, modes, sr, at) {
    for (const [f, g, t60] of modes) { if (f >= sr * 0.45) continue;
      const rr = Math.exp(-LN1000 / (t60 * sr)), c = 2 * rr * Math.cos(TAU * f / sr), r2 = rr * rr, len = Math.min(dst.length - at, e.length + Math.ceil(t60 * 1.2 * sr));
      let y1 = 0, y2 = 0; const k = g * Math.sin(TAU * f / sr);
      for (let i = 0; i < len; i++) { const y = c * y1 - r2 * y2 + (i < e.length ? e[i] : 0) * k; y2 = y1; y1 = y; dst[at + i] += y; }
    }
  }

  // ---------- souffle de la bouche, à 1 m dans l'axe (Pa) ----------
  function souffle(P, r, rnd, sr) {
    const len = Math.ceil(sr * (0.012 + P.gazDuree * 0.006 + P.corpsDuree * 0.006)), x = new Float64Array(len);
    const A = PREF * db(P.niveau + P.variation * gauss(rnd) * 0.5);
    // la phase positive s'allonge avec la distance (onde de choc faible)
    const T = P.tplus / 1000 * (1 + P.allonge * Math.log10(Math.max(1, r))) * (1 + 0.04 * gauss(rnd)), t0 = (P.avance + 0.3) / 1000;
    const tr = P.montee * 1e-6 * (1 + 0.3 * Math.log10(Math.max(1, r)));   // le front de choc s'adoucit en voyageant
    friedlander(x, t0 - P.avance / 1000, A * db(P.precurseur), T * 0.45, P.beta, sr, tr);
    friedlander(x, t0, A, T, P.beta, sr, tr);
    let t = t0; for (let k = 1; k <= P.cellules; k++) { t += P.cellEsp / 1000 * (0.75 + 0.5 * rnd()); friedlander(x, t, A * db(P.cellNiv) * Math.pow(0.6, k - 1) * (0.8 + 0.4 * rnd()), T * 0.7, P.beta, sr, tr); }
    // gaz : bruit filtré, montée 0,3 ms, décroissance exponentielle
    const ng = Math.min(len - Math.floor(t0 * sr), Math.ceil(P.gazDuree / 1000 * 7 * sr)), nz = new Float64Array(ng);
    for (let i = 0; i < ng; i++) { const tt = i / sr; nz[i] = (rnd() * 2 - 1) * (1 - Math.exp(-tt / 0.0003)) * Math.exp(-tt / (P.gazDuree / 1000)); }
    const gf = biquadBP(nz, P.gazF, 0.8, sr), ga = A * db(P.gaz), i0 = Math.floor(t0 * sr);
    for (let i = 0; i < ng; i++) x[i0 + i] += gf[i] * ga * 1.6;
    // coup sourd : oscillation amortie grave
    const ac = A * db(P.corps), tc = P.corpsDuree / 1000;
    for (let i = i0; i < len; i++) { const tt = (i - i0) / sr; x[i] += ac * Math.sin(TAU * P.corpsF * tt) * (1 - Math.exp(-tt / 0.0004)) * Math.exp(-tt / tc); }
    passeHaut1(x, 1000 / (TAU * P.phaseNeg), sr);   // au loin, la pression rayonnée a une moyenne nulle : la dépression compense
    return { x, t0 };
  }

  // ---------- onde de choc de la balle ----------
  // trajectoire selon +x à la hauteur de l'arme ; l'auditeur en (xl, yl, zl). Renvoie les ondes en N à ajouter.
  function chocs(P, geo, rnd) {
    const out = [], c = C_AIR, d = P.diametre / 1000, l = P.longueur / 1000, lam = P.freinage;
    for (let k = 0; k < P.projectiles; k++) {
      // dispersion des plombs : petit angle aléatoire
      const ay = P.projectiles > 1 ? gauss(rnd) * 0.02 : 0, az = P.projectiles > 1 ? gauss(rnd) * 0.02 : 0, V0 = P.vitesse * (1 + 0.01 * gauss(rnd));
      if (V0 <= c * 1.005) continue;
      const xl = geo.xl, yl = geo.yl - ay * geo.xl, zl = geo.zl - az * geo.xl;
      const b = Math.max(0.25, Math.hypot(yl, zl - geo.za));
      if (xl <= 0) continue;
      const V = x => V0 * Math.exp(-x / lam);
      let xe = xl; for (let it = 0; it < 30; it++) { const M = V(Math.max(0, xe)) / c; if (M <= 1) { xe = -1; break; } xe = xl - b * Math.sqrt(M * M - 1); if (xe < 0) break; }
      if (xe < 0) continue;
      const M = V(xe) / c; if (M <= 1.005) continue;
      const tb = lam / V0 * (Math.exp(xe / lam) - 1), dist = Math.hypot(xl - xe, b), ta = tb + dist / c;
      const m2 = M * M - 1, Pm = 0.53 * P0 * Math.pow(m2, 1 / 8) * d / (Math.pow(b, 3 / 4) * Math.pow(l, 1 / 4)), T = 1.82 * M * Math.pow(b, 1 / 4) * d / (c * Math.pow(m2, 3 / 8) * Math.pow(l, 1 / 4));
      out.push({ t: ta, P: Pm, T, dist, b, xe });
    }
    return out;
  }

  // ---------- mécanique (culasse qui recule et revient, ressort) : Pa à 1 m ----------
  function mecanique(P, rnd, sr) {
    if (P.meca < 1) return null;
    const dur = P.mecaCycle / 1000, len = Math.ceil(sr * (dur * 2 + 0.25)), x = new Float64Array(len), A = PREF * db(P.mecaNiv);
    const lourd = P.meca >= 3, fu = P.meca >= 2;
    // chocs : déverrouillage, butée arrière, retour et verrouillage (instants en fraction du cycle)
    const chocs_ = lourd ? [[0.08, 0.45], [0.5, 1], [1, 0.9], [1.08, 0.5]] : fu ? [[0.06, 0.35], [0.5, 0.8], [1, 1], [1.05, 0.4]] : [[0.1, 0.4], [0.45, 1], [1, 0.85]];
    const r = rng(Math.floor(P.mecaF * 7 + P.meca * 131));   // les modes de l'arme sont fixes (même arme), seuls les chocs varient
    const modes = []; for (let m = 0; m < 9; m++) modes.push([P.mecaF * Math.pow(1.42, m - 2) * (0.85 + 0.3 * r()), (0.4 + r()) / (1 + m * 0.15), lerp(0.012, 0.06, r()) * (lourd ? 1.4 : 1)]);
    for (const [ft, g] of chocs_) {
      const at = Math.floor(sr * (0.0015 + dur * ft * (1 + 0.04 * gauss(rnd)))), ne = Math.ceil(sr * 0.0004), e = new Float64Array(ne);
      for (let i = 0; i < ne; i++) e[i] = (rnd() * 2 - 1) * Math.sin(Math.PI * i / ne);
      const tmp = new Float64Array(len); modal(tmp, e, modes, sr, at);
      // le choc lui-même : claquement large bande
      for (let i = 0; i < ne; i++) if (at + i < len) tmp[at + i] += e[i] * 3;
      const gg = A * g * (0.85 + 0.3 * rnd()); for (let i = 0; i < len; i++) x[i] += tmp[i] * gg * 0.12;
    }
    if (P.ressort > -49 && fu) {   // ressort récupérateur : plusieurs spires qui vibrent, battement
      const at = Math.floor(sr * (0.0015 + dur * 0.5)), aR = A * db(P.ressort);
      for (let i = at; i < len; i++) { const t = (i - at) / sr; x[i] += aR * (Math.sin(TAU * P.ressortF * t) + 0.6 * Math.sin(TAU * P.ressortF * 1.013 * t + 1)) * Math.exp(-t / 0.06) * (1 - Math.exp(-t / 0.001)); }
    }
    passeHaut1(x, 400, sr);
    return x;
  }

  // ---------- douille qui tombe et rebondit : Pa à 1 m ----------
  function douille(P, rnd, sr) {
    if (P.douille < 1) return null;
    const sol = Math.round(P.sol), dur = sol === 3 ? 1 : sol === 4 ? 0.7 : sol === 2 ? 0.35 : 0.12;   // le sol étouffe plus ou moins
    const plast = P.douille >= 2, len = Math.ceil(sr * 1.6), x = new Float64Array(len), A = PREF * db(P.douilleNiv + gauss(rnd) * 1.5);
    let t = 0.42 + 0.12 * rnd(), dt = 0.07 + 0.05 * rnd(), g = 1;
    const fr = P.douilleF * (0.97 + 0.06 * rnd());
    const modes = plast ? [[1300 * (0.9 + 0.2 * rnd()), 1, 0.012], [2900, 0.5, 0.008], [5200, 0.25, 0.005]]
      : [[fr, 1, 0.12 * dur + 0.01], [fr * 2.83, 0.5, 0.07 * dur + 0.006], [fr * 0.43, 0.25, 0.05 * dur + 0.005], [fr * 1.52, 0.35, 0.08 * dur + 0.006]];
    for (let k = 0; k < 6 && t < 1.5; k++) {
      const at = Math.floor(t * sr), ne = Math.ceil(sr * 0.00015), e = new Float64Array(ne);
      for (let i = 0; i < ne; i++) e[i] = rnd() * 2 - 1;
      const tmp = new Float64Array(len); modal(tmp, e, modes.map(([f, a, t60]) => [f * (1 + 0.01 * gauss(rnd)), a, t60]), sr, at);
      // petit choc sur le sol (plus sourd sur la terre, plus net sur le béton)
      const ns = Math.ceil(sr * (sol >= 3 ? 0.0006 : 0.002));
      for (let i = 0; i < ns && at + i < len; i++) tmp[at + i] += (rnd() * 2 - 1) * Math.exp(-i / (ns / 3)) * (sol >= 3 ? 1.2 : 0.6);
      const gg = A * g * dur ** 0.5; for (let i = 0; i < len; i++) x[i] += tmp[i] * gg * 0.25;
      t += dt; dt *= 0.45 + 0.15 * rnd(); g *= 0.45 + 0.2 * rnd();
    }
    passeHaut1(x, 300, sr);
    return x;
  }

  // ---------- réponse du lieu (plein air ou pièce), stéréo, pour un son émis par le tireur ----------
  const irCache = new Map();
  function lieuIR(P, r, sr, variante) {
    const key = [P.lieu, P.queue, P.queueDebut, P.queueMontee, P.queueGrave, P.queueT, P.queueClarte, P.echos, P.echoNiv, P.echoLoin, P.portee, P.longueurP, P.largeurP, P.hauteurP, P.absorption, P.sol, Math.round(r * 10), sr, variante].join();
    let R = irCache.get(key); if (R) return R;
    R = P.lieu >= 1 ? pieceIR(P, r, sr, variante) : pleinAirIR(P, r, sr, variante);
    if (irCache.size > 24) irCache.delete(irCache.keys().next().value);
    irCache.set(key, R); return R;
  }
  function pleinAirIR(P, r, sr, v) {
    // queue diffuse : diffusion par les arbres et le relief. Elle commence après l'aller-retour vers les obstacles,
    // monte, puis décroît en queueT ; les aigus s'éteignent plus vite (absorption de l'air sur le long trajet).
    const T = P.queueT, d0 = Math.max(0.004, (2 * P.queueDebut - Math.min(r, P.queueDebut)) / C_AIR), len = Math.ceil(sr * Math.min(LIMITE_IR, d0 + T * 1.1 + 0.1));
    const gEnv = db(P.queue) / Math.sqrt(1 + (r / P.portee) ** 2), out = [];
    for (let ch = 0; ch < 2; ch++) {
      const rnd = rng(9001 + v * 17 + ch * 5), h = new Float64Array(len);
      // les arbres et le relief diffusent mal les graves (obstacles petits devant la longueur d'onde) : passe-haut ;
      // l'air éteint les aigus au fil du trajet : passe-bas qui se referme avec le temps
      let l1 = 0, l2 = 0, hx = 0, hy = 0, hx2 = 0, hy2 = 0;
      const fc0 = lerp(2000, 16000, P.queueClarte), fmin = lerp(600, 6000, P.queueClarte), ah = Math.exp(-TAU * P.queueGrave / sr);
      for (let i = Math.floor(d0 * sr); i < len; i++) {
        const t = i / sr - d0, fc = fmin + fc0 * Math.exp(-t / (0.1 + 1.4 * P.queueClarte)), a = 1 - Math.exp(-TAU * fc / sr);
        // arrivées éparses : densité qui croît avec le temps (de plus en plus d'obstacles atteints), amplitudes très inégales
        const dens = Math.min(1, 1500 * (0.3 + t) / sr), w = rnd() < dens ? (rnd() < 0.5 ? -1 : 1) * Math.exp(0.7 * gauss(rnd)) / Math.sqrt(dens) : 0;
        const hp1 = ah * (hy + w - hx); hx = w; hy = hp1; const hp = ah * (hy2 + hp1 - hx2); hx2 = hp1; hy2 = hp;
        l1 += a * (hp - l1); l2 += a * (l1 - l2);
        const env = (1 - Math.exp(-t / (P.queueMontee / 1000))) * Math.exp(-LN1000 * t / T);
        h[i] = l2 * env;
      }
      // énergie : gEnv² par seconde de 1/T (normalisation sur l'énergie, indépendante de la couleur)
      let e = 0; for (let i = 0; i < len; i++) e += h[i] * h[i]; const k = gEnv * Math.sqrt(sr * 0.02 / (e || 1)) ;
      for (let i = 0; i < len; i++) h[i] *= k;
      // échos francs : murs, talus. Délai d'aller-retour, adoucis par le trajet
      // chaque obstacle est à la distance D du tireur, dans une direction tirée au hasard (fixe pour un lieu) ;
      // trajet = tireur → obstacle → auditeur, amplitude = coefficient de réflexion / trajet
      for (let n = 0; n < P.echos; n++) {
        const q = rng(4242 + n * 31), D = P.echoLoin * (0.6 + 0.9 * q()), th = TAU * q(), rr = Math.max(r, 0.3);
        const chemin = D + Math.sqrt(D * D + rr * rr - 2 * D * rr * Math.cos(th)), td = Math.max(0.002, (chemin - rr) / C_AIR) + ch * 0.0004 * (rnd() - 0.5);
        const at = Math.floor(td * sr); if (at >= len - 64) continue;
        const g = db(P.echoNiv) / chemin * (0.6 + 0.4 * q()), w = Math.max(2, Math.round(sr * chemin / C_AIR * 2e-5 + 2));
        for (let k2 = 0; k2 < w; k2++) h[at + k2] += g * (1 - Math.cos(TAU * (k2 + 0.5) / w)) / w;
      }
      out.push(Float32Array.from(h));
    }
    return { ir: out, T };
  }
  function pieceIR(P, r, sr, v) {
    const Lx = P.longueurP, Ly = P.largeurP, Lz = P.hauteurP, al = clamp(P.absorption, 0.02, 0.95);
    const V = Lx * Ly * Lz, S = 2 * (Lx * Ly + Lx * Lz + Ly * Lz), T = clamp(0.161 * V / (-S * Math.log(1 - al)), 0.05, 8);
    const Rc = S * al / (1 - al);
    const hs = clamp(P.hauteurArme, 0.1, Lz - 0.1), hl = clamp(P.hauteurOreille, 0.1, Lz - 0.1), ang = P.angle * Math.PI / 180;
    const rr = Math.min(r, Math.hypot(Lx, Ly) * 0.8), src = [Lx * 0.3, Ly * 0.5, hs];
    const rec = [clamp(src[0] + rr * Math.cos(ang), 0.2, Lx - 0.2), clamp(src[1] + rr * Math.sin(ang), 0.2, Ly - 0.2), hl];
    const dist = Math.max(0.3, Math.hypot(rec[0] - src[0], rec[1] - src[1], rec[2] - src[2]));
    const len = Math.floor(sr * Math.min(8, T * 1.3 + 0.1)), refl = Math.sqrt(1 - al), out = [], NI = 5;
    for (let ch = 0; ch < 2; ch++) {
      const h = new Float64Array(len), rnd = rng(555 + v * 13 + ch * 7), E = [rec[0], rec[1] + (ch ? 0.09 : -0.09), rec[2]]; let eImg = 0, tFirst = 1;
      for (let i = -NI; i <= NI; i++) for (let px = 0; px < 2; px++) for (let j = -NI; j <= NI; j++) for (let py = 0; py < 2; py++) for (let q = -3; q <= 3; q++) for (let pz = 0; pz < 2; pz++) {
        const nx = Math.abs(2 * i - px), ny = Math.abs(2 * j - py), nz = Math.abs(2 * q - pz), ord = nx + ny + nz;
        if (ord === 0 || ord > 10) continue;
        if (nx === 0 && ny === 0 && nz === 1 && pz === 1 && q === 0) continue;   // reflet du sol : déjà dans le son direct
        const X = (1 - 2 * px) * src[0] + 2 * i * Lx, Y = (1 - 2 * py) * src[1] + 2 * j * Ly, Z = (1 - 2 * pz) * src[2] + 2 * q * Lz;
        const d = Math.hypot(X - E[0], Y - E[1], Z - E[2]), t = (d - dist) / C_AIR; if (t <= 0 || t * sr >= len - 64) continue;
        const g = Math.pow(refl * 0.9, ord) / d * (1 + 0.2 * (rnd() * 2 - 1)); tFirst = Math.min(tFirst, t);
        const w = Math.max(1, Math.round(sr / (9000 * Math.pow(0.8, ord)) * 0.5)), i0 = Math.round((t + (ord > 1 ? (rnd() - 0.5) * 0.0005 * ord : 0)) * sr);
        for (let k = 0; k < w; k++) h[i0 + k] += g * (1 - Math.cos(TAU * (k + 0.5) / w)) / w;
        eImg += g * g;
      }
      // queue diffuse : énergie de la théorie de la réverbération (4/Rc relatif à 1/(4π) à 1 m)
      const target = 16 * Math.PI / Rc / (4 * Math.PI), tail = new Float64Array(len); let lp = 0, eT = 0, tS = tFirst + 0.003;
      for (let i = 0; i < len; i++) { const t = i / sr; if (t < tS) continue;
        const fc = 8000 * Math.pow(0.25, Math.min(1.5, (t - tS) / T)), a = 1 - Math.exp(-TAU * fc / sr); lp += a * ((rnd() * 2 - 1) - lp);
        tail[i] = lp * Math.exp(-LN1000 * (t - tS) / T) * Math.min(1, (t - tS) / Math.max(0.005, 0.04 * Math.cbrt(V / 50))) * Math.sqrt(8000 / fc); eT += tail[i] * tail[i]; }
      const gT = Math.sqrt(Math.max(target * 4 * Math.PI - eImg * 0.5, target * 4 * Math.PI * 0.25) / (eT || 1)) * 0.5;
      for (let i = 0; i < len; i++) h[i] += tail[i] * gT;
      out.push(Float32Array.from(h));
    }
    return { ir: out, T, dist };
  }

  // ---------- géométrie ----------
  function geometrie(P) {
    const tir = P.tireur >= 0.5, r = Math.max(0.2, P.distance), phi = clamp(P.angle, 0, 180) * Math.PI / 180;
    const za = P.hauteurArme, zl = P.hauteurOreille, rh = Math.sqrt(Math.max(0.01, r * r - (zl - za) ** 2));
    const xl = rh * Math.cos(phi), yl = rh * Math.sin(phi);
    const rg = Math.hypot(rh, za + zl), sinPsi = (za + zl) / rg;
    return { r, rg, sinPsi, phi, phig: phi, xl, yl, zl, za, tir };
  }

  // saturation douce (le micro ou l'enregistreur qui sature, comme dans les vrais enregistrements)
  function sature(x, k) { for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > k) x[i] = Math.sign(x[i]) * (k + (1 - k) * Math.tanh((a - k) / (1 - k))); } return x; }

  // échelle du micro, coupe-bas (2e ordre), saturation du son direct
  function hp2(x, f, sr) {
    const w = Math.tan(Math.PI * f / sr), q = Math.SQRT1_2, nn = 1 / (1 + w / q + w * w), a1 = 2 * (w * w - 1) * nn, a2 = (1 - w / q + w * w) * nn;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = nn * (x[i] - 2 * x1 + x2) - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; x[i] = v; } return x;
  }
  function finir(sec, env, Pmic, P, sr, info) {
    const k = 1 / Pmic, ech = x => { const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = x[i] * k; return y; };
    const out = ech(sec), eL = ech(env[0]), eR = ech(env[1]);
    hp2(out, P.coupeBas, sr); hp2(eL, P.coupeBas, sr); hp2(eR, P.coupeBas, sr); sature(out, 0.8);
    return Object.assign({ sec: out, env: [eL, eR], sr }, info);
  }

  // ---------- un tir ----------
  // renvoie { sec: Float32Array (son direct, mono), env: [L, R] (lieu), retard: s (temps de vol jusqu'au 1er son) }
  // échelle : 1,0 = la marge du micro (P.micro dB SPL)
  function tir(Pin, seed, o) {
    o = o || {}; const P = Object.assign({}, DEFAUT, Pin), sr = o.sr || 48000, rnd = rng((seed >>> 0) * 2654435761 + 1);
    if (P.type >= 0.5) return explosion(P, seed, o);
    const G = geometrie(P), sigma = SOLS[Math.round(clamp(P.sol, 0, 4))].sigma, Pmic = PREF * db(P.micro);
    // instants d'arrivée (s, depuis le départ du coup)
    const S = souffle(P, G.r, rnd, sr), ch = chocs(P, G, rnd);
    const tB = G.r / C_AIR, t1 = Math.min(tB, ...ch.map(c => c.t)), pre = 0.002;
    const meca = mecanique(P, rnd, sr), dou = douille(P, rnd, sr);
    const len = Math.ceil(sr * (tB - t1 + pre + 0.03 + (meca ? meca.length / sr : 0) + (dou ? 1.6 : 0.1)));
    const sec = new Float64Array(len), base = t1 - pre;
    // souffle : direct + sol, directivité
    { const at = (tB - base) * sr - S.t0 * sr, i = Math.floor(at);
      propager(sec, S.x, i, at - i, { sr, r: G.r, rg: G.rg, sinPsi: G.sinPsi, sigma, phi: G.phi, phig: G.phig, P, dirige: true, gain: 1 }); }
    // ondes en N (chaque projectile) : elles portent déjà leur amplitude au point d'écoute ; reflet du sol approché
    for (const c of ch) {
      const n = new Float64Array(Math.ceil(sr * (c.T + 0.002)) + 4); ondeN(n, 0.0005, c.P * c.dist, c.T, sr);
      const at = (c.t - base - 0.0005) * sr, i = Math.floor(at);
      const hb = G.za + G.zl, rg = Math.hypot(c.dist, hb), sp = hb / rg;
      propager(sec, n, i, at - i, { sr, r: c.dist, rg, sinPsi: sp, sigma, phi: 0, P, dirige: false, gain: 1 });
    }
    // mécanique et douille : tout près pour le tireur, sinon depuis la position du tireur
    const rm = G.tir ? 0.35 : G.r, rd = G.tir ? 1.4 : Math.hypot(G.r, 1);
    if (meca) ajouterLoin(sec, meca, Math.round((rm / C_AIR - base) * sr), rm, sr);
    if (dou) ajouterLoin(sec, dou, Math.round((rd / C_AIR - base) * sr), rd, sr);
    // lieu : la source (souffle moyen sur toutes les directions) passe par la réponse du lieu
    const R = lieuIR(P, G.r, sr, seed % 4), elen = Math.ceil(sr * (tB - base)) + R.ir[0].length + S.x.length, env = [new Float64Array(elen), new Float64Array(elen)];
    const xm = new Float64Array(S.x.length + (meca && G.tir ? meca.length : 0)); propager(xm, S.x, 0, 0, { sr, r: 1, rg: 0, P, dirige: true, phi: Math.PI / 2, gain: 1 });
    if (meca && G.tir) for (let i = 0; i < meca.length; i++) xm[i + Math.floor(S.t0 * sr)] += meca[i] / 0.35;
    convStereo(xm, R, env, Math.floor((tB - base) * sr) - Math.floor(S.t0 * sr));
    // échelle du micro + saturation (son direct)
    return finir(sec, env, Pmic, P, sr, { retard: base, chocs: ch.length });
  }

  // ---------- explosion (grenade) ----------
  // Kinney et Graham (1985) : surpression et durée de la phase positive selon la distance réduite Z = R / W^(1/3)
  function kinney(R, W) {
    const Z = R / Math.cbrt(W);
    const ps = 808 * (1 + (Z / 4.5) ** 2) / Math.sqrt((1 + (Z / 0.048) ** 2) * (1 + (Z / 0.32) ** 2) * (1 + (Z / 1.35) ** 2));
    const td = 980 * (1 + (Z / 0.54) ** 10) / ((1 + (Z / 0.02) ** 3) * (1 + (Z / 0.74) ** 6) * Math.sqrt(1 + (Z / 6.9) ** 2)) * Math.cbrt(W);
    return { ps: ps * P0, td: td / 1000, Z };
  }
  function explosion(P, seed, o) {
    const sr = o.sr || 48000, rnd = rng((seed >>> 0) * 2654435761 + 7), Pmic = PREF * db(P.micro);
    const r = Math.max(1, P.distance), W = P.charge * 1.8;   // posée au sol : l'onde est renvoyée vers le haut (≈ ×1,8)
    const kg = kinney(r, W), tB = r / C_AIR * (kg.Z < 3 ? 0.8 : 1);   // très près, le front va plus vite que le son
    // éclats : petits projectiles très rapides, freinés vite ; ceux qui passent près claquent AVANT le souffle
    const fr = [];
    for (let k = 0; k < P.eclats; k++) {
      const V0 = 1300 + 400 * rnd(), lam = 25 + 30 * rnd(), d = 0.003 + 0.003 * rnd(), b = Math.max(0.5, r * Math.sqrt(rnd()) * 0.6 + 0.3 * rnd());
      const xl = Math.sqrt(Math.max(0, r * r - b * b)); if (xl <= 0) continue;
      let xe = xl; const V = x => V0 * Math.exp(-x / lam); let ok = true;
      for (let it = 0; it < 30; it++) { const M = V(Math.max(0, xe)) / C_AIR; if (M <= 1.02) { ok = false; break; } xe = xl - b * Math.sqrt(M * M - 1); if (xe < 0) { ok = false; break; } }
      if (!ok) continue; const M = V(xe) / C_AIR; if (M <= 1.02) continue;
      const tb = lam / V0 * (Math.exp(xe / lam) - 1), dist = Math.hypot(xl - xe, b), m2 = M * M - 1;
      const Pm = 0.53 * P0 * m2 ** 0.125 * d / (b ** 0.75 * d ** 0.25) * 0.6, T = 1.82 * M * b ** 0.25 * d / (C_AIR * m2 ** 0.375 * d ** 0.25);
      fr.push({ ta: tb + dist / C_AIR, dist, Pm, T });
    }
    const pre = 0.002 + Math.max(0, ...fr.map(f => tB - f.ta)), len = Math.ceil(sr * (pre + 2.2)), sec = new Float64Array(len);
    // le souffle à la distance r (déjà non linéaire) : on le propage seulement sur l'absorption de l'air
    const xs = new Float64Array(Math.ceil(sr * (kg.td * 12 + 0.25)));
    const ps = kg.ps * db(P.variation * gauss(rnd) * 0.5);
    friedlander(xs, 0.0003, ps * r, kg.td, P.beta, sr);
    // boule de feu : grondement de combustion, grave, ~50–150 ms
    const nf = Math.ceil(sr * 0.25), nz = new Float64Array(nf), tf = 0.03 + 0.05 * Math.cbrt(P.charge / 0.2);
    for (let i = 0; i < nf; i++) { const t = i / sr; nz[i] = (rnd() * 2 - 1) * (1 - Math.exp(-t / 0.004)) * Math.exp(-t / tf); }
    let lp = 0; for (let i = 0; i < nf; i++) { lp += 0.06 * (nz[i] - lp); xs[i] += lp * ps * r * db(P.feu) * 3; }
    // coup sourd dans le sol
    for (let i = 0; i < xs.length; i++) { const t = i / sr; xs[i] += ps * r * db(P.corps) * Math.sin(TAU * P.corpsF * 0.3 * t) * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.03); }
    const za = 0.2, zl = P.hauteurOreille, rg = Math.hypot(r, za + zl), sigma = SOLS[Math.round(P.sol)].sigma;
    { const at = pre * sr; propager(sec, xs, Math.floor(at), at - Math.floor(at), { sr, r, rg, sinPsi: (za + zl) / rg, sigma, P, dirige: false, gain: 1 }); }
    for (const f of fr) {
      const n = new Float64Array(Math.ceil(sr * (f.T + 0.002)) + 4); ondeN(n, 0.0005, f.Pm * f.dist, f.T, sr);
      const at = (pre + f.ta - tB) * sr; propager(sec, n, Math.floor(at), at - Math.floor(at), { sr, r: f.dist, rg: 0, P, dirige: false, gain: 1 });
    }
    // retombées : terre et cailloux, de 0,2 à 1,8 s après le souffle
    const nd = Math.round(60 * Math.cbrt(P.charge / 0.2) * (r < 60 ? 1 : 60 / r)), gd = ps * r * db(P.debris) / Math.max(1, r / 10);
    for (let k = 0; k < nd; k++) {
      const t = 0.2 + 1.6 * Math.pow(rnd(), 0.8), at = Math.floor((pre + t) * sr), ng = Math.ceil(sr * (0.001 + 0.004 * rnd())), f = 600 + 3500 * rnd();
      const e = new Float64Array(ng); for (let i = 0; i < ng; i++) e[i] = (rnd() * 2 - 1) * Math.exp(-i / (ng / 4));
      const y = biquadBP(e, f, 1.2, sr), g = gd * (0.3 + rnd()) * (1 - (t - 0.2) / 2);
      for (let i = 0; i < ng && at + i < len; i++) sec[at + i] += y[i] * g / Math.max(1, r);
    }
    // lieu : grondement (beaucoup de graves), excité par le souffle « acoustique » (ramené à 1 m depuis 30 m, où l'onde est devenue linéaire)
    const R = lieuIR(Object.assign({}, P, { queueT: P.queueT * 1.3, queueClarte: P.queueClarte * 0.6 }), r, sr, seed % 4);
    const elen = len + R.ir[0].length, env = [new Float64Array(elen), new Float64Array(elen)];
    const k30 = kinney(30, W), src = new Float64Array(xs.length); friedlander(src, 0.0003, k30.ps * 30, k30.td, P.beta, sr);
    convStereo(src, R, env, Math.floor(pre * sr));
    return finir(sec, env, Pmic, P, sr, { retard: tB - pre, chocs: fr.length });
  }

  // ---------- action manuelle (pompe, culasse), clic à vide ----------
  function action(Pin, quoi, seed, o) {
    o = o || {}; const P = Object.assign({}, DEFAUT, Pin), sr = o.sr || 48000, rnd = rng((seed >>> 0) * 2654435761 + 3);
    const A = PREF * db(P.mecaNiv - 22), len = Math.ceil(sr * 1.0), x = new Float64Array(len);
    const r = rng(Math.floor(P.mecaF * 7 + 99)), modes = []; for (let m = 0; m < 18; m++) modes.push([P.mecaF * 0.55 * Math.pow(1.22, m) * (0.9 + 0.2 * r()), (0.6 + 0.4 * r()) / (1 + m * 0.08) * 0.6, lerp(0.02, 0.1, r())]);
    const choc = (t, g, larg) => { const at = Math.floor(t * sr), ne = Math.ceil(sr * (larg || 0.0004)), e = new Float64Array(ne);
      for (let i = 0; i < ne; i++) e[i] = (rnd() * 2 - 1) * Math.sin(Math.PI * i / ne);
      const tmp = new Float64Array(len); modal(tmp, e, modes, sr, at); for (let i = 0; i < ne; i++) if (at + i < len) tmp[at + i] += e[i] * 3;
      for (let i = 0; i < len; i++) x[i] += tmp[i] * A * g * 0.12; };
    const frotte = (t, d, g, f) => { const at = Math.floor(t * sr), n = Math.ceil(d * sr), e = new Float64Array(n);
      // frottement : bruit large bande, granuleux (la pièce glisse par à-coups)
      for (let i = 0; i < n; i++) e[i] = (rnd() * 2 - 1) * Math.sin(Math.PI * i / n) ** 0.5 * (0.4 + 0.6 * (rnd() < 0.3 ? 1 : 0.3)); const y = biquadBP(e, f, 0.45, sr);
      for (let i = 0; i < n && at + i < len; i++) x[at + i] += y[i] * A * g * 0.5; };
    const j = () => 1 + 0.05 * gauss(rnd);
    if (quoi === "pompe") { const t1 = 0.03, t2 = t1 + 0.11 * j(), t3 = t2 + 0.13 * j(), t4 = t3 + 0.1 * j();
      choc(t1, 0.5); frotte(t1, t2 - t1, 0.25, 2500); choc(t2, 1, 0.0007); frotte(t3, t4 - t3, 0.2, 2200); choc(t4, 1.1, 0.0006); choc(t4 + 0.012, 0.4); }
    else if (quoi === "culasse") { const t1 = 0.03, t2 = t1 + 0.09 * j(), t3 = t2 + 0.25 * j();
      choc(t1, 0.4); frotte(t1, t2 - t1, 0.18, 3200); choc(t2, 0.7); choc(t3, 1.2, 0.0005); choc(t3 + 0.008, 0.5); }
    else if (quoi === "verrou") { const t1 = 0.03, t2 = t1 + 0.12 * j(), t3 = t2 + 0.18 * j(), t4 = t3 + 0.1 * j();
      choc(t1, 0.5); frotte(t1, t2 - t1, 0.15, 2600); choc(t2, 0.8); frotte(t3 - 0.1, 0.1, 0.15, 2600); choc(t3, 0.9); choc(t4, 0.6); }
    else { choc(0.02, 0.5, 0.0002); }   // clic à vide
    passeHaut1(x, 300, sr);
    // niveau « de jeu » : en vrai une pompe est ≈ 60 dB plus faible que le coup de feu, inaudible dans un mixage. Comme dans
    // les jeux, on la règle pour qu'elle culmine vers −14 dB de la pleine échelle tout près (0,4 m), puis 1/distance.
    let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
    const d = Math.max(0.3, P.tireur >= 0.5 ? 0.4 : P.distance), k = db(quoi === "clic" ? -26 : quoi === "pompe" ? -12 : -14) / (pk || 1) * 0.4 / d;
    return Float32Array.from(x, v => v * k);
  }

  // la même chose avec la réverbération du lieu : { sec, env: [G, D] } comme tir()
  function actionLieu(Pin, quoi, seed, o) {
    o = o || {}; const P = Object.assign({}, DEFAUT, Pin), sr = o.sr || 48000, y = action(P, quoi, seed, o);
    const d = Math.max(0.3, P.tireur >= 0.5 ? 0.4 : P.distance), R = lieuIR(P, d, sr, seed % 4), x = Float64Array.from(y, v => v * d);
    const env = [new Float64Array(y.length + R.ir[0].length), new Float64Array(y.length + R.ir[0].length)]; convStereo(x, R, env, 0);
    return { sec: y, env: env.map(e => Float32Array.from(e)), retard: 0, sr };
  }

  // ---------- rendu « enregistré » mono (direct + lieu), pour l'écoute et la calibration ----------
  function rendre(P, seed, o) {
    const T = tir(P, seed, o), n = Math.max(T.sec.length, T.env[0].length), y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = (i < T.sec.length ? T.sec[i] : 0) + 0.5 * ((i < T.env[0].length ? T.env[0][i] : 0) + (i < T.env[1].length ? T.env[1][i] : 0));
    return y;
  }
  function preset(nom) { const p = PRESETS[nom]; if (!p) throw new Error("réglage inconnu : " + nom); return Object.assign({}, DEFAUT, p); }
  // fiche physique d'un réglage : nombre de Mach, durée de l'onde en N à 1 m, etc.
  function fiche(Pin) {
    const P = Object.assign({}, DEFAUT, Pin), M = P.vitesse / C_AIR, m2 = M * M - 1, d = P.diametre / 1000, l = P.longueur / 1000;
    const nT = m2 > 0 ? 1.82 * M * d / (C_AIR * m2 ** 0.375 * l ** 0.25) * 1e6 : 0, nP = m2 > 0 ? 0.53 * P0 * m2 ** 0.125 * d / l ** 0.25 : 0;
    const G = geometrie(P), ch = P.type >= 0.5 ? [] : chocs(P, G, rng(1));
    return { mach: +M.toFixed(2), angleMach: m2 > 0 ? +(Math.asin(1 / M) * 180 / Math.PI).toFixed(1) : null, ondeN_us_1m: Math.round(nT), ondeN_dB_1m: nP ? +(20 * Math.log10(nP / PREF)).toFixed(1) : null,
      claque: ch.length > 0, avanceClaqueMs: ch.length ? +((G.r / C_AIR - ch[0].t) * 1000).toFixed(1) : null, kinney: P.type >= 0.5 ? kinney(Math.max(1, P.distance), P.charge * 1.8) : null };
  }

  // ---------- lieux tout prêts (réglages du groupe « Lieu ») ----------
  const LIEUX = {
    "Champ ouvert": { lieu: 0, sol: 1, queue: -82, queueDebut: 90, queueT: 0.7, queueClarte: 0.3, echos: 0, echoNiv: -20, echoLoin: 200, portee: 300 },
    "Forêt": { lieu: 0, sol: 1, queue: -64, queueDebut: 8, queueT: 2.2, queueClarte: 0.45, echos: 0, echoNiv: -20, echoLoin: 30, portee: 120 },
    "Village / rue": { lieu: 0, sol: 3, queue: -66, queueDebut: 9, queueT: 1.5, queueClarte: 0.6, echos: 7, echoNiv: -4, echoLoin: 14, portee: 80 },
    "Vallée de montagne": { lieu: 0, sol: 2, queue: -70, queueDebut: 150, queueT: 4.5, queueClarte: 0.25, echos: 3, echoNiv: -5, echoLoin: 450, portee: 1500 },
    "Neige": { lieu: 0, sol: 0, queue: -78, queueDebut: 15, queueT: 1.0, queueClarte: 0.2, echos: 0, echoNiv: -20, echoLoin: 40, portee: 150 },
    "Intérieur — pièce": { lieu: 1, sol: 4, longueurP: 5, largeurP: 4, hauteurP: 2.6, absorption: 0.22 },
    "Intérieur — couloir": { lieu: 1, sol: 3, longueurP: 24, largeurP: 2.2, hauteurP: 2.6, absorption: 0.1 },
    "Intérieur — entrepôt": { lieu: 1, sol: 3, longueurP: 40, largeurP: 25, hauteurP: 9, absorption: 0.08 },
    "Intérieur — bunker en béton": { lieu: 1, sol: 3, longueurP: 10, largeurP: 6, hauteurP: 3, absorption: 0.04 },
  };
  let PRESETS = {}, CALES = {}, FIDELITE = {};
  // <presets> (écrit par presets.py à partir des calibrations)
  PRESETS = {
 "Pistolet 9 mm": {
  "niveau": 157,
  "tplus": 0.6011,
  "beta": 2.3296,
  "allonge": 0.8215,
  "precurseur": -6.0776,
  "avance": 1.4003,
  "cellules": 0,
  "cellNiv": -21.2059,
  "cellEsp": 0.6862,
  "gaz": -26.7477,
  "gazDuree": 6.937,
  "gazF": 2449,
  "corps": -27.7147,
  "corpsF": 593,
  "corpsDuree": 1,
  "phaseNeg": 0.3,
  "montee": 41,
  "directivite": 15,
  "vitesse": 360,
  "diametre": 9.0,
  "longueur": 15.5,
  "projectiles": 1,
  "freinage": 575,
  "meca": 1,
  "mecaNiv": 98.5541,
  "mecaCycle": 40,
  "mecaF": 2063,
  "ressort": -50,
  "douille": 1,
  "douilleNiv": 76,
  "douilleF": 6000,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Fusil d'assaut 5,56": {
  "beta": 3.915,
  "allonge": 0.9612,
  "precurseur": -7.438,
  "avance": 1.5,
  "cellules": 0,
  "cellNiv": -9.189,
  "cellEsp": 1.54,
  "gaz": -20.02,
  "gazDuree": 5.792,
  "gazF": 1375,
  "corps": -38.84,
  "corpsF": 163,
  "corpsDuree": 23.46,
  "phaseNeg": 13.96,
  "montee": 56,
  "niveau": 162,
  "tplus": 0.8251,
  "directivite": 15,
  "vitesse": 900,
  "diametre": 5.7,
  "longueur": 23,
  "projectiles": 1,
  "freinage": 1000,
  "meca": 2,
  "mecaNiv": 80.4,
  "mecaCycle": 83.35,
  "mecaF": 7281,
  "ressort": -11.2,
  "ressortF": 4874,
  "douille": 1,
  "douilleNiv": 76,
  "douilleF": 8900,
  "cadence": 750,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Fusil d'assaut 7,62×39": {
  "beta": 3.219,
  "allonge": 0.2776,
  "precurseur": -3.596,
  "avance": 1.5,
  "cellules": 1,
  "cellNiv": -6.861,
  "cellEsp": 2.95,
  "gaz": -37.81,
  "gazDuree": 21.33,
  "gazF": 1218,
  "corps": -38.86,
  "corpsF": 213,
  "corpsDuree": 16.31,
  "phaseNeg": 9.379,
  "montee": 38,
  "niveau": 162,
  "tplus": 0.7205,
  "directivite": 15,
  "vitesse": 715,
  "diametre": 7.9,
  "longueur": 26.5,
  "projectiles": 1,
  "freinage": 900,
  "meca": 3,
  "mecaNiv": 95.49,
  "mecaCycle": 75.13,
  "mecaF": 1416,
  "ressort": -50,
  "douille": 1,
  "douilleNiv": 78,
  "douilleF": 7000,
  "cadence": 600,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Fusil de précision 7,62×54": {
  "beta": 2.9388,
  "allonge": 0.6797,
  "precurseur": -40,
  "avance": 0.6498,
  "cellules": 2,
  "cellNiv": -13.3142,
  "cellEsp": 2.4803,
  "gaz": -33.3187,
  "gazDuree": 11.3965,
  "gazF": 7013,
  "corps": -21.2122,
  "corpsF": 325,
  "corpsDuree": 1,
  "phaseNeg": 18.3167,
  "montee": 1,
  "niveau": 164,
  "tplus": 0.6069,
  "directivite": 15,
  "vitesse": 830,
  "diametre": 7.9,
  "longueur": 32,
  "projectiles": 1,
  "freinage": 1200,
  "meca": 0,
  "douille": 0,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Fusil à pompe 12": {
  "beta": 3.909,
  "allonge": 1.287,
  "precurseur": -7.325,
  "avance": 1.172,
  "cellules": 2,
  "cellNiv": -17.53,
  "cellEsp": 2.776,
  "gaz": -33.2,
  "gazDuree": 7.102,
  "gazF": 5532,
  "corps": -39.25,
  "corpsF": 59,
  "corpsDuree": 27.65,
  "phaseNeg": 11.02,
  "montee": 57,
  "niveau": 162,
  "tplus": 0.6295,
  "directivite": 18,
  "vitesse": 400,
  "diametre": 8.4,
  "longueur": 8.4,
  "projectiles": 9,
  "freinage": 150,
  "meca": 0,
  "douille": 0,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Pistolet-mitrailleur 9 mm": {
  "niveau": 158,
  "tplus": 0.6011,
  "beta": 2.3296,
  "allonge": 0.8215,
  "precurseur": -6.0776,
  "avance": 1.4003,
  "cellules": 0,
  "cellNiv": -21.2059,
  "cellEsp": 0.6862,
  "gaz": -26.7477,
  "gazDuree": 6.937,
  "gazF": 2449,
  "corps": -27.7147,
  "corpsF": 593,
  "corpsDuree": 1,
  "phaseNeg": 0.3,
  "montee": 41,
  "directivite": 15,
  "vitesse": 390,
  "diametre": 9.0,
  "longueur": 15.5,
  "projectiles": 1,
  "freinage": 575,
  "meca": 2,
  "mecaNiv": 98.5541,
  "mecaCycle": 34,
  "mecaF": 2063,
  "ressort": -40,
  "douille": 1,
  "douilleNiv": 76,
  "douilleF": 6000,
  "cadence": 800,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Carabine courte 5,56": {
  "beta": 3.915,
  "allonge": 0.9612,
  "precurseur": -7.438,
  "avance": 1.5,
  "cellules": 0,
  "cellNiv": -9.189,
  "cellEsp": 1.54,
  "gaz": -16.02,
  "gazDuree": 5.792,
  "gazF": 1375,
  "corps": -38.84,
  "corpsF": 163,
  "corpsDuree": 23.46,
  "phaseNeg": 13.96,
  "montee": 56,
  "niveau": 164,
  "tplus": 0.8251,
  "directivite": 15,
  "vitesse": 840,
  "diametre": 5.7,
  "longueur": 23,
  "projectiles": 1,
  "freinage": 1000,
  "meca": 2,
  "mecaNiv": 80.4,
  "mecaCycle": 83.35,
  "mecaF": 7281,
  "ressort": -11.2,
  "ressortF": 4874,
  "douille": 1,
  "douilleNiv": 76,
  "douilleF": 8900,
  "cadence": 800,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Fusil de combat 7,62×51": {
  "beta": 2.9388,
  "allonge": 0.6797,
  "precurseur": -40,
  "avance": 0.6498,
  "cellules": 2,
  "cellNiv": -13.3142,
  "cellEsp": 2.4803,
  "gaz": -33.3187,
  "gazDuree": 11.3965,
  "gazF": 7013,
  "corps": -21.2122,
  "corpsF": 325,
  "corpsDuree": 1,
  "phaseNeg": 18.3167,
  "montee": 1,
  "niveau": 164,
  "tplus": 0.6069,
  "directivite": 15,
  "vitesse": 830,
  "diametre": 7.9,
  "longueur": 31,
  "projectiles": 1,
  "freinage": 1200,
  "meca": 3,
  "douille": 1,
  "mecaNiv": 120,
  "mecaCycle": 45,
  "mecaF": 2600,
  "douilleF": 6500,
  "cadence": 650,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Fusil de chasse 12 (petits plombs)": {
  "beta": 3.909,
  "allonge": 1.287,
  "precurseur": -7.325,
  "avance": 1.172,
  "cellules": 2,
  "cellNiv": -17.53,
  "cellEsp": 2.776,
  "gaz": -33.2,
  "gazDuree": 7.102,
  "gazF": 5532,
  "corps": -39.25,
  "corpsF": 59,
  "corpsDuree": 27.65,
  "phaseNeg": 11.02,
  "montee": 57,
  "niveau": 162,
  "tplus": 0.6295,
  "directivite": 18,
  "vitesse": 400,
  "diametre": 2.8,
  "longueur": 2.8,
  "projectiles": 30,
  "freinage": 70,
  "meca": 0,
  "douille": 0,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Grenade à main": {
  "type": 1,
  "charge": 0.2,
  "beta": 1.2,
  "corps": -18,
  "corpsF": 150,
  "eclats": 20,
  "debris": -42,
  "feu": -16,
  "directivite": 0,
  "douille": 0,
  "meca": 0,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 },
 "Explosion lourde (2 kg)": {
  "type": 1,
  "charge": 2,
  "beta": 1.1,
  "corps": -14,
  "corpsF": 110,
  "eclats": 30,
  "debris": -36,
  "feu": -12,
  "directivite": 0,
  "douille": 0,
  "meca": 0,
  "micro": 145,
  "coupeBas": 40,
  "distance": 6,
  "angle": 30
 }
};
  CALES = {"Pistolet 9 mm": "pistolet 9 mm à percuteur, tirs de près, à mi-distance, de loin et derrière le tireur", "Fusil d'assaut 5,56": "carabine type AR-15 en 5,56×45, quatre positions de micro", "Fusil d'assaut 7,62×39": "fusil type AK-47 et carabine SKS en 7,62×39, de près, de loin et derrière le tireur", "Fusil de précision 7,62×54": "fusil à verrou en 7,62×54R, de près, à mi-distance et de loin", "Fusil à pompe 12": "trois fusils à pompe calibre 12, quatre positions de micro"};
  FIDELITE = {"Pistolet 9 mm": {"proche": {"ecart": 6.37, "etalon": 1.89}, "moyen": {"ecart": 8.32, "etalon": 2.82}, "loin": {"ecart": 10.75, "etalon": 1.64}, "tireur": {"ecart": 6.94, "etalon": 1.64}}, "Fusil d'assaut 5,56": {"proche": {"ecart": 6.09, "etalon": 2.44}, "moyen": {"ecart": 5.91, "etalon": 1.01}, "loin": {"ecart": 14.77, "etalon": 3.68}, "tireur": {"ecart": 10.19, "etalon": 0.79}}, "Fusil d'assaut 7,62×39": {"proche": {"ecart": 5.76, "etalon": 3.85}, "loin": {"ecart": 11.42, "etalon": 2.73}, "tireur": {"ecart": 5.77, "etalon": 1.65}}, "Fusil de précision 7,62×54": {"proche": {"ecart": 9.15, "etalon": 1.36}, "moyen": {"ecart": 4.11, "etalon": 4.94}, "loin": {"ecart": 7.84, "etalon": 2.15}}, "Fusil à pompe 12": {"proche": {"ecart": 5.62, "etalon": 2.55}, "moyen": {"ecart": 6.86, "etalon": 2.38}, "loin": {"ecart": 6.6, "etalon": 2.23}, "tireur": {"ecart": 8.52, "etalon": 2.33}}};
  LIEUX["Stand de tir (plein air)"] = {"queueDebut": 16.899, "queueMontee": 64, "queueGrave": 513, "queueT": 2.263, "queueClarte": 0.438, "echos": 4, "echoNiv": -33.87, "echoLoin": 29, "lieu": 0, "sol": 1, "queue": -74.3, "portee": 150};
  for (const k of Object.keys(LIEUX)) if (k !== "Stand de tir (plein air)") { const v = LIEUX[k]; delete LIEUX[k]; LIEUX[k] = v; }   // le stand en premier
  // </presets>
  const api = { PARAMS, GROUPES, DEFAUT, SOLS, LIEUX, get PRESETS() { return PRESETS; }, get CALES() { return CALES; }, get FIDELITE() { return FIDELITE; }, preset, tir, rendre, action, actionLieu, fiche, kinney, rng, absAir, reflet, version: "1.0",
    _presets(p) { PRESETS = p; }, _vider() { irCache.clear(); }, _limiteIR(s) { LIMITE_IR = s; irCache.clear(); } };
  return api;
});
