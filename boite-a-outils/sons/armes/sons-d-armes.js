/* SonsDArmes — coups de feu et explosions physiques pour un jeu web, construits sur armes.js (à charger avant ce fichier).

   const armes = SonsDArmes.creer({ lieu: "Forêt" });                  // ou lieu: { …réglages du lieu… }
   await armes.charger("Pistolet 9 mm");                               // prépare d'avance (facultatif mais conseillé)
   armes.tirer("Pistolet 9 mm");                                       // c'est le joueur qui tire (vue du tireur)
   armes.tirer("Fusil d'assaut 5,56", { distance: 120, angle: 30, pan: -0.4 });   // un autre, à 120 m
   armes.rafale("Fusil d'assaut 7,62×39", { coups: 6, cadence: 600 });  // rafale (coups par minute)
   armes.action("Fusil à pompe 12", "pompe");                          // la pompe (aussi "culasse", "verrou", "clic")
   armes.tirer("Grenade à main", { distance: 25 });                    // une explosion
   armes.lieu("Intérieur — couloir");                                  // on change de lieu (réverbération)

   Chaque tir est calculé par le moteur physique (≈ 50 ms) dans un Worker : on garde d'avance quelques variantes par arme
   et par position d'écoute (tireur, près, loin… devant, à côté, derrière). Chaque variante jouée est remplacée par une
   nouvelle : on n'entend jamais deux fois le même coup. Le son direct passe par le panoramique (ou un PannerNode 3D) ;
   la réverbération du lieu arrive des deux côtés. Les sons lointains arrivent en retard (vitesse du son), et le claquement
   d'une balle supersonique arrive AVANT le coup de feu quand on est devant le tireur, comme en vrai. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./armes.js")); else root.SonsDArmes = factory(root.Armes);
})(typeof self !== "undefined" ? self : this, function (Armes) {
  "use strict";
  if (!Armes) throw new Error("SonsDArmes : charger armes.js avant sons-d-armes.js");
  const CLES_LIEU = Armes.PARAMS.filter(p => p[1] === "Lieu").map(p => p[0]);
  const DISTANCES = [1.5, 4, 10, 25, 60, 150, 400, 1000], ANGLES = [15, 90, 165];

  // ---------- Worker partagé ----------
  let worker = null, wId = 0, enVol = 0; const attentes = new Map(), file = [];
  const local = d => d.type === "action" ? Armes.actionLieu(d.P, d.quoi, d.seed, { sr: d.sr }) : Armes.tir(d.P, d.seed, { sr: d.sr });
  function demarrerWorker() {
    if (worker !== null) return worker;
    try {
      const src = "self.Armes = (" + Armes.__fabrique.toString() + ")();\n" +
        "self.onmessage = e => { const d = e.data; try {\n" +
        "  const R = d.type === 'action' ? self.Armes.actionLieu(d.P, d.quoi, d.seed, { sr: d.sr }) : self.Armes.tir(d.P, d.seed, { sr: d.sr });\n" +
        "  self.postMessage({ id: d.id, R }, [R.sec.buffer, R.env[0].buffer, R.env[1].buffer]);\n" +
        "} catch (err) { self.postMessage({ id: d.id, erreur: String(err) }); } };";
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      worker.onmessage = e => { const a = attentes.get(e.data.id); enVol--; if (a) { attentes.delete(e.data.id);
        if (e.data.erreur) { console.warn("SonsDArmes : calcul impossible", e.data.erreur); a.res(null); } else a.res(e.data.R); } pomper(); };
      worker.onerror = () => { worker = false; const restes = [...attentes.values(), ...file.splice(0)]; attentes.clear(); restes.forEach(a => tard(() => a.res(local(a.d)))); };
    } catch (e) { worker = false; }
    return worker;
  }
  const tard = f => setTimeout(() => { try { f(); } catch (e) { console.warn(e); } }, 0);
  function pomper() {
    while (worker && enVol < 2 && file.length) {
      const a = file.shift(); if (a.vivant && !a.vivant()) { a.res(null); continue; }
      const id = ++wId; attentes.set(id, a); enVol++; worker.postMessage(Object.assign({ id }, a.d));
    }
  }
  function calculer(d, vivant, urgent) {
    const w = typeof Worker !== "undefined" && Armes.__fabrique ? demarrerWorker() : false;
    return new Promise(res => {
      if (w) { const a = { res, d, vivant }; if (urgent) file.unshift(a); else file.push(a); pomper(); }
      else tard(() => { if (vivant && !vivant()) return res(null); try { res(local(d)); } catch (e) { console.warn(e); res(null); } });
    });
  }

  function creer(o) {
    o = o || {};
    const ac = o.ac || new (window.AudioContext || window.webkitAudioContext)(), N = o.variantes || 3, dyn = o.dynamique == null ? 0.3 : o.dynamique;
    const master = ac.createGain(); master.gain.value = o.volume == null ? 0.9 : o.volume;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.0005; lim.release.value = 0.15;
    master.connect(lim).connect(o.sortie || ac.destination);
    let lieu = Object.fromEntries(CLES_LIEU.map(k => [k, Armes.DEFAUT[k]])), seed = (o.graine || ((Math.random() * 1e6) | 0)) * 1000, generation = 0;
    const reserves = new Map();

    const versBuf = (a, b) => { const B = ac.createBuffer(b ? 2 : 1, a.length, ac.sampleRate); B.copyToChannel(a, 0); if (b) B.copyToChannel(b, 1); return B; };
    function arme(nom) {
      if (nom && typeof nom === "object" && nom.depart) return Object.assign(Armes.preset(nom.depart), nom.changements || {});
      if (typeof nom === "string") { if (!Armes.PRESETS[nom]) throw new Error("SonsDArmes : arme inconnue « " + nom + " » — possibles : " + Object.keys(Armes.PRESETS).join(", ")); return Armes.preset(nom); }
      return Object.assign({}, Armes.DEFAUT, nom || {});
    }
    // position d'écoute ramenée à une « case » (distance et angle arrondis) : quelques variantes calculées par case
    function cas(P, q) {
      const moi = !q.distance || q.distance < 1, d = moi ? 0 : DISTANCES.reduce((a, b) => Math.abs(Math.log(b / q.distance)) < Math.abs(Math.log(a / q.distance)) ? b : a);
      const an = moi ? 170 : ANGLES.reduce((a, b) => Math.abs(b - (q.angle || 0)) < Math.abs(a - (q.angle || 0)) ? b : a);
      const Pq = Object.assign({}, P, lieu, moi ? { tireur: 1, distance: P.type >= 0.5 ? 6 : 0.6, angle: 170 } : { tireur: 0, distance: d, angle: P.type >= 0.5 ? 0 : an });
      return { Pq, k: generation + "|" + JSON.stringify(P) + "|" + d + "|" + an, d: Pq.distance, moi };
    }
    function reserve(c, creer) {
      let R = reserves.get(c.k); if (R || !creer) return R;
      R = { k: c.k, P: c.Pq, bufs: [], attente: 0, oublie: false, gen: generation }; R.pret = new Promise(r => R.fin = r);
      R.remplir = () => { while (!R.oublie && R.bufs.length + R.attente < N) { R.attente++;
        calculer({ type: "tir", P: R.P, seed: ++seed, sr: ac.sampleRate }, () => !R.oublie && R.gen === generation, c.moi).then(T => { R.attente--;
          if (!T || R.oublie) { R.fin(); return; } R.bufs.push({ sec: versBuf(T.sec), env: versBuf(T.env[0], T.env[1]), retard: T.retard }); R.fin(); R.remplir(); }); } };
      reserves.set(c.k, R); R.remplir();
      if (reserves.size > 60) { const v = reserves.values().next().value; if (v !== R) { v.oublie = true; reserves.delete(v.k); } }
      return R;
    }
    function jouerVariante(V, q, d, dr, Pq) {
      const t = q.quand || ac.currentTime + 0.005, vol = q.volume == null ? 1 : q.volume;
      // correction de distance à l'intérieur d'une case : 1/r pour le son direct, réverbération presque constante
      const r = q.distance && q.distance >= 1 ? q.distance : d, gD = dr ? d / r : 1, gE = Math.sqrt(1 + (d / Pq.portee) ** 2) / Math.sqrt(1 + (r / Pq.portee) ** 2);
      const gDyn = Math.pow(Math.max(1, r), dyn * 0.5);   // « dynamique » : les tirs lointains un peu moins faibles qu'en vrai (jouabilité)
      const retard = q.retard === false ? 0 : Math.max(0, V.retard + (r - d) / 343);
      const s1 = ac.createBufferSource(); s1.buffer = V.sec; const g1 = ac.createGain(); g1.gain.value = vol * gD * gDyn; s1.connect(g1);
      if (q.sortie) g1.connect(q.sortie); else { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, q.pan || 0)); g1.connect(p).connect(master); }
      const s2 = ac.createBufferSource(); s2.buffer = V.env; const g2 = ac.createGain(); g2.gain.value = vol * gE * gDyn; s2.connect(g2).connect(master);
      const r0 = 1 + (Math.random() * 2 - 1) * 0.01; s1.playbackRate.value = r0; s2.playbackRate.value = r0;
      s1.start(t + retard); s2.start(t + retard);
      return true;
    }

    const api = {
      ac, entree: master,
      /** Change de lieu : nom d'un réglage tout prêt (ses réglages de lieu) ou objet { lieu, queue, queueT, … }. */
      lieu(q) {
        if (typeof q === "string" && !Armes.LIEUX[q]) throw new Error("SonsDArmes : lieu inconnu « " + q + " » — possibles : " + Object.keys(Armes.LIEUX).join(", "));
        const Q = typeof q === "string" ? Armes.LIEUX[q] : q || {};
        for (const k of CLES_LIEU) if (k in Q) lieu[k] = Q[k];
        generation++; for (const R of reserves.values()) R.oublie = true; reserves.clear();
      },
      /** Prépare une arme : vue du tireur et, si on donne des distances, des positions d'écoute (ex. [25, 150]). */
      charger(nom, opts) {
        opts = opts || {}; const P = arme(nom), ps = [reserve(cas(P, {}), true).pret];
        for (const d of opts.distances || []) for (const a of opts.angles || [15]) ps.push(reserve(cas(P, { distance: d, angle: a }), true).pret);
        return Promise.all(ps);
      },
      /** Un coup de feu (ou une explosion). q : { distance (m ; absent = c'est moi qui tire), angle (° depuis l'axe du canon :
       *  0 = devant, 90 = à côté, 180 = derrière), pan −1…1, sortie (PannerNode relié à armes.entree), quand, volume,
       *  retard (false = ignorer le temps de vol du son) } */
      tirer(nom, q) {
        q = q || {}; if (ac.state !== "running") { ac.resume().catch(() => {}); if (ac.state !== "running") return false; }
        const P = arme(nom), c = cas(P, q); let R = reserve(c, true);
        if (!R.bufs.length) {
          if (!c.moi) return false;   // un autre tireur, sons pas encore prêts : on saute plutôt que de faire saccader le jeu
          const T = Armes.tir(c.Pq, ++seed, { sr: ac.sampleRate });   // tout premier tir du joueur : calculé tout de suite
          R.bufs.push({ sec: versBuf(T.sec), env: versBuf(T.env[0], T.env[1]), retard: T.retard });
        }
        const V = R.bufs.splice(Math.floor(Math.random() * R.bufs.length), 1)[0]; R.remplir();
        return jouerVariante(V, q, c.d, !c.moi, c.Pq);
      },
      /** Rafale : coups (nombre), cadence (coups par minute). Chaque coup est une variante différente. */
      rafale(nom, q) {
        q = Object.assign({ coups: 5, cadence: 650 }, q || {}); const t0 = q.quand || ac.currentTime + 0.01, dt = 60 / q.cadence; let n = 0;
        for (let i = 0; i < q.coups; i++) if (api.tirer(nom, Object.assign({}, q, { quand: t0 + i * dt * (1 + (Math.random() - 0.5) * 0.04) }))) n++;
        return n;
      },
      /** Bruit de manipulation : "pompe", "culasse", "verrou" ou "clic" (à vide). q : { distance, pan, sortie, quand } */
      action(nom, quoi, q) {
        q = q || {}; const P = Object.assign(arme(nom), lieu, { tireur: q.distance ? 0 : 1, distance: q.distance || 0.4 });
        return calculer({ type: "action", P, quoi: quoi || "clic", seed: ++seed, sr: ac.sampleRate }, null, true).then(R => {
          if (!R) return false; const t = q.quand || ac.currentTime + 0.005, v = q.volume == null ? 1 : q.volume;
          const s = ac.createBufferSource(); s.buffer = versBuf(R.sec); const g = ac.createGain(); g.gain.value = v; s.connect(g);
          if (q.sortie) g.connect(q.sortie); else { const p = ac.createStereoPanner(); p.pan.value = q.pan || 0; g.connect(p).connect(master); }
          const e = ac.createBufferSource(); e.buffer = versBuf(R.env[0], R.env[1]); const ge = ac.createGain(); ge.gain.value = v; e.connect(ge).connect(master);
          s.start(t); e.start(t); return true; });
      },
      volume(v) { master.gain.value = v; },
      armes: () => Object.keys(Armes.PRESETS), lieux: () => Object.keys(Armes.LIEUX),
    };
    if (o.lieu) api.lieu(o.lieu);
    if (!o.ac && typeof document !== "undefined") ["pointerdown", "keydown", "touchstart"].forEach(ev => document.addEventListener(ev, function f() { document.removeEventListener(ev, f, true); ac.resume().catch(() => {}); }, true));
    return api;
  }
  return { creer, Armes, version: "1.0" };
});
