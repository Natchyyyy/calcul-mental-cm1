/* Chargeur des modèles 3D faits avec glb_en_js.py (three.js + GLTFLoader déjà chargés).
   Modeles.charger(["arbre", "maison"], (fait, total) => …) → Promise ; puis Modeles.copie("arbre", largeur, hauteur)
   renvoie une copie posée au sol (bas à y = 0), centrée, mise à l'échelle dans la boîte largeur × hauteur.
   Les copies partagent géométrie et textures (peu de mémoire). Un modèle manquant ne bloque rien : copie() renvoie null. */
const Modeles = (() => {
  const data = {}, cache = {}; let base = "modeles/";
  window.MODELES_ADD = (k, b64) => { data[k] = b64; };
  const unFichier = k => new Promise(res => { if(cache[k] || data[k]) return res();
    const s = document.createElement("script"); let fini = false; const fin = () => { if(!fini){ fini = true; s.remove(); res(); } };
    s.onload = fin; s.onerror = fin; setTimeout(fin, 30000); s.src = base + k + ".js"; document.head.appendChild(s); });
  const decoder = (L, k) => new Promise(res => { if(cache[k] || !data[k]) return res();
    const s = atob(data[k]), u = new Uint8Array(s.length); for(let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    L.parse(u.buffer, "", g => { g.scene.traverse(o => { if(o.isMesh){ o.castShadow = o.receiveShadow = true; } }); cache[k] = g.scene; delete data[k]; res(); }, e => { console.warn("modèle", k, e); delete data[k]; res(); }); });
  function charger(noms, prog){
    const Loader = (window.THREE && THREE.GLTFLoader) || (window.THREEX && THREEX.GLTFLoader); if(!Loader) return Promise.resolve();
    const L = new Loader(); let i = 0, n = 0, actifs = 0;
    return new Promise(fin => { const suite = () => { if(i >= noms.length && !actifs) return fin();
      while(actifs < 4 && i < noms.length){ const k = noms[i++]; actifs++; unFichier(k).then(() => decoder(L, k)).then(() => { actifs--; n++; prog && prog(n, noms.length); suite(); }); } }; suite(); });
  }
  function copie(k, w, h){
    const src = cache[k]; if(!src) return null; const s = src.clone(true), box = new THREE.Box3().setFromObject(s), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const sc = Math.min(h/sz.y, w/Math.max(sz.x, sz.z)), g = new THREE.Group(); s.position.set(-c.x, -box.min.y, -c.z); const inner = new THREE.Group(); inner.add(s); inner.scale.setScalar(sc); g.add(inner);
    g.userData.taille = sz.multiplyScalar(sc); return g;
  }
  return {charger, copie, a: k => !!cache[k], set base(b){ base = b; }};
})();
window.Modeles = Modeles;
