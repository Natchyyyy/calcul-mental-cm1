/* SonsDePas — bruits de pas physiques pour un jeu web, construits sur Pas.js (à charger avant ce fichier).

   const pas = SonsDePas.creer({ surface: "Parquet en chêne" });       // ou { reglages: {...} } (copiés depuis l'atelier)
   pas.jouer();                                                         // le joueur fait un pas
   pas.jouer({ force: .7, cote: -1 });                                  // pied gauche, un peu plus doux
   pas.jouer({ distance: 6, pan: .4 });                                 // quelqu'un d'autre, à 6 m sur la droite
   pas.surface("Escalier en bois");                                      // on change de sol (la pièce ne change pas)
   pas.piece({ longueur: 14, largeur: 10, hauteur: 5, absorption: .12 }); // on change de pièce (l'écho) ; ou pas.piece("Nom d'un réglage")
   Promenade(camera, dom, { …, pas: pas.pourPromenade() });             // branché sur boite-a-outils/promenade

   Fonctionnement : chaque pas est calculé par le moteur physique (≈ 10 ms). Pour qu'aucune image du jeu ne saute,
   les pas ET l'écho des pièces sont calculés dans un Worker, et on garde d'avance une réserve de variantes
   (10 par défaut) par sol : chaque variante jouée est aussitôt remplacée par une nouvelle, on n'entend jamais deux
   fois exactement le même pas. L'écho est appliqué en direct (ConvolverNode) : changer de pièce ne recalcule pas les pas. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./pas.js")); else root.SonsDePas = factory(root.Pas);
})(typeof self !== "undefined" ? self : this, function (Pas) {
  "use strict";
  if (!Pas) throw new Error("SonsDePas : charger pas.js avant sons-de-pas.js");
  const CLES_PIECE = Pas.PARAMS.filter(p => p[1] === "piece").map(p => p[0]);
  const MAX_SOLS = 16;   // réserves gardées en mémoire (les plus anciennes sont oubliées, jamais celles préchargées ou en cours)

  // ---------- un seul Worker partagé : pas et écho calculés hors du fil principal ----------
  let worker = null, wId = 0, enVol = 0; const attentes = new Map(), file = [];
  const local = (d) => d.type === "piece" ? Pas.piece(d.P, d.sr) : Pas.rendre(d.P, d.seed, { sr: d.sr });
  function demarrerWorker() {
    if (worker !== null) return worker;
    try {
      const src = "self.Pas = (" + Pas.__fabrique.toString() + ")();\n" +
        "self.onmessage = e => { const d = e.data; try {\n" +
        "  if (d.type === 'piece') { const R = self.Pas.piece(d.P, d.sr); self.postMessage({ id: d.id, R }, [R.ir[0].buffer, R.ir[1].buffer]); }\n" +
        "  else { const y = self.Pas.rendre(d.P, d.seed, { sr: d.sr }); self.postMessage({ id: d.id, y }, [y.buffer]); }\n" +
        "} catch (err) { self.postMessage({ id: d.id, erreur: String(err) }); } };";
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      worker.onmessage = e => { const a = attentes.get(e.data.id); enVol--; if (a) { attentes.delete(e.data.id);
        if (e.data.erreur) { console.warn("SonsDePas : calcul impossible pour ces réglages", e.data.erreur); a.res(null); } else a.res(e.data.R || e.data.y); } pomper(); };
      worker.onerror = () => {   // le Worker a planté : on refait les calculs en attente, un par tranche de temps libre
        worker = false; const restes = [...attentes.values(), ...file.splice(0)]; attentes.clear(); restes.forEach(a => tard(() => a.res(local(a.d))));
      };
    } catch (e) { worker = false; }
    return worker;
  }
  const tard = f => (typeof requestIdleCallback === "function" ? requestIdleCallback(() => { try { f(); } catch (e) { console.warn(e); } }, { timeout: 200 }) : setTimeout(() => { try { f(); } catch (e) { console.warn(e); } }, 0));
  // au plus 3 calculs envoyés au Worker à la fois : un travail devenu inutile (sol oublié) est sauté avant d'être envoyé,
  // et l'écho d'une pièce passe devant les pas
  function pomper() {
    while (worker && enVol < 3 && file.length) {
      const a = file.shift(); if (a.vivant && !a.vivant()) { a.res(null); continue; }
      const id = ++wId; attentes.set(id, a); enVol++; worker.postMessage(Object.assign({ id }, a.d));
    }
  }
  function calculer(d, vivant) {   // d = { type: "pas" | "piece", P, seed, sr } → Promise (null si annulé ou impossible)
    const w = typeof Worker !== "undefined" && Pas.__fabrique ? demarrerWorker() : false;
    return new Promise(res => {
      if (w) { const a = { res, d, vivant }; if (d.type === "piece") file.unshift(a); else file.push(a); pomper(); }
      else tard(() => { if (vivant && !vivant()) return res(null); try { res(local(d)); } catch (e) { console.warn(e); res(null); } });   // sans Worker : un calcul par moment libre
    });
  }

  function creer(o) {
    o = o || {};
    const ac = o.ac || new (window.AudioContext || window.webkitAudioContext)();
    const N = o.variantes || 10;
    // entrée générale : volume → limiteur → haut-parleurs (ou o.sortie). Un PannerNode 3D passé à jouer() doit être relié à pas.entree.
    const master = ac.createGain(); master.gain.value = o.volume == null ? 1 : o.volume;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 3; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    master.connect(lim).connect(o.sortie || ac.destination);
    const conv = ac.createConvolver(); conv.normalize = false; const wet = ac.createGain(); wet.gain.value = 0; wet.connect(conv).connect(master);
    let reglages = null, sec = 1, seed = (o.graine || ((Math.random() * 1e6) | 0)) * 1000, pieceVoulue = null, pieceAppliquee = "", pieceEnCours = false;
    const reserves = new Map();   // clé du sol → { P, bufs, dernier, attente, vu }

    function base(nom, extra) {
      // accepte aussi ce que copie l'atelier : { depart: "Réglage", changements: {...} }
      if (extra && typeof extra === "object" && extra.changements) extra = extra.changements;
      if (nom && typeof nom === "object" && nom.depart) return base(nom.depart, Object.assign({}, nom.changements || {}, extra || {}));
      if (typeof nom === "string" && !Pas.PRESETS[nom]) console.warn("SonsDePas : réglage inconnu « " + nom + " » — réglages possibles :", Object.keys(Pas.PRESETS));
      const P = typeof nom === "string" ? Pas.preset(nom) : Object.assign({}, Pas.DEFAUT, nom || {});
      return Object.assign(P, extra || {});
    }
    const enCourse = P => P.allure >= 2.6 ? P : Object.assign({}, P, { allure: 2.9, appui: Math.min(1, P.appui + 0.3), pointe: Math.min(1, P.pointe + 0.25) });
    const cleSol = P => Pas.PARAMS.filter(p => p[1] !== "piece").map(p => P[p[0]]).join(",");
    const versBuffer = y => { const b = ac.createBuffer(1, y.length, ac.sampleRate); b.copyToChannel(y, 0); return b; };
    function reserve(P, creer, garder) {
      const P2 = Object.assign({}, P, { distance: 0 }), k = cleSol(P2);
      let R = reserves.get(k); if (R || creer === false) { if (R) { R.vu = performance.now(); if (garder) R.garde = true; } return R; }
      R = { k, P: P2, bufs: [], dernier: null, attente: 0, vu: performance.now(), oublie: false, garde: !!garder };
      R.pret = new Promise(r => R.fin = r);
      const vivant = () => !R.oublie;
      R.remplir = () => { while (!R.oublie && R.bufs.length + R.attente < N) { R.attente++;
        calculer({ type: "pas", P: R.P, seed: ++seed, sr: ac.sampleRate }, vivant).then(y => { R.attente--; if (R.oublie) return;
          if (!y) { R.fin(); return; }   // calcul impossible (réglages hors limites) : on n'insiste pas
          R.bufs.push(versBuffer(y)); if (R.bufs.length >= Math.min(N, 3)) R.fin(); R.remplir(); }); } };
      reserves.set(k, R); R.remplir();
      // trop de sols en mémoire : on oublie le plus ancien, jamais le sol actuel ni un sol préchargé
      if (reserves.size > MAX_SOLS) {
        const actuel = reglages ? [cleSol(Object.assign({}, reglages, { distance: 0 })), cleSol(Object.assign({}, enCourse(reglages), { distance: 0 }))] : [];
        const vieux = [...reserves.values()].filter(x => x !== R && !x.garde && !actuel.includes(x.k)).sort((a, b) => a.vu - b.vu)[0];
        if (vieux) { vieux.oublie = true; reserves.delete(vieux.k); vieux.fin(); }
      }
      return R;
    }

    // l'écho de la pièce : calculé dans le Worker, une seule fois même si on appelle surface() puis piece() d'affilée
    function demanderPiece(Q) {
      pieceVoulue = Object.assign({}, Q, { distance: 0 });
      if (pieceEnCours) return; pieceEnCours = true;
      Promise.resolve().then(function suivant() {
        const Qp = pieceVoulue, key = CLES_PIECE.filter(k => k !== "mix").map(k => Qp[k]).join(",");
        if (key === pieceAppliquee) { wet.gain.value = sec * Qp.mix; pieceEnCours = false; return; }
        calculer({ type: "piece", P: Qp, sr: ac.sampleRate }).then(R => {
          if (!R) { pieceEnCours = false; return; }
          const b = ac.createBuffer(2, R.ir[0].length, ac.sampleRate); b.copyToChannel(R.ir[0], 0); b.copyToChannel(R.ir[1], 1);
          conv.buffer = b; sec = R.sec; wet.gain.value = sec * Qp.mix; api.echo = R.T; pieceAppliquee = key;
          if (pieceVoulue !== Qp) suivant(); else pieceEnCours = false;
        });
      });
    }
    const piecePrete = () => new Promise(r => { const t = () => (!pieceEnCours ? r() : setTimeout(t, 20)); t(); });

    const api = {
      ac,
      /** nœud d'entrée (volume + limiteur) : y relier un PannerNode 3D passé en `sortie` à jouer() */
      entree: master,
      /** durée de l'écho de la pièce actuelle (s) */
      echo: 0,
      /** Change de sol : nom d'un réglage tout prêt, objet de réglages, ou JSON de l'atelier. La pièce reste celle d'avant. */
      surface(nom, extra) {
        const P = base(nom, extra), ex = extra && extra.changements ? extra.changements : extra, nm = nom && typeof nom === "object" ? (nom.changements || nom) : null;
        if (reglages) for (const k of CLES_PIECE) if (!(ex && k in ex) && !(nm && k in nm)) P[k] = reglages[k];   // la pièce actuelle reste, sauf si on en donne une
        reglages = P; reserve(enCourse(P), true, true); const R = reserve(P, true, true);   // marche et course prêtes
        demanderPiece(P); return R.pret;
      },
      /** Change la pièce : { longueur, largeur, hauteur (m), absorption 0,03–0,9, clarte, mix } ou le nom d'un réglage (sa pièce). */
      piece(q) {
        const Q = typeof q === "string" ? Object.fromEntries(CLES_PIECE.map(k => [k, Pas.preset(q)[k]])) : q;
        reglages = Object.assign({}, reglages, Q); demanderPiece(reglages); return piecePrete();
      },
      /** Prépare d'avance un autre sol (ex. celui de la zone voisine) pour qu'il soit prêt dès le premier pas. */
      precharger(nom, extra) { const P = base(nom, extra); reserve(enCourse(P), true, true); return reserve(P, true, true).pret; },
      /** Joue un pas. o : { force 0–1,5 (1 = normal), cote −1/1 (pied), pan −1…1, distance (m, 0 = ses propres pas),
       *  course (bool), quand (temps AudioContext), sortie (nœud, ex. PannerNode relié à pas.entree), surface (pour un autre perso) } */
      jouer(q) {
        q = q || {};
        if (ac.state !== "running" && !ac.startRendering) { ac.resume().catch(() => {}); if (ac.state !== "running") return false; }   // pas de pas empilés pendant la pause
        let P = q.surface ? base(q.surface) : reglages; if (!P) return false;
        const Pm = P; if (q.course) P = enCourse(P);
        let R = reserve(P);
        // sol pas encore prêt : un pas de la marche du même sol, sinon du sol actuel (le Worker remplit la vraie réserve en attendant)
        if (!R.bufs.length) for (const Q of [Pm, reglages]) { const Ra = Q && reserve(Q, false); if (Ra && Ra.bufs.length) { R = Ra; break; } }
        if (!R.bufs.length) {
          if (q.surface) return false;   // un autre personnage sur un sol pas encore prêt : on saute ce pas plutôt que de faire saccader le jeu
          R.bufs.push(versBuffer(Pas.rendre(R.P, ++seed, { sr: ac.sampleRate })));   // les pas du joueur, tout premier pas : calculé tout de suite
        }
        let i = Math.floor(Math.random() * R.bufs.length); if (R.bufs.length > 1 && R.bufs[i] === R.dernier) i = (i + 1) % R.bufs.length;
        const buf = R.bufs.splice(i, 1)[0]; R.dernier = buf; R.remplir();   // retirée tout de suite : jamais rejouée, et remplacée
        const src = ac.createBufferSource(); src.buffer = buf;
        src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.012;           // ±1 % : imperceptible en hauteur
        const g = ac.createGain(), force = Math.max(0, q.force == null ? 1 : q.force), d = Math.max(1.6, q.distance || 0);
        g.gain.value = Math.pow(force, 1.3) * (q.cote === -1 ? 0.95 : 1) * 1.6 / d;   // son direct : 1/distance
        src.connect(g); let n = g;
        if (d > 3) { const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.max(3500, 18000 - 450 * d); n.connect(lp); n = lp; }   // l'air absorbe les aigus
        if (q.sortie) n.connect(q.sortie);
        else { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, q.pan != null ? q.pan : (q.cote || 0) * 0.06)); n.connect(p); p.connect(master); }
        // l'écho de la pièce ne baisse presque pas avec la distance (c'est ce qui donne l'impression d'éloignement)
        const s = ac.createGain(); s.gain.value = Math.pow(force, 1.3); src.connect(s); s.connect(wet);
        src.start(q.quand || ac.currentTime + 0.003);
        return true;
      },
      /** Rappel prêt à brancher sur boite-a-outils/promenade (option pas: …). */
      pourPromenade(opts) {
        opts = opts || {};
        return p => api.jouer({ force: (opts.force || 1) * (0.7 + 0.3 * (p.force == null ? 1 : p.force)), cote: p.cote, course: !!p.course });
      },
      volume(v) { master.gain.value = v; },
      reglages: () => Object.assign({}, reglages),
      get pret() { return reglages ? reserve(reglages).pret : Promise.resolve(); },
    };
    // réglages de départ : surface (nom) + reglages (modifications ou JSON de l'atelier), ou reglages seuls, ou le premier réglage
    if (o.surface || o.preset) api.surface(o.surface || o.preset, o.reglages);
    else api.surface(o.reglages || Object.keys(Pas.PRESETS)[0]);
    if (!o.ac && typeof document !== "undefined") ["pointerdown", "keydown", "touchstart"].forEach(ev => document.addEventListener(ev, function f() { document.removeEventListener(ev, f, true); ac.resume().catch(() => {}); }, true));
    return api;
  }

  return { creer, Pas, version: "1.1", reglagesPossibles: () => Object.keys(Pas.PRESETS) };
});
