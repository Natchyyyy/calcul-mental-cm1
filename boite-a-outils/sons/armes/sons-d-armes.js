/* SonsDArmes 2 — coups de feu pour un jeu web : VRAIS enregistrements + physique de l'espace.

   Les coups eux-mêmes sont de vrais tirs enregistrés (Free Firearm Sound Library, CC0), pris derrière le tireur, de près,
   à mi-distance et de loin. La physique (armes.js) s'occupe de ce qui dépend de l'endroit : distance (niveau, air qui
   avale les aigus, retard du son), claquement de la balle qui arrive avant le coup quand on est devant le canon,
   côté ou arrière du tireur plus sourd, réverbération du lieu (forêt, rue, vallée, pièce, couloir, bunker…).

   charger dans la page : armes.js, puis sons-d-armes.js, puis banque/banque-data.js (page en un seul fichier),
   ou bien passer banque: "banque/" (les fichiers .ogg et banque.json à côté de la page)
   const armes = SonsDArmes.creer({ lieu: "Forêt" });                       // banque : window.BANQUE_ARMES par défaut
   await armes.charger("Fusil d'assaut 5,56");
   armes.tirer("Fusil d'assaut 5,56");                                      // c'est le joueur qui tire
   armes.tirer("Fusil d'assaut 7,62×39", { distance: 120, angle: 10 });     // un ennemi à 120 m qui tire vers nous
   armes.rafale("Pistolet-mitrailleur 9 mm", { coups: 6 });
   armes.action("Fusil à pompe 12", "pompe");                               // "pompe", "culasse", "verrou", "chargeur", "clic", "cartouche"
   armes.tirer("Grenade à main", { distance: 25 });
   armes.lieu("Intérieur — couloir");                                       */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./armes.js")); else root.SonsDArmes = factory(root.Armes);
})(typeof self !== "undefined" ? self : this, function (Armes) {
  "use strict";
  if (!Armes) throw new Error("SonsDArmes : charger armes.js avant sons-d-armes.js");
  const CLES_LIEU = Armes.PARAMS.filter(p => p[1] === "Lieu").map(p => p[0]), STAND = "Stand de tir (plein air)";
  let INTERIEUR = 0.045;   // calé : réverbération d'une pièce ≈ −20 dB 0,1 s après le coup (couloir)
  // niveau de chaque arme (dB) par rapport au fusil d'assaut : ce qu'on entend dans la réalité, en un peu resserré
  const NIVEAU = { "Pistolet 9 mm": -3, "Pistolet-mitrailleur 9 mm": -2, "Fusil d'assaut 5,56": 0, "Fusil d'assaut 7,62×39": 0.5,
    "Fusil de précision 7,62×54": 2, "Fusil à pompe 12": 1, "Grenade à main": 3, "Explosion lourde": 6 };
  const CADENCE = { "Pistolet-mitrailleur 9 mm": 600, "Fusil d'assaut 5,56": 750, "Fusil d'assaut 7,62×39": 600 };
  // pour la physique (claquement, directivité) : vitesse de la balle et réglages du moteur
  const PHYS = { "Pistolet 9 mm": "Pistolet 9 mm", "Pistolet-mitrailleur 9 mm": "Pistolet-mitrailleur 9 mm", "Fusil d'assaut 5,56": "Fusil d'assaut 5,56",
    "Fusil d'assaut 7,62×39": "Fusil d'assaut 7,62×39", "Fusil de précision 7,62×54": "Fusil de précision 7,62×54", "Fusil à pompe 12": "Fusil à pompe 12" };
  const b64 = s => { const t = atob(s), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u.buffer; };

  function creer(o) {
    o = o || {};
    const ac = o.ac || new (window.AudioContext || window.webkitAudioContext)();
    const dyn = o.dynamique == null ? 0.5 : o.dynamique, NREF = -16;
    let punch = o.graves == null ? 0.6 : o.graves;   // renfort de graves des jeux (0 = son brut des enregistrements)
    const expo = 1 - 0.6 * dyn, retardOn = o.retard !== false, reverb = o.reverb == null ? 1 : o.reverb;
    const src = o.banque || (typeof window !== "undefined" && window.BANQUE_ARMES);
    if (!src) throw new Error("SonsDArmes : banque introuvable — charger banque/banque-data.js ou passer banque: \"chemin/vers/banque/\"");
    const master = ac.createGain(); master.gain.value = o.volume == null ? 0.8 : o.volume;
    const lim = ac.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 3; lim.ratio.value = 12; lim.attack.value = 0.001; lim.release.value = 0.2;
    master.connect(lim).connect(o.sortie || ac.destination);
    // réverbération du lieu : une seule convolution partagée, calculée par le moteur physique
    const conv = ac.createConvolver(); conv.normalize = false; const envoi = ac.createGain(); envoi.connect(conv).connect(master);
    let lieuP = Object.assign({}, Armes.DEFAUT, Armes.LIEUX[STAND]), lieuNom = STAND, lieuPret = Promise.resolve();
    let banque = null; const tampons = new Map(), dernier = new Map();
    const pretBanque = (async () => {
      if (typeof src === "string") { const r = await fetch(src.replace(/\/?$/, "/") + "banque.json"); banque = await r.json(); banque.base = src.replace(/\/?$/, "/"); }
      else banque = src.json ? Object.assign({}, src.json, { ogg: src.ogg }) : src;
    })();
    async function tampon(f) {
      if (tampons.has(f)) return tampons.get(f);
      const p = (async () => { const data = banque.ogg ? b64(banque.ogg[f]) : await (await fetch(banque.base + f)).arrayBuffer(); return await ac.decodeAudioData(data); })();
      tampons.set(f, p); try { const b = await p; tampons.set(f, b); return b; } catch (e) { tampons.delete(f); throw e; }
    }
    const pret = v => { const t = tampons.get(v.f); return t && !(t instanceof Promise) ? t : null; };
    const W = nom => { const w = banque && banque.armes[nom]; if (!w) throw new Error("SonsDArmes : arme inconnue « " + nom + " » — possibles : " + (banque ? Object.keys(banque.armes).join(", ") : "(banque pas encore chargée)")); return w; };

    // perspective d'écoute → quelle série d'enregistrements
    function perspective(w, q) {
      if (w.explosion) return "proche";
      if (!q.distance || q.distance < 1) return "tireur";
      return q.distance < 10 ? "proche" : q.distance < 50 ? "moyen" : "loin";
    }
    function choisir(nom, L) {   // une variante prête, jamais deux fois de suite la même
      const ok = L.filter(pret); if (!ok.length) return null; let v = ok[Math.floor(Math.random() * ok.length)];
      if (ok.length > 1 && v === dernier.get(nom)) v = ok[(ok.indexOf(v) + 1) % ok.length]; dernier.set(nom, v); return v;
    }
    function filtrer(n, type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; n.connect(b); return b; }

    const api = {
      ac, entree: master,
      get lieuActuel() { return lieuNom; },
      /** Change de lieu : nom (voir lieux()) ou objet de réglages du groupe Lieu de armes.js. */
      lieu(q) {
        if (typeof q === "string" && !Armes.LIEUX[q]) throw new Error("SonsDArmes : lieu inconnu « " + q + " » — possibles : " + Object.keys(Armes.LIEUX).join(", "));
        lieuNom = typeof q === "string" ? q : "perso"; lieuP = Object.assign({}, Armes.DEFAUT, typeof q === "string" ? Armes.LIEUX[q] : q);
        lieuPret = new Promise(res => setTimeout(() => {
          try { const R = Armes.reponseLieu(lieuP, 10, ac.sampleRate, 0), b = ac.createBuffer(2, R.ir[0].length, ac.sampleRate);
            b.copyToChannel(R.ir[0], 0); b.copyToChannel(R.ir[1], 1); conv.buffer = b; } catch (e) { console.warn(e); }
          res();
        }, 0));
        return lieuPret;
      },
      /** Charge les enregistrements d'une arme (toutes les positions) : à faire avant le premier tir. */
      async charger(nom) {
        await pretBanque; const w = W(nom), L = [...Object.values(w.tirs).flat(), ...Object.values(w.actions || {}).flat()];
        await Promise.all(L.map(v => tampon(v.f).catch(() => null))); await lieuPret;
      },
      /** Un coup. q : { distance (m ; absent = c'est moi qui tire), angle (0 = devant le canon, 90 = à côté, 180 = derrière),
       *  pan −1…1, sortie (PannerNode relié à armes.entree), quand, volume, retard (false : pas de temps de vol) } */
      tirer(nom, q) {
        q = q || {}; if (ac.state !== "running" && !ac.startRendering) { ac.resume().catch(() => {}); if (ac.state !== "running") return false; }
        if (!banque) return false;
        const w = W(nom), pos = perspective(w, q), moi = pos === "tireur", ang = moi ? 170 : (q.angle || 0);
        const r = moi ? 1 : Math.max(1, q.distance || (w.explosion ? 15 : 4)), rnom = w.explosion ? 15 : banque.rnom[pos];
        // la balle claque-t-elle ici ? (devant le tireur, dans le cône de Mach, balle supersonique)
        let avance = 0;
        if (!moi && !w.explosion && PHYS[nom]) { const f = Armes.fiche(Object.assign(Armes.preset(PHYS[nom]), { distance: r, angle: ang })); if (f.claque) avance = Math.max(0, f.avanceClaqueMs / 1000); }
        let L = w.tirs[pos] || [];
        if (avance > 0 && !L.some(v => v.claque)) { const Lc = [...(w.tirs.moyen || []), ...(w.tirs.loin || [])].filter(v => v.claque); if (Lc.length && r > 20) L = Lc; }
        const v = choisir(nom, L); if (!v) { if (!tampons.size) api.charger(nom); return false; }
        const buf = pret(v), t0 = q.quand || ac.currentTime + 0.01, vol = q.volume == null ? 1 : q.volume;
        // niveau : chaque enregistrement ramené au même niveau, puis arme, puis distance (loi 1/r adoucie par « dynamique »)
        const dBd = moi ? 0 : -20 * expo * Math.log10(r / 3);
        const gDirect = vol * Math.pow(10, (NREF - v.niveau + (NIVEAU[nom] || 0) + dBd) / 20);
        const tVol = retardOn && !moi ? r / 343 : 0;
        // chaîne du son direct : (air au-delà de la distance d'enregistrement) → (arrière du tireur plus sourd) → panoramique
        const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.015;
        const g = ac.createGain(); g.gain.value = gDirect; s.connect(g); let n = g;
        if (r > rnom * 1.3) { let fc = 500; while (fc < 20000 && Armes.absAir(fc) * (r - rnom) < 3) fc *= 1.06; if (fc < 18000) n = filtrer(n, "lowpass", fc, 0.6); }
        if (ang > 75 && !moi && !w.explosion) { const k = (ang - 75) / 105; n = filtrer(n, "highshelf", 2500); n.gain.value = -10 * k; const g2 = ac.createGain(); g2.gain.value = Math.pow(10, -5 * k / 20); n.connect(g2); n = g2; }
        if (q.sortie) n.connect(q.sortie); else { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, q.pan || 0)); n.connect(p).connect(master); }
        // claquement plus en avance que dans l'enregistrement : on joue le claquement, puis le coup plus tard
        const coupe = v.coup_s || 0, extra = v.claque && avance > coupe ? Math.min(2, avance - coupe) : 0;
        const sansClaque = v.claque && avance === 0, debut = sansClaque ? Math.max(0, coupe - 0.002) : 0;
        // réverbération : au stand de tir, la vraie queue est dans l'enregistrement ; ailleurs on coupe à 0,12 s et le lieu prend le relais
        const auStand = lieuNom === STAND, finDirect = auStand || w.explosion ? buf.duration : 0.12 + coupe;
        const t = t0 + tVol;
        if (extra > 0) {
          const s2 = ac.createBufferSource(); s2.buffer = buf; s2.playbackRate.value = s.playbackRate.value; s2.connect(g);
          s.start(t, 0, coupe); s2.start(t + extra, coupe, finDirect - coupe);
        } else s.start(t, debut, finDirect - debut);
        if (!auStand) {
          if (!w.explosion) { g.gain.setValueAtTime(gDirect, t + extra + finDirect - debut - 0.02); g.gain.linearRampToValueAtTime(0, t + extra + finDirect - debut); }
          const e = ac.createBufferSource(); e.buffer = buf; e.playbackRate.value = s.playbackRate.value;
          const ge = ac.createGain(), P = lieuP.portee || 150;
          // envoi calé pour que la queue calculée du stand ait le niveau de la vraie ; en intérieur, la pièce répond plus fort
          // pour la même source (voir INTERIEUR) ; la réverbération ne baisse presque pas avec la distance
          // (le niveau de référence est celui de l'enregistrement à SA distance : la queue suit l'enregistrement, pas l'oreille)
          const dBnom = moi ? 0 : -20 * expo * Math.log10(rnom / 3);
          ge.gain.value = vol * Math.pow(10, (NREF - v.niveau + (NIVEAU[nom] || 0) + dBnom) / 20) * (banque.envoi[w.explosion ? "moyen" : pos] || 10) * (w.explosion ? 0.5 : 1)
            * Math.sqrt(1 + (rnom / P) ** 2) / Math.sqrt(1 + (r / P) ** 2) * (lieuP.lieu >= 0.5 ? INTERIEUR : 1) * reverb;
          e.connect(ge).connect(envoi); e.start(t + extra, Math.max(debut, coupe - 0.002), w.explosion ? 0.4 : 0.12);
        }
        // renfort de graves (comme dans les jeux : les micros et les haut-parleurs perdent le « coup dans la poitrine ») :
        // un coup sourd de 45–90 Hz, surtout quand on est près ; il baisse vite avec la distance
        const kp = punch * (w.explosion ? 1.4 : 1) * (moi ? 1 : Math.min(1, 6 / r));
        if (kp > 0.02) {
          const os = ac.createOscillator(), go = ac.createGain(), t1 = t + extra + 0.002, f0 = w.explosion ? 70 : (nom.includes("9 mm") ? 110 : 85);
          os.frequency.setValueAtTime(f0, t1); os.frequency.exponentialRampToValueAtTime(f0 * 0.5, t1 + 0.12);
          const a = vol * kp * 0.5 * Math.pow(10, (NIVEAU[nom] || 0) / 20) * (moi ? 1 : Math.pow(10, dBd / 20));
          go.gain.setValueAtTime(0, t1); go.gain.linearRampToValueAtTime(a, t1 + 0.004); go.gain.exponentialRampToValueAtTime(a * 0.001, t1 + (w.explosion ? 0.6 : 0.18));
          os.connect(go); if (q.sortie) go.connect(q.sortie); else go.connect(master); os.start(t1); os.stop(t1 + (w.explosion ? 0.7 : 0.25));
        }
        return true;
      },
      /** Renfort de graves 0–1 (0 = enregistrements bruts). */
      graves(v) { if (v != null) punch = v; return punch; },
      /** Rafale : coups (nombre), cadence (coups/min, sinon celle de l'arme). Chaque coup est un enregistrement différent. */
      rafale(nom, q) {
        q = Object.assign({ coups: 5 }, q || {}); const cad = q.cadence || CADENCE[nom] || 400, t0 = q.quand || ac.currentTime + 0.02; let k = 0;
        for (let i = 0; i < q.coups; i++) if (api.tirer(nom, Object.assign({}, q, { quand: t0 + i * 60 / cad * (1 + (Math.random() - 0.5) * 0.05) }))) k++;
        return k;
      },
      /** Manipulation : "pompe", "culasse", "verrou", "chargeur", "clic", "cartouche" (voir actions(nom)). q : { distance, pan, sortie, quand, volume } */
      action(nom, quoi, q) {
        q = q || {}; if (!banque) return false; const w = W(nom), L = (w.actions || {})[quoi];
        if (!L || !L.length) throw new Error("SonsDArmes : pas de « " + quoi + " » pour " + nom + " — possibles : " + Object.keys(w.actions || {}).join(", "));
        const v = choisir(nom + quoi, L); if (!v) { api.charger(nom); return false; }
        const t = q.quand || ac.currentTime + 0.005, r = Math.max(0.5, q.distance || 0.5), g0 = (q.volume == null ? 1 : q.volume) * Math.pow(10, -12 / 20) * 0.5 / r;
        const s = ac.createBufferSource(); s.buffer = pret(v); const g = ac.createGain(); g.gain.value = g0; s.connect(g);
        if (q.sortie) g.connect(q.sortie); else { const p = ac.createStereoPanner(); p.pan.value = q.pan || 0; g.connect(p).connect(master); }
        const ge = ac.createGain(); ge.gain.value = g0 * (lieuNom === STAND ? 0.5 : 2); s.connect(ge).connect(envoi);
        s.start(t); return true;
      },
      armes: () => banque ? Object.keys(banque.armes) : [],
      actions: nom => banque ? Object.keys(W(nom).actions || {}) : [],
      lieux: () => Object.keys(Armes.LIEUX),
      cadence: nom => CADENCE[nom] || 0,
      volume(v) { master.gain.value = v; },
      pret: pretBanque,
    };
    api.lieu(o.lieu || STAND);
    if (!o.ac && typeof document !== "undefined") ["pointerdown", "keydown", "touchstart"].forEach(ev => document.addEventListener(ev, function f() { document.removeEventListener(ev, f, true); ac.resume().catch(() => {}); }, true));
    return api;
  }
  return { creer, Armes, version: "2.0", NIVEAU, CADENCE, _interieur(v) { if (v != null) INTERIEUR = v; return INTERIEUR; } };
});
