/* Promenade à la première personne pour three.js (repris de la salle des trophées, rodé).
   const P = Promenade(camera, renderer.domElement, {options}) ; puis dans la boucle : P.update(dt).
   - ZQSD / WASD / flèches pour marcher, Maj pour courir, souris pour regarder (verrou du pointeur après un clic) ;
     si le verrou est refusé : glisser avec la souris pour regarder.
   - Vitesse de la souris réglable (5 niveaux, touches + et −, gardée dans le navigateur) ; les sauts de souris sont écrêtés
     (certaines souris envoient parfois un énorme déplacement d'un coup).
   - Collisions : cercles (colonnes, meubles ronds), boîtes (meubles), limite de la pièce (rond ou rectangle).
   - Hauteur du sol variable (marches, estrade) via options.sol(x, z).
   - Balancement de tête léger et un rappel à chaque pas (pour jouer un son de pas, à gauche puis à droite).
   - Touche E (ou clic) : options.interagir(objetVisé) sur l'objet le plus proche dans le viseur (P.cibles = liste de meshes).
   options : {yeux: 1.6, marche: 1.35, course: 2.3, rayon: .3 (corps du joueur), limite: {type: "rond", r: 11} | {type: "boite", x0, x1, z0, z1},
              sol: (x, z) => hauteur, pas: ({cote, course, force}) => …, interagir: obj => …, portee: 3.2, actif: true} */
function Promenade(cam, dom, o = {}){
  const T = THREE, yeux = o.yeux ?? 1.6, MARCHE = o.marche ?? 1.35, COURSE = o.course ?? 2.3, R = o.rayon ?? .3;
  const LOOK = .0008, SENS = [.35, .6, 1, 1.5, 2.2]; let sensI = 2; try{ const v = localStorage.getItem("promenade-souris"); if(v !== null && SENS[+v]) sensI = +v; }catch(e){}
  const keys = {}, pos = new T.Vector3(cam.position.x, 0, cam.position.z), vel = new T.Vector2();
  let yaw = 0, pitch = 0, vy = o.sol ? o.sol(pos.x, pos.z) : 0, bob = Math.PI, side = 1, drag = null, actif = o.actif !== false;
  { const d = new T.Vector3(); cam.getWorldDirection(d); yaw = Math.atan2(-d.x, -d.z); }
  const P = {cercles: [], boites: [], cibles: [], vise: null, get sensibilite(){ return sensI; }, get pos(){ return pos; }};
  const verrouille = () => document.pointerLockElement === dom;
  const regarder = () => cam.quaternion.setFromEuler(new T.Euler(pitch, yaw, 0, "YXZ"));
  function setSens(i){ sensI = Math.max(0, Math.min(SENS.length - 1, i)); try{ localStorage.setItem("promenade-souris", sensI); }catch(e){} o.surSensibilite && o.surSensibilite(sensI, SENS.length); }
  const onMove = e => { if(!actif || !verrouille()) return; const k = LOOK*SENS[sensI], mx = Math.max(-80, Math.min(80, e.movementX || 0)), my = Math.max(-80, Math.min(80, e.movementY || 0));
    yaw -= mx*k; pitch = Math.max(-1.3, Math.min(1.3, pitch - my*k)); regarder(); };
  const onKey = e => { const down = e.type === "keydown"; keys[e.code] = down; if(!down || !actif) return;
    if(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if(e.key === "+" || e.code === "NumpadAdd") setSens(sensI + 1); if(e.key === "-" || e.code === "NumpadSubtract") setSens(sensI - 1);
    if(e.code === "KeyE" && P.vise && o.interagir) o.interagir(P.vise); };
  const onDown = e => { if(!actif) return; if(!verrouille()){ try{ const r = dom.requestPointerLock(); if(r && r.catch) r.catch(() => {}); }catch(_){} drag = {x: e.clientX, y: e.clientY}; } else if(P.vise && o.interagir) o.interagir(P.vise); };
  const onDrag = e => { if(!drag || verrouille()) return; const k = LOOK*1.8*SENS[sensI]; yaw -= (e.clientX - drag.x)*k; pitch = Math.max(-1.3, Math.min(1.3, pitch - (e.clientY - drag.y)*k)); drag = {x: e.clientX, y: e.clientY}; regarder(); };
  const onUp = () => { drag = null; }, onBlur = () => { for(const k in keys) keys[k] = false; };
  document.addEventListener("mousemove", onMove); addEventListener("keydown", onKey); addEventListener("keyup", onKey); addEventListener("blur", onBlur);
  dom.addEventListener("pointerdown", onDown); dom.addEventListener("pointermove", onDrag); addEventListener("pointerup", onUp);
  function collisions(p){
    for(let it = 0; it < 3; it++){
      for(const [cx, cz, cr] of P.cercles){ const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), m = cr + R; if(d < m && d > 1e-4){ p.x = cx + dx/d*m; p.z = cz + dz/d*m; } }
      for(const b of P.boites){ const x0 = b.x0 - R, x1 = b.x1 + R, z0 = b.z0 - R, z1 = b.z1 + R; if(p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1){
        const dl = p.x - x0, dr = x1 - p.x, dn = p.z - z0, df = z1 - p.z, m = Math.min(dl, dr, dn, df);
        if(m === dl) p.x = x0; else if(m === dr) p.x = x1; else if(m === dn) p.z = z0; else p.z = z1; } }
    }
    const L = o.limite; if(L && L.type === "rond"){ const r = Math.hypot(p.x, p.z), mx = L.r - R; if(r > mx){ p.x *= mx/r; p.z *= mx/r; } }
    else if(L && L.type === "boite"){ p.x = Math.max(L.x0 + R, Math.min(L.x1 - R, p.x)); p.z = Math.max(L.z0 + R, Math.min(L.z1 - R, p.z)); }
  }
  const ray = new T.Raycaster(), centre = new T.Vector2(0, 0);
  P.update = dt => {
    if(!actif) return; dt = Math.min(dt, .05);
    const K = keys, av = (K.KeyW || K.KeyZ || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), la = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.KeyQ || K.ArrowLeft ? 1 : 0);
    const court = K.ShiftLeft || K.ShiftRight, sp = court ? COURSE : MARCHE, n = Math.hypot(av, la);
    const tx = n ? (av*-Math.sin(yaw) + la*Math.cos(yaw))/n*sp : 0, tz = n ? (av*-Math.cos(yaw) - la*Math.sin(yaw))/n*sp : 0, a = 1 - Math.exp(-dt*9);
    vel.x += (tx - vel.x)*a; vel.y += (tz - vel.y)*a;
    const old = pos.clone(); pos.x += vel.x*dt; pos.z += vel.y*dt; collisions(pos);
    const fy = o.sol ? o.sol(pos.x, pos.z) : 0; vy += (fy - vy)*(1 - Math.exp(-dt*10));
    const v = Math.hypot(pos.x - old.x, pos.z - old.z)/Math.max(dt, 1e-3), foulee = court ? .95 : .74, TAU = Math.PI*2, TALON = 1.5*Math.PI;
    if(v < .05) bob += (Math.PI - (bob % TAU))*Math.min(1, dt*4); const prev = bob; bob += v*dt*TAU/foulee;
    if(Math.floor((bob - TALON)/TAU) > Math.floor((prev - TALON)/TAU) && v > .2){ side = -side; o.pas && o.pas({cote: side, course: court, force: Math.min(1, v/MARCHE), x: pos.x, z: pos.z}); }
    const amp = Math.min(1.25, v/MARCHE), b = Math.sin(bob)*(court ? .036 : .028)*amp, sw = Math.sin(bob*.5)*.013*amp;
    cam.position.set(pos.x + sw*Math.cos(yaw), vy + yeux + b, pos.z - sw*Math.sin(yaw)); regarder();
    // objet visé (au centre de l'écran)
    P.vise = null; if(P.cibles.length){ ray.setFromCamera(centre, cam); ray.far = o.portee ?? 3.2; const h = ray.intersectObjects(P.cibles, true)[0];
      if(h){ let ob = h.object; while(ob && !P.cibles.includes(ob)) ob = ob.parent; P.vise = ob; } }
  };
  P.placer = (x, z, angle) => { pos.set(x, 0, z); if(angle != null) yaw = angle; vel.set(0, 0); vy = o.sol ? o.sol(x, z) : 0; };
  P.activer = on => { actif = on; if(!on){ try{ document.exitPointerLock(); }catch(e){} onBlur(); } else { const d = new T.Vector3(); cam.getWorldDirection(d); yaw = Math.atan2(-d.x, -d.z); pitch = 0; pos.set(cam.position.x, 0, cam.position.z); } };
  P.vitesseSouris = setSens;
  P.detruire = () => { document.removeEventListener("mousemove", onMove); removeEventListener("keydown", onKey); removeEventListener("keyup", onKey); removeEventListener("blur", onBlur);
    dom.removeEventListener("pointerdown", onDown); dom.removeEventListener("pointermove", onDrag); removeEventListener("pointerup", onUp); };
  regarder(); return P;
}
window.Promenade = Promenade;
