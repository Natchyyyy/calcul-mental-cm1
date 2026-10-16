/* Pas.js v2 — synthèse physique de bruits de pas sur bois. Aucune dépendance, aucun fichier son.
   Marche dans le navigateur (window.Pas) et dans Node (require("./pas.js")).

   Le modèle, couche par couche (chiffres tirés de la mécanique et de mesures sur de vrais enregistrements) :
     1. Contact talon / sol : modèle de Hunt-Crossley (F = k·x^1,5·(1 + μ·v)), le même que dans les travaux de
        Turchet et al. sur la synthèse de pas. Le talon (masse effective de quelques kg) arrive à 0,2–0,6 m/s.
        Une semelle dure donne un choc d'~1 ms (riche en aigus), un pied nu de 10–20 ms (sourd).
     2. Les planches : modes de flexion d'une plaque de bois orthotrope posée sur solives,
        f(n,m) = π/2 · h · √( E_L/12ρ·(n/L)⁴ + E_R/12ρ·(m/W)⁴ + … ). Chêne 22 mm, solives à 45 cm → ~165 Hz.
        L'amortissement vient du bois, des clous, et surtout du pied qui reste posé sur la planche.
     3. Le plancher entier (solives + vide dessous) : un mode grave 50–150 Hz, le « boum ».
     4. Le talon de la chaussure qui vibre (claquement), puis l'avant du pied qui se pose ~70 ms après.
     5. Détails : frottement, poussière, crissement de basket, planche mal fixée, grincement (collé-glissé).
   La pièce (premiers échos par sources-images + réverbération d'Eyring) est calculée par piece() et appliquée par le lecteur.
   Tout est déterministe : mêmes réglages + même graine = exactement le même son. */
(function (root, factory) {
  const api = factory(); api.__fabrique = factory;   // gardée pour créer un Worker (rendu hors du fil principal)
  if (typeof module === "object" && module.exports) module.exports = api; else root.Pas = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const TAU = Math.PI * 2, LN1000 = 6.907755, C_AIR = 343, TETE = 1.6;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), lerp = (a, b, t) => a + (b - a) * t;

  function rng(seed) {   // mulberry32
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- les réglages : [clé, groupe, libellé, min, max, pas, défaut, unité, aide] ----------
  const PARAMS = [
    ["essence", "sol", "Essence du bois", 0, 1, 0.01, 0.75, "", "0 = pin ou sapin (tendre, sourd), 0,75 = chêne, 1 = bois exotique très dur"],
    ["epaisseur", "sol", "Épaisseur des planches", 10, 45, 1, 22, "mm", "Parquet fin ≈ 14 mm, plancher ancien ≈ 25 à 30 mm"],
    ["portee", "sol", "Écart entre les solives", 25, 90, 1, 45, "cm", "Les poutres qui portent les planches : plus elles sont loin, plus c'est grave"],
    ["support", "sol", "Vide sous le plancher", 0, 1, 0.01, 0.55, "", "0 = collé sur une dalle de béton, 1 = plancher sur solives avec un grand vide"],
    ["amorti", "sol", "Planches mates ↔ qui sonnent", 0, 1, 0.01, 0.4, "", "0 = très étouffé, 1 = planches libres qui résonnent"],
    ["lache", "sol", "Planches mal fixées", 0, 1, 0.01, 0.1, "", "La planche se soulève et retape juste après le pas"],
    ["grince", "sol", "Grincements : combien de fois", 0, 1, 0.01, 0, "", "Probabilité qu'un pas fasse grincer le plancher"],
    ["grinceForce", "sol", "Grincements : force", 0, 1, 0.01, 0.5, "", ""],
    ["grinceHauteur", "sol", "Grincements : hauteur", 100, 900, 5, 300, "Hz", "Grave = « rrrr », aigu = « iiik »"],
    ["poussiere", "sol", "Poussière, grains de sable", 0, 1, 0.01, 0.05, "", "Petits grains qui crissent sous la semelle"],
    ["durete", "chaussure", "Semelle souple ↔ dure", 0, 1, 0.01, 0.8, "", "0 = pieds nus, 0,3 = basket, 0,8 = chaussure de ville (cuir), 0,95 = talon dur"],
    ["claque", "chaussure", "Claquement du talon", 0, 1, 0.01, 0.3, "", "La vibration du talon lui-même (« clac »)"],
    ["talonF", "chaussure", "Timbre du talon", 800, 5000, 10, 2600, "Hz", "Grave = gros talon en bois, aigu = petit talon dur"],
    ["frottement", "chaussure", "Frottement de la semelle", 0, 1, 0.01, 0.15, "", "La semelle qui glisse un peu en se posant et en repartant"],
    ["crissement", "chaussure", "Crissement de basket", 0, 1, 0.01, 0, "", "Le « couic » du caoutchouc sur bois vitrifié"],
    ["poids", "demarche", "Poids", 0.2, 1.5, 0.01, 0.8, "", "Enfant léger ↔ adulte lourd"],
    ["allure", "demarche", "Vitesse", 0.8, 3.4, 0.05, 1.85, "pas/s", "1,4 = flânerie, 1,85 = marche normale (~110 pas/min), 2,8 = course"],
    ["appui", "demarche", "Façon de poser le pied", 0, 1, 0.01, 0.45, "", "0 = pas feutrés, prudents ; 1 = on martèle le sol"],
    ["pointe", "demarche", "Avant du pied", 0, 1, 0.01, 0.45, "", "Force du second contact, quand l'avant du pied se pose"],
    ["variation", "demarche", "Différence d'un pas à l'autre", 0, 1, 0.01, 0.5, "", "0 = tous les pas identiques (pour comparer), 1 = très irréguliers"],
    ["longueur", "piece", "Longueur de la pièce", 2, 30, 0.5, 5, "m", ""],
    ["largeur", "piece", "Largeur de la pièce", 1, 30, 0.1, 4, "m", ""],
    ["hauteur", "piece", "Hauteur sous plafond", 2, 12, 0.1, 2.6, "m", ""],
    ["absorption", "piece", "Pièce nue ↔ pleine de tissus", 0.03, 0.9, 0.01, 0.22, "", "0,05 = salle vide en pierre, 0,2 = pièce meublée, 0,5 = pleine de rideaux ; 0,9 ≈ dehors"],
    ["clarte", "piece", "Écho sourd ↔ clair", 0, 1, 0.01, 0.45, "", "Les aigus de l'écho durent-ils autant que les graves ?"],
    ["mix", "piece", "Quantité d'écho", 0, 2, 0.01, 1, "", "1 = la quantité réelle d'après la pièce et la distance"],
    ["distance", "piece", "Distance", 0, 1, 0.01, 0, "", "0 = tes propres pas (oreilles à 1,6 m), 1 = quelqu'un à l'autre bout de la pièce"],
  ];
  const GROUPES = { sol: "Le sol", chaussure: "La chaussure", demarche: "La démarche", piece: "La pièce" };
  const DEFAUT = Object.fromEntries(PARAMS.map(p => [p[0], p[6]]));
  let PRESETS = {};   // remplis plus bas
  const preset = name => Object.assign({}, DEFAUT, PRESETS[name] || {});

  // ---------- petits outils de traitement du signal ----------
  function biquad(x, type, f, q, sr) {
    f = clamp(f, 10, sr * 0.45); const w = TAU * f / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
    let b0, b1, b2, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    if (type === "lp") { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (type === "hp") { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const xi = x[i], yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi; }
    return y;
  }
  // banc de résonateurs : modes = [[f, amplitude, t60], …], excitation exc, ajouté dans dst
  function modal(dst, exc, modes, sr) {
    let first = -1, last = -1; for (let i = 0; i < exc.length; i++) if (exc[i] !== 0) { if (first < 0) first = i; last = i; }
    if (first < 0) return;
    for (const [f, a, t60] of modes) {
      if (f >= sr * 0.45 || !(a > 0)) continue;
      const w = TAU * f / sr, r = Math.exp(-LN1000 / (Math.max(t60, 0.002) * sr)), c1 = 2 * r * Math.cos(w), c2 = -r * r, g = Math.sin(w) * a;
      let y1 = 0, y2 = 0, pk = 0;
      const stop = Math.min(dst.length, last + 1 + Math.ceil(t60 * 1.7 * sr));   // −100 dB : inaudible ensuite
      for (let i = first; i < stop; i++) {
        const e = i <= last ? exc[i] : 0, y = g * e + c1 * y1 + c2 * y2; y2 = y1; y1 = y; dst[i] += y;
      }
    }
  }
  function resonate(x, f, t60, sr, len) { const y = new Float32Array(len || x.length); modal(y, x, [[f, 1, t60]], sr); return y; }
  function add(dst, src, at, gain) { for (let i = 0; i < src.length; i++) { const j = at + i; if (j >= 0 && j < dst.length) dst[j] += src[i] * gain; } }
  function noise(n, r) { const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = (r() * 2 - 1) * 1.732; return y; }
  function peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }

  // ---------- 1. contact de Hunt-Crossley : force du talon (en newtons, échantillonnée) ----------
  // masse m (kg), raideur k (N/m^1,5), amortissement μ (s/m), vitesse d'arrivée v (m/s)
  function contact(m, k, mu, v0, sr) {
    const S = 16, dt = 1 / (sr * S), out = []; let x = 0, v = v0, started = false;
    for (let n = 0; n < sr * 0.08; n++) {
      let acc = 0;
      for (let s = 0; s < S; s++) {
        const F = x > 0 ? Math.max(0, k * Math.pow(x, 1.5) * (1 + mu * v)) : 0;
        v -= F / m * dt; x += v * dt; acc += F; if (x > 0) started = true;
      }
      out.push(acc / S); if (started && x <= 0) break;
    }
    out.push(0); return Float32Array.from(out);
  }
  // raideur et pertes de la semelle selon sa dureté (pied nu ≈ 15 ms de contact, talon dur ≈ 0,7 ms)
  // (échelle recentrée après calibration : une chaussure de ville dure tombe vers 0,75, un talon vers 0,95)
  // sous 0,3 : du pied nu (contact ~10 ms, le coussinet du talon est assez ferme) à la basket souple
  const raideur = d => d < 0.3 ? Math.exp(lerp(Math.log(1.27e7), Math.log(2.43e7), d / 0.3)) : Math.exp(lerp(Math.log(6e5), Math.log(3e9), Math.pow(d / 0.8, 0.85)));
  const pertes = d => Math.max(0.05, lerp(1.6, 0.12, d / 0.8));

  // ---------- 2. et 3. les modes du plancher ----------
  // planche p (0…5), point d'impact (xs le long de la portée, ys en travers, 0…1)
  function floorModes(P, p, xs, ys, sr) {
    const rr = rng(4242 + p * 131), e = P.essence;
    const EL = lerp(8.5, 14, e) * 1e9, ER = lerp(0.45, 1.2, e) * 1e9, rho = lerp(430, 800, e), etaBois = lerp(0.016, 0.008, e);
    const h = P.epaisseur / 1000 * (1 + 0.05 * (rr() * 2 - 1)), L = P.portee / 100 * (1 + 0.1 * (rr() * 2 - 1)), W = 0.55 * (1 + 0.15 * (rr() * 2 - 1));
    const cL = EL / (12 * rho), cR = ER / (12 * rho), list = [];
    // fréquence de coïncidence (au-dessus, la planche rayonne pleinement ; en dessous, de moins en moins)
    const fc = C_AIR * C_AIR / TAU * Math.sqrt(12 * rho / (Math.sqrt(EL * ER) * h * h));
    for (let n = 1; n <= 24; n++) for (let m = 1; m <= 40; m++) {
      const a = n / L, b = m / W, f = Math.PI / 2 * h * Math.sqrt(cL * a ** 4 + cR * b ** 4 + 0.7 * Math.sqrt(cL * cR) * a * a * b * b);
      if (f > 9000) continue;
      const shape = Math.sin(n * Math.PI * xs) * Math.sin(m * Math.PI * ys);
      const ray = (n % 2 && m % 2 ? 1 : 0.3) * Math.pow(Math.min(1, f / fc), 0.6);      // les modes « impairs » rayonnent le mieux
      list.push([f, Math.abs(shape) * ray * (0.75 + 0.5 * rr()), n, m]);
    }
    list.sort((u, v) => u[0] - v[0]);
    const f1 = list.length ? list[0][0] : 150, modes = [];
    // amortissement : bois + pied posé (surtout dans le grave) + clous/fixations ; une dalle dessous tue les graves
    const pied = 0.45 * Math.exp(-4.2 * P.amorti), dalle = (1 - P.support) * 0.35;   // pied posé : amortit surtout le grave
    for (const [f, a] of list) {   // tous les modes sous 9 kHz (tronquer au nombre supprimerait les aigus)
      const eta = etaBois + pied * Math.sqrt(f1 / f) + 0.04 * P.lache + dalle * (f < 500 ? 1 : 500 / f);
      modes.push([f, a * Math.pow(f1 / f, TILT) * (1 - 0.6 * (1 - P.support) * (f < 400 ? 1 : 0)), 2.2 / (eta * f)]);
    }
    return modes;
  }
  // constantes de calibration (ajustées pour coller aux mesures de vrais pas : voir calibrer.js)
  // valeurs trouvées par calibration conjointe sur 13 vrais pas sur bois (3 sources) : voir calibrer2.js, cfg_bois.json
  let TILT = 1.199, CLAQUE = 1.573, BASCULE = 0.5628, CRAQUE = 2.58, CRAQUE_F = 9000, PEAU = 8;   // PEAU : claquement de peau réglé entre bois sec et carrelage mouillé (vrais pas pieds nus : −26 dB à 1–4 kHz)

  // ---------- un pas ----------
  // o : { force, sr, planche (0…5), pos (0…1), couches (diagnostic) }
  const refCache = new Map();
  function rendre(Pin, seed, o) {
    o = o || {}; const P = Object.assign({}, DEFAUT, Pin), sr = o.sr || 48000;
    const y = coeur(P, seed, o, sr, false);
    // niveau : un pas « nominal » de ces réglages sert de référence, pour que les variations restent naturelles
    // (la référence est toujours un pas de marche normale, entendu de près : courir reste plus fort que marcher)
    const key = sr + "|" + PARAMS.filter(p => p[1] !== "piece" && p[0] !== "variation" && p[0] !== "allure").map(p => P[p[0]]).join(",");
    let ref = refCache.get(key);
    if (ref == null) { ref = peakOf(coeur(Object.assign({}, P, { allure: DEFAUT.allure, distance: 0 }), 1, { force: 1, nominal: true }, sr, true)) || 1; if (refCache.size > 200) refCache.clear(); refCache.set(key, ref); }
    // force du pas : ±2,5 dB environ à variation 0,5 (comme de vrais pas enregistrés), jusqu'à ±5 dB à 1
    const rv = rng((seed | 0) * 7919 + 3), dv = P.variation * 5 * (rv() + rv() + rv() - 1.5) / 1.5;
    const g = 0.42 / ref * Math.pow(10, dv / 20); for (let i = 0; i < y.length; i++) y[i] *= g;
    return y;
  }

  function coeur(P, seed, o, sr, nominal) {
    // un générateur aléatoire par couche : toucher un curseur ne change pas le hasard des autres couches
    const v = nominal ? 0 : P.variation, flux = k => rng((seed | 0) * 9973 + 17 + k * 7777771), r = flux(0);
    const rN = flux(1), rL = flux(2), rS = flux(3), rG = flux(4), rC = flux(5), rK = flux(6);
    const J = amt => Math.max(0.1, 1 + v * amt * (r() * 2 - 1));
    const chance = (p, q) => !nominal && (q || r)() < p;
    const N = Math.floor(sr * 1.6), base = new Float32Array(N), extra = new Float32Array(N);
    const run = clamp((P.allure - 1.3) / 1.6, 0, 1);
    const t0 = Math.round(0.004 * sr);
    let plank = v > 0 ? Math.floor(r() * 6) : 0, xs = v > 0 ? 0.15 + 0.7 * r() : 0.42, ys = v > 0 ? 0.15 + 0.7 * r() : 0.4;
    if (o.planche != null) plank = ((o.planche | 0) % 6 + 6) % 6;
    if (o.pos != null) xs = clamp(o.pos, 0.05, 0.95);

    // 1. le talon arrive
    const m = 0.9 + 3.6 * P.poids, k = raideur(P.durete), mu = pertes(P.durete);
    const vHeel = lerp(0.16, 0.55, P.appui) * (1 + 0.45 * run) * J(0.3) * (o.force || 1);
    const F1 = contact(m, k, mu, vHeel, sr), exc = new Float32Array(N); add(exc, F1, t0, 1);
    // 1b. le talon touche d'abord par son arête, puis bascule à plat ~10–25 ms après (mesuré sur de vrais pas)
    const tb = t0 + Math.round(lerp(0.02, 0.011, run) * J(0.3) * sr), vB = vHeel * BASCULE * J(0.35) * (0.4 + 0.6 * P.durete);
    const F1b = vB > 0.01 ? contact(m * 0.8, k * 1.4, mu, vB, sr) : null;
    if (F1b) add(exc, F1b, tb, 1);
    // 4b. l'avant du pied se pose (déroulé du pied, ~70 ms en marche, plus tôt en courant)
    const tt = t0 + Math.round(lerp(0.085, 0.035, run) * J(0.25) * sr);
    const vToe = vHeel * P.pointe * lerp(0.45, 0.85, run) * J(0.35);
    let F2 = null;
    if (vToe > 0.01) { F2 = contact(m * 0.6, k * 0.5, mu * 1.3, vToe, sr); }
    // 2.+3. réponse du plancher (talon et pointe tombent sur deux points différents)
    const floor = new Float32Array(N);
    modal(floor, exc, floorModes(P, plank, xs, ys, sr), sr);
    if (F2) { const e2 = new Float32Array(N); add(e2, F2, tt, 1); modal(floor, e2, floorModes(P, plank, clamp(xs + 0.22, 0.05, 0.95), clamp(ys + 0.1 * (r() - 0.5), 0.05, 0.95), sr), sr); }
    // 6a. planche mal fixée : elle retape une ou deux fois juste après
    if (P.lache > 0 && chance(Math.min(1, P.lache * 1.3), rL)) {
      const e3 = new Float32Array(N), n3 = chance(P.lache, rL) ? 2 : 1; let t = t0;
      for (let i = 0; i < n3; i++) { t += Math.round((0.006 + 0.02 * rL()) * sr); add(e3, contact(0.4, 2e9, 0.2, vHeel * P.lache * 1.6 * (0.5 + 0.5 * rL()) / (i + 1), sr), t, 1); }
      const rap = new Float32Array(N); modal(rap, e3, floorModes(P, (plank + 3) % 6, rL(), rL(), sr).map(q => [q[0] * 1.35, q[1], q[2] * 0.5]), sr);
      // le claquement de la planche suit la force du pas, mais ne dépasse jamais ~60 % du pas (semelles souples comprises)
      const pr = peakOf(rap), pf = peakOf(floor), gr = pr > 0.6 * pf ? 0.6 * pf / pr : 1; add(floor, rap, 0, gr);
    }
    add(base, floor, 0, 1);
    // 4a. le talon de la chaussure vibre : excité par la variation de force (les chocs secs le font sonner)
    if (P.claque > 0 && P.durete > 0.2) {
      const d = new Float32Array(F1.length + 1); for (let i = 1; i < F1.length; i++) d[i] = (F1[i] - F1[i - 1]) * sr * 1e-4;
      const n = Math.round(0.03 * sr), fT = P.talonF * J(0.05);
      const cl = new Float32Array(n); modal(cl, d, [[fT, 1, 0.007], [fT * 2.37, 0.5, 0.004], [fT * 0.61, 0.35, 0.009]], sr);
      add(base, cl, t0, CLAQUE * P.claque * Math.pow((P.durete - 0.2) / 0.8, 1.5) * 2e-3);
    }
    // 4c. craquement de contact : bruit large bande qui suit les variations brutales de la force (surface, vernis, semelle)
    const craque = (F, at, gain) => {
      if (!F || gain <= 0) return; const n = F.length + Math.round(0.004 * sr), b = new Float32Array(n); let mx = 0;
      for (let i = 1; i < F.length; i++) { const d = Math.abs(F[i] - F[i - 1]); b[i] = d; if (d > mx) mx = d; }
      const env = biquad(b, "lp", 1500, 0.7, sr), nz = noise(n, rN); for (let i = 0; i < n; i++) nz[i] *= Math.max(0, env[i]);
      add(base, biquad(biquad(biquad(nz, "hp", 700, 0.7, sr), "lp", CRAQUE_F * lerp(0.55, 1.15, P.durete), 0.7, sr), "lp", CRAQUE_F * lerp(0.55, 1.15, P.durete) * 1.6, 0.7, sr), at, gain * sr * 1e-4);
    };
    craque(F1, t0, CRAQUE * Math.pow(P.durete, 0.7)); craque(F1b, tb, CRAQUE * Math.pow(P.durete, 0.7));
    // 4d. pied nu : la peau claque sur le bois vernis (petite bouffée médium, un peu d'air chassé)
    const peau = Math.pow(Math.max(0, 1 - P.durete / 0.3), 1.5);
    if (peau > 0) for (const [F, at, g] of [[F1, t0, 1], [F2, tt, 0.8]]) {
      if (!F) continue; const n = Math.round(0.012 * sr), b = noise(n, rN);
      for (let i = 0; i < n; i++) b[i] *= Math.exp(-i / (0.0018 * sr)) * Math.min(1, i / (0.0004 * sr));
      const sl = biquad(biquad(b, "bp", lerp(900, 1600, rN()), 0.8, sr), "lp", 4000, 0.7, sr);
      let fm = 0; for (const f of F) fm = Math.max(fm, f); add(base, sl, at + Math.round(0.002 * sr), peau * g * fm * PEAU);
    }
    if (F2) craque(F2, tt, CRAQUE * 0.6 * Math.pow(P.durete, 0.7));
    if (o.couches) o.couches.raw = { sol: peakOf(floor) };
    const pb = peakOf(base) || 1e-9;

    // 5. frottements de semelle (en se posant, puis en repartant) — faibles, comme dans les vrais enregistrements
    const scuff = (at, d, amp, center) => {
      if (amp <= 0) return; const n = Math.round(d * sr); if (n < 16) return;
      const s = biquad(biquad(noise(n, rS), "bp", center, 0.9, sr), "lp", center * 2.5, 0.7, sr);
      const g = biquad(noise(n, rS).map(Math.abs), "lp", 70, 0.7, sr), gp = peakOf(g) || 1;
      for (let i = 0; i < n; i++) { const x = i / n, e = x < 0.25 ? x / 0.25 : (1 - x) / 0.75; s[i] *= Math.pow(e, 1.3) * (0.35 + 0.65 * g[i] / gp); }
      add(extra, s, at, amp);
    };
    const scC = lerp(450, 2200, P.durete), Js = amt => Math.max(0.1, 1 + v * amt * (rS() * 2 - 1));
    if (!nominal) {
      scuff(t0 + Math.round(0.004 * sr), lerp(0.03, 0.07, rS()), P.frottement * 0.13 * Js(0.4), scC * Js(0.15));
      scuff(tt + Math.round(lerp(0.12, 0.05, run) * sr), lerp(0.05, 0.12, rS()), P.frottement * 0.1 * Js(0.5), scC * 1.2 * Js(0.15));
      // 5b. grains de poussière écrasés
      const grains = Math.round(P.poussiere * 30 * (0.5 + rG()));
      for (let q = 0; q < grains; q++) {
        const at = t0 + Math.round(rG() * (tt - t0 + 0.12 * sr)), b = new Float32Array(1); b[0] = 1;
        add(extra, resonate(b, lerp(2500, 9000, rG()), lerp(0.002, 0.006, rG()), sr, Math.round(0.008 * sr)), at, Math.pow(0.2 + 0.8 * rG(), 2) * 0.11 * (0.15 + 0.85 * P.durete));
      }
    }
    // 5c. crissement de basket (caoutchouc collé-glissé, aigu)
    if (P.crissement > 0 && chance(P.crissement * 0.7, rC)) {
      const d = lerp(0.03, 0.09, rC()), n = Math.round(d * sr), fa = lerp(1400, 3200, rC()), fb = fa * lerp(0.6, 1.5, rC());
      const am = biquad(noise(n, rC), "lp", 35, 0.7, sr), ap = peakOf(am) || 1, s = new Float32Array(n); let ph = 0;
      for (let i = 0; i < n; i++) {
        const x = i / n; ph += fa * Math.pow(fb / fa, x) * (1 + 0.02 * (rC() * 2 - 1)) / sr;
        let w = 0; for (let hh = 1; hh <= 5; hh++) w += Math.sin(TAU * ph * hh) / hh;
        s[i] = w * Math.pow(Math.sin(Math.PI * x), 2) * (0.35 + 0.65 * Math.abs(am[i]) / ap);
      }
      add(extra, biquad(s, "bp", fa * 1.5, 0.7, sr), tt + Math.round(lerp(0.03, 0.1, rC()) * sr), 0.16 * Math.sqrt(P.crissement));
    }
    // 6b. grincement : frottement collé-glissé entre deux planches (ou sur un clou), filtré par le bois
    if (P.grince > 0 && chance(P.grince * (0.5 + 0.5 * Math.min(1, P.poids)), rK)) {
      const d = lerp(0.12, 0.5, rK()) * (0.6 + 0.6 * P.grinceForce), n = Math.round(d * sr);
      const fa = P.grinceHauteur * lerp(0.75, 1.25, rK()), fb = fa * lerp(0.6, 1.4, rK()), wob = lerp(1, 5, rK());
      const imp = new Float32Array(n); let ph = 0, f = fa;
      for (let i = 0; i < n; i++) {
        const x = i / n; ph += f / sr;
        if (ph >= 1) {
          ph -= 1; f = fa * Math.pow(fb / fa, x) * (1 + 0.15 * Math.sin(TAU * x * wob)) * (1 + 0.07 * (rK() * 2 - 1));
          imp[i] = (0.5 + 0.5 * rK()) * Math.pow(Math.sin(Math.PI * Math.pow(x, 0.7)), 0.8) * (rK() < 0.06 ? 0.2 : 1);
        }
      }
      const fl = floorModes(P, plank, xs, ys, sr), R = (fl.length ? fl[0][0] : 150) * 2.5, s = new Float32Array(n + Math.round(0.1 * sr));
      modal(s, imp, [[R, 1, 0.03], [R * 1.63, 0.7, 0.02], [R * 2.71, 0.4, 0.012], [R * 4.1, 0.15, 0.008]], sr);
      const sp = peakOf(s) || 1;
      add(extra, biquad(s, "hp", 120, 0.7, sr).map(q => q / sp), t0 + Math.round((0.02 + 0.12 * rK()) * sr), P.grinceForce * 0.6);
    }

    // somme : les détails sont dosés par rapport au pas lui-même
    let y = new Float32Array(N); for (let i = 0; i < N; i++) y[i] = base[i] + extra[i] * pb;
    y = biquad(y, "hp", 30, 0.7, sr);
    if (P.distance > 0.01) y = biquad(y, "lp", lerp(16000, 4000, Math.pow(P.distance, 0.9)), 0.7, sr);   // l'air absorbe les aigus
    return trim(y, sr);
  }

  function trim(y, sr) {
    const p = peakOf(y), lim = p * 2e-4; let end = y.length - 1;
    while (end > 0 && Math.abs(y[end]) < lim) end--;
    end = Math.min(y.length, end + Math.round(0.01 * sr));
    const out = y.slice(0, end), nf = Math.min(Math.round(0.01 * sr), out.length >> 2);
    for (let i = 0; i < nf; i++) out[out.length - 1 - i] *= Math.pow(i / nf, 2);
    return out;
  }

  // ---------- une marche : quand tombent les pas, quel pied ----------
  function marche(P, n, seed) {
    P = Object.assign({}, DEFAUT, P); const r = rng((seed | 0) * 31 + 7), steps = []; let t = 0;
    for (let i = 0; i < n; i++) {
      steps.push({ t, seed: (seed | 0) * 1000 + i, pied: i % 2, force: i % 2 ? 0.94 : 1, pan: i % 2 ? 0.06 : -0.06 });
      t += (1 / P.allure) * (1 + P.variation * 0.035 * (r() * 2 - 1)) * (i % 2 ? 0.985 : 1.015);   // petite asymétrie gauche/droite
    }
    return steps;
  }

  // ---------- la pièce : premiers échos (sources-images) + réverbération (Eyring), stéréo ----------
  // Renvoie { ir: [gauche, droite], sec } : sec = gain du son direct (1 à 1,6 m, tête au-dessus des pieds).
  // L'IR est à l'échelle du son direct (direct = 1) : elle contient la vraie quantité d'écho pour cette pièce et cette distance.
  function piece(Pin, sr) {
    const P = Object.assign({}, DEFAUT, Pin); sr = sr || 48000;
    const Lx = P.longueur, Ly = P.largeur, Lz = P.hauteur, al = clamp(P.absorption, 0.02, 0.97);
    const V = Lx * Ly * Lz, S = 2 * (Lx * Ly + Lx * Lz + Ly * Lz), T = clamp(0.161 * V / (-S * Math.log(1 - al)), 0.04, 8);
    const Rc = S * al / (1 - al), rc = Math.sqrt(2 * Rc / (16 * Math.PI));      // distance critique (source posée au sol : Q = 2)
    const horiz = Math.max(0, P.distance * Math.min(12, 0.55 * Lx - 0.2));   // l'auditeur reste dans la pièce
    const src = [Lx * 0.4, Ly * 0.5, 0.02], dist = Math.hypot(horiz, TETE - 0.02);
    const ears = [[src[0] + horiz, Ly * 0.5 - 0.09, TETE], [src[0] + horiz, Ly * 0.5 + 0.09, TETE]];
    const refl = Math.sqrt(1 - al), len = Math.floor(sr * Math.min(8, T * 1.2 + 0.15)), fc0 = lerp(2500, 12000, P.clarte);
    const out = [], NI = 4;
    for (let ch = 0; ch < 2; ch++) {
      const h = new Float32Array(len), E = ears[ch], r = rng(777 + ch * 101); let eImg = 0, tFirst = 1;
      // sources-images (jusqu'à l'ordre ~4 par axe) ; le reflet du sol est confondu avec le son direct (la source est au sol)
      for (let i = -NI; i <= NI; i++) for (let px = 0; px < 2; px++)
        for (let j = -NI; j <= NI; j++) for (let py = 0; py < 2; py++)
          for (let q = -2; q <= 2; q++) for (let pz = 0; pz < 2; pz++) {
            const nx = Math.abs(2 * i - px), ny = Math.abs(2 * j - py), nz = Math.abs(2 * q - pz), ord = nx + ny + nz;
            if (ord === 0 || (nx === 0 && ny === 0 && nz === 1)) continue;
            if (ord > 9) continue;
            const X = (1 - 2 * px) * src[0] + 2 * i * Lx, Y = (1 - 2 * py) * src[1] + 2 * j * Ly, Z = (1 - 2 * pz) * src[2] + 2 * q * Lz;
            const d = Math.hypot(X - E[0], Y - E[1], Z - E[2]), t = (d - dist) / C_AIR; if (t < 0 || t * sr >= len - 64) continue;   // le son direct (joué à part) est à t = 0
            // chaque rebond diffuse une partie du son (~20 %) : la part « miroir » diminue avec l'ordre, le reste va dans la queue
            const g = Math.pow(refl * 0.89, ord) * dist / d * (1 + 0.25 * (r() * 2 - 1)) * (ord > 1 ? (r() < 0.5 ? -1 : 1) : 1); tFirst = Math.min(tFirst, t);
            // chaque rebond adoucit les aigus : petit noyau dont la largeur grandit avec l'ordre
            const w = Math.max(1, Math.round(sr / (fc0 * Math.pow(0.8, ord)) * 0.5)), i0 = Math.round((t + (ord > 1 ? (r() - 0.5) * 0.0006 * ord : 0)) * sr);
            for (let k = 0; k < w; k++) { const kk = (1 - Math.cos(TAU * (k + 0.5) / w)) / w; h[i0 + k] += g * kk; }
            eImg += g * g;
          }
      // queue diffuse : bruit qui décroît en T (les aigus plus vite), énergie fixée par la théorie de la réverbération
      const target = Math.pow(dist / rc, 2), tail = new Float32Array(len); let lp = 0, eT = 0;
      const tStart = tFirst + 0.004;
      for (let i = 0; i < len; i++) {
        const t = i / sr; if (t < tStart) continue;
        const fc = fc0 * Math.pow(lerp(0.12, 0.6, P.clarte), Math.min(1.5, (t - tStart) / T)), a = 1 - Math.exp(-TAU * fc / sr);
        lp += a * ((r() * 2 - 1) - lp);
        const ramp = Math.min(1, (t - tStart) / Math.max(0.01, 0.06 * Math.cbrt(V / 50)));
        tail[i] = lp * Math.exp(-LN1000 * (t - tStart) / T) * ramp * Math.sqrt(fc0 / fc); eT += tail[i] * tail[i];
      }
      const gT = Math.sqrt(Math.max(target - eImg * 0.5, target * 0.25) / (eT || 1));
      for (let i = 0; i < len; i++) h[i] += tail[i] * gT;
      out.push(h);
    }
    return { ir: out, sec: TETE / dist, T, rc };
  }

  // fiche physique d'un réglage (pour l'afficher) : durée du contact du talon, première résonance de la planche, écho de la pièce
  function fiche(Pin, sr) {
    const P = Object.assign({}, DEFAUT, Pin); sr = sr || 48000;
    const F = contact(0.9 + 3.6 * P.poids, raideur(P.durete), pertes(P.durete), lerp(0.16, 0.55, P.appui), sr), R = piece(P, sr);
    const fm = floorModes(P, 0, 0.42, 0.4, sr); return { contactMs: F.length / sr * 1000, planchHz: fm.length ? fm[0][0] : NaN, echoS: R.T, distanceCritique: R.rc };
  }
  const api = { fiche, PARAMS, GROUPES, DEFAUT, get PRESETS() { return PRESETS; }, preset, rendre, marche, piece, rng, contact, raideur, pertes, version: "2.0",
    _calib(c) { if (c) { if (c.TILT != null) TILT = c.TILT; if (c.CLAQUE != null) CLAQUE = c.CLAQUE; if (c.BASCULE != null) BASCULE = c.BASCULE; if (c.CRAQUE != null) CRAQUE = c.CRAQUE; if (c.CRAQUE_F != null) CRAQUE_F = c.CRAQUE_F; if (c.PEAU != null) PEAU = c.PEAU; refCache.clear(); } return { TILT, CLAQUE, BASCULE, CRAQUE, CRAQUE_F, PEAU }; },
    _presets(p) { PRESETS = p; } };
  // ---------- réglages tout prêts (générés par mesure/reglages_bois.py ; les trois premiers sont calés sur 13 vrais pas sur bois) ----------
  PRESETS = {
   "Parquet en chêne": {
    "essence": 0.947,
    "epaisseur": 12.58,
    "portee": 25.91,
    "support": 0.952,
    "amorti": 0.466,
    "durete": 0.929,
    "claque": 0.15,
    "talonF": 2294,
    "appui": 0.869,
    "pointe": 1,
    "longueur": 5.5,
    "largeur": 4.2,
    "hauteur": 2.6,
    "absorption": 0.22,
    "clarte": 0.45
   },
   "Vieux plancher massif": {
    "essence": 0.89,
    "epaisseur": 30.61,
    "portee": 50.11,
    "support": 0.553,
    "amorti": 0.514,
    "durete": 0.755,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.598,
    "pointe": 0.301,
    "longueur": 4.5,
    "largeur": 4,
    "hauteur": 2.7,
    "absorption": 0.2,
    "clarte": 0.4
   },
   "Parquet fin, semelles souples": {
    "lache": 0,
    "poussiere": 0,
    "frottement": 0.05,
    "essence": 0.781,
    "epaisseur": 21.92,
    "portee": 62.11,
    "support": 0.115,
    "amorti": 0.557,
    "durete": 0.336,
    "claque": 0.318,
    "talonF": 1504,
    "appui": 0.688,
    "pointe": 0.237,
    "longueur": 5.5,
    "largeur": 4.2,
    "hauteur": 2.6,
    "absorption": 0.22,
    "clarte": 0.45
   },
   "Plancher qui grince": {
    "essence": 0.4,
    "epaisseur": 30.61,
    "portee": 50.11,
    "support": 0.553,
    "amorti": 0.6,
    "durete": 0.755,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.598,
    "pointe": 0.301,
    "lache": 0.35,
    "grince": 0.5,
    "grinceForce": 0.55,
    "grinceHauteur": 260,
    "poussiere": 0.2,
    "longueur": 4.5,
    "largeur": 3.8,
    "hauteur": 2.5,
    "absorption": 0.18,
    "clarte": 0.4
   },
   "Escalier en bois": {
    "essence": 0.6,
    "epaisseur": 30,
    "portee": 70,
    "support": 1,
    "amorti": 0.5,
    "durete": 0.755,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.6,
    "pointe": 0.3,
    "longueur": 3,
    "largeur": 1.4,
    "hauteur": 6,
    "absorption": 0.1,
    "clarte": 0.5
   },
   "Ponton au bord de l'eau": {
    "essence": 0.35,
    "epaisseur": 28,
    "portee": 60,
    "support": 1,
    "amorti": 0.6,
    "durete": 0.65,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.598,
    "pointe": 0.301,
    "lache": 0.45,
    "grince": 0.1,
    "grinceForce": 0.35,
    "poussiere": 0.3,
    "frottement": 0.25,
    "longueur": 30,
    "largeur": 30,
    "hauteur": 12,
    "absorption": 0.9,
    "clarte": 0.3
   },
   "Baskets sur parquet vitrifié": {
    "essence": 0.947,
    "epaisseur": 12.58,
    "portee": 25.91,
    "support": 0.952,
    "amorti": 0.466,
    "durete": 0.32,
    "claque": 0,
    "talonF": 2294,
    "appui": 0.5,
    "pointe": 0.25,
    "frottement": 0.2,
    "crissement": 0.25,
    "longueur": 5.5,
    "largeur": 4.2,
    "hauteur": 2.6,
    "absorption": 0.15,
    "clarte": 0.55
   },
   "Talons sur parquet": {
    "essence": 0.947,
    "epaisseur": 12.58,
    "portee": 25.91,
    "support": 0.952,
    "amorti": 0.466,
    "durete": 0.97,
    "claque": 0.7,
    "talonF": 2900,
    "appui": 0.6,
    "pointe": 0.3,
    "poids": 0.55,
    "frottement": 0.05,
    "longueur": 9,
    "largeur": 6,
    "hauteur": 3.2,
    "absorption": 0.12,
    "clarte": 0.55
   },
   "Bottes, personnage lourd": {
    "essence": 0.89,
    "epaisseur": 30.61,
    "portee": 50.11,
    "support": 0.553,
    "amorti": 0.514,
    "durete": 0.85,
    "claque": 0.35,
    "talonF": 1500,
    "appui": 0.7,
    "pointe": 0.35,
    "poids": 1.3,
    "allure": 1.6,
    "longueur": 6,
    "largeur": 5,
    "hauteur": 2.8,
    "absorption": 0.2
   },
   "Course sur plancher": {
    "essence": 0.89,
    "epaisseur": 30.61,
    "portee": 50.11,
    "support": 0.553,
    "amorti": 0.514,
    "durete": 0.5,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.8,
    "pointe": 0.6,
    "allure": 2.8,
    "variation": 0.6,
    "frottement": 0.25,
    "longueur": 6,
    "largeur": 5,
    "hauteur": 2.8
   },
   "Pas furtifs": {
    "essence": 0.89,
    "epaisseur": 30.61,
    "portee": 50.11,
    "support": 0.553,
    "amorti": 0.514,
    "durete": 0.5,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.04,
    "pointe": 0.5,
    "allure": 1.1,
    "frottement": 0.12,
    "variation": 0.6,
    "longueur": 6,
    "largeur": 5,
    "hauteur": 2.8
   },
   "Pieds nus": {
    "essence": 0.947,
    "epaisseur": 12.58,
    "portee": 25.91,
    "support": 0.952,
    "amorti": 0.466,
    "durete": 0,
    "claque": 0,
    "talonF": 2294,
    "appui": 0.35,
    "pointe": 0.5,
    "frottement": 0.1,
    "poids": 0.5,
    "longueur": 5.5,
    "largeur": 4.2,
    "hauteur": 2.6,
    "absorption": 0.22,
    "clarte": 0.45
   },
   "Grenier poussiéreux": {
    "essence": 0.3,
    "epaisseur": 22,
    "portee": 60,
    "support": 0.9,
    "amorti": 0.48,
    "durete": 0.7,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.598,
    "pointe": 0.301,
    "lache": 0.3,
    "grince": 0.35,
    "grinceForce": 0.45,
    "grinceHauteur": 380,
    "poussiere": 0.6,
    "frottement": 0.3,
    "allure": 1.4,
    "longueur": 8,
    "largeur": 5,
    "hauteur": 2.2,
    "absorption": 0.3,
    "clarte": 0.3
   },
   "Chalet en bois": {
    "essence": 0.35,
    "epaisseur": 30,
    "portee": 50,
    "support": 0.8,
    "amorti": 0.55,
    "durete": 0.755,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.598,
    "pointe": 0.301,
    "lache": 0.15,
    "longueur": 5,
    "largeur": 4,
    "hauteur": 2.4,
    "absorption": 0.15,
    "clarte": 0.35
   },
   "Grande salle de taverne": {
    "essence": 0.89,
    "epaisseur": 30.61,
    "portee": 50.11,
    "support": 0.553,
    "amorti": 0.514,
    "durete": 0.75,
    "claque": 0.032,
    "talonF": 2594,
    "appui": 0.598,
    "pointe": 0.301,
    "poids": 0.9,
    "lache": 0.15,
    "grince": 0.1,
    "grinceForce": 0.35,
    "longueur": 14,
    "largeur": 10,
    "hauteur": 5,
    "absorption": 0.12,
    "clarte": 0.4
   }
  };
  api.CALES = {"Parquet en chêne": "minetest", "Vieux plancher massif": "kretopi", "Parquet fin, semelles souples": "kenney"};   // réglages calés automatiquement sur de vrais enregistrements
  return api;
});
