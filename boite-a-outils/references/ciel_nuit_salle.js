/* =====================================================================
   SALLE DES TROPHÉES — verrière et ciel de nuit
   window.SalleSky(S, THREE, C) : appelé par le décor.
   - une grande coupole vitrée (armature de laiton) remplace le haut du dôme ;
   - derrière le verre : un ciel de nuit calculé (étoiles de tailles et de couleurs
     différentes qui scintillent, Voie lactée avec ses nuages sombres, lune et halo,
     voiles de nuages qui passent, étoile filante de temps en temps) ;
   - un clair de lune bleuté éclaire la salle et descend dans le puits central.
   ===================================================================== */
window.SalleSky = function(S, THREE, C){
  "use strict";
  const TAU = Math.PI*2, R = C.R_WALL, H = C.H_WALL, TH0 = .2, TH_G = S.TH_G || 1.022, YS = .42;
  const now = () => (S.tManual != null ? S.tManual : performance.now()/1000);
  const root = new THREE.Group(); root.name = "ciel"; S.scene.add(root);
  const MOON = new THREE.Vector3(.38, .78, -.5).normalize();
  // la Grande Ourse (la « casserole ») : 7 étoiles brillantes, à l'opposé de la Lune, bien visibles à travers la verrière
  const DIP = (() => { const c = new THREE.Vector3().setFromSphericalCoords(1, deg2(25), deg2(328)), e = new THREE.Vector3(0, 1, 0).cross(c).normalize(), n = c.clone().cross(e).normalize();
    // positions approchées (degrés) : Dubhe, Merak, Phecda, Megrez, Alioth, Mizar, Alkaid ; éclat relatif
    return [[13, 3, 1], [12.4, -2.4, .85], [5, -4, .8], [3.6, .6, .6], [-2.2, 1.6, .95], [-7.6, 2.6, .9], [-13.4, -1.2, .92]].map(([x, y, m]) => { const v = c.clone().addScaledVector(e, Math.tan(deg2(x*1.3))).addScaledVector(n, Math.tan(deg2(y*1.3))).normalize(); return new THREE.Vector4(v.x, v.y, v.z, m); }); })();
  function deg2(a){ return a*Math.PI/180; }

  /* ---------- le ciel (sphère vue de l'intérieur, sans brouillard) ---------- */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { t: {value: 0}, moon: {value: MOON.clone()}, q: {value: S.quality == null ? 2 : S.quality}, zm: {value: 0}, dip: {value: DIP} },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform float t; uniform vec3 moon; uniform float q; uniform float zm; uniform vec4 dip[7]; varying vec3 vD;
      float h31(vec3 p){ p = fract(p*vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y)*p.z); }
      vec3 h33(vec3 p){ p = fract(p*vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx)*p.zyx); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
        return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = .5, s = 0.; for(int i=0;i<5;i++){ s += a*n3(p); p = p*2.03 + 1.7; a *= .5; } return s; }
      vec3 starTint(float k){ return k < .25 ? vec3(.72, .82, 1.) : k < .7 ? vec3(1., .97, .93) : k < .9 ? vec3(1., .86, .66) : vec3(1., .7, .55); }
      // une couche d'étoiles : une étoile au plus par cellule, placée loin des bords
      vec3 stars(vec3 d, float sc, float dens, float bright){
        vec3 p = d*sc, c = floor(p), f = fract(p) - .5; float r = h31(c);
        if(r > dens) return vec3(0.);
        vec3 o = (h33(c + 7.1) - .5)*.6; float dd = length(f - o);
        float mag = pow(h31(c + 3.3), 6.);                           // beaucoup de petites, peu de grosses
        float sz = mix(.03, .1, mag);
        float tw = .75 + .25*sin(t*(1.3 + 3.*h31(c + 1.7)) + 6.283*h31(c + 9.1));
        float core = smoothstep(sz, 0., dd);
        float glow = exp(-dd*dd/(sz*sz*5.))*.25*mag;
        return starTint(h31(c + 5.5))*(core*core + glow)*(.05 + bright*(.12 + mag*3.2))*tw;
      }
      void main(){
        vec3 d = normalize(vD);
        float up = clamp(d.y, -.2, 1.);
        // fond : bleu nuit profond, un peu plus clair vers l'horizon (lueur du ciel)
        vec3 col = mix(vec3(.0045, .009, .024), vec3(.0007, .0013, .0045), smoothstep(.0, .9, up));
        col += vec3(.006, .009, .016)*exp(-max(up, 0.)*5.);
        // Voie lactée : bande inclinée, granuleuse, avec des nuages de poussière sombres
        vec3 mwN = normalize(vec3(.42, .25, .87)); float b = dot(d, mwN);
        float band = exp(-b*b*18.);
        float grain = fbm(d*7.5), dust = fbm(d*4.2 + 11.);
        float mw = band*(.35 + .9*grain)*(1. - .75*smoothstep(.45, .7, dust)*exp(-b*b*60.));
        col += vec3(.05, .055, .08)*mw*.6 + vec3(.07, .055, .04)*exp(-b*b*70.)*grain*.2;
        // étoiles (trois couches : rares et brillantes, moyennes, poussière d'étoiles dans la Voie lactée)
        vec3 st = stars(d, 70., .32, 1.) + stars(d, 170., .28, .45);
        for(int i=0;i<7;i++){ float a = acos(clamp(dot(d, dip[i].xyz), -1., 1.)); float tw = .85 + .15*sin(t*(1.7 + float(i)*.37) + float(i)*2.1);
          st += vec3(1., .97, .92)*dip[i].w*tw*(1. + zm)*(smoothstep(.0028, 0., a)*1.6 + exp(-a*a/(.0045*.0045))*.5 + exp(-a*a/(.012*.012))*.06); }
        if(q > 1.5) st += stars(d, 380., .12 + .55*band, .18);
        // la lune et le halo autour d'elle ; près de la lune, les étoiles pâlissent
        float md = acos(clamp(dot(d, moon), -1., 1.)), mR = .035;
        float halo = (exp(-md*5.)*.05 + exp(-md*22.)*.18)*(1. - .85*zm);
        st *= smoothstep(.05, .35, md);
        col += st;
        col += vec3(.45, .55, .8)*halo;
        if(md < mR*1.02){
          vec3 tz = normalize(cross(moon, vec3(0., 1., 0.))), ty = cross(tz, moon);
          vec2 uv = vec2(dot(d - moon, tz), dot(d - moon, ty))/mR;
          float rr = length(uv), lim = sqrt(max(0., 1. - rr*rr));
          float mare = smoothstep(.46, .7, fbm(vec3(uv*2.2, 3.)));
          float crat = fbm(vec3(uv*9., 7.)), pits = smoothstep(.62, .8, fbm(vec3(uv*16., 11.)));
          float fine = fbm(vec3(uv*30., 19.));   // détails visibles seulement dans le télescope
          // quelques grands cratères (rebord clair, fond plus sombre) et les rayons clairs du plus jeune
          float cr = 0.; vec3 C1 = vec3(.12, -.62, .1), C2 = vec3(-.28, .12, .09), C3 = vec3(.42, .35, .06), C4 = vec3(-.55, -.3, .07);
          for(int i=0;i<4;i++){ vec3 C = i == 0 ? C1 : i == 1 ? C2 : i == 2 ? C3 : C4; float dd = length(uv - C.xy);
            cr += .35*smoothstep(C.z*1.25, C.z, dd)*smoothstep(C.z*.75, C.z, dd) - .18*smoothstep(C.z*.9, C.z*.5, dd); }
          vec2 tv = uv - C1.xy; float ray = pow(max(0., n3(vec3(atan(tv.y, tv.x)*9., 1., 1.)) - .45)*1.8, 2.)*smoothstep(1.4, .15, length(tv))*smoothstep(.1, .16, length(tv));
          vec3 mc = vec3(.88, .87, .82)*(1. - (.46 + .2*zm)*mare)*(.82 + (.3 + .1*zm)*crat)*(1. - .1*pits)*(1. + zm*(cr + .35*ray*(1. - mare) - .1*(1. - fine)))*(.62 + .38*lim)*(1. - .12*zm);
          col = mix(col, mc, smoothstep(1.02, .97, rr));
        }
        // voiles de nuages qui passent lentement, éclairés par la lune
        vec3 cp = d/(max(d.y, .08))*1.3 + vec3(t*.012, 0., t*.006);
        float cl = smoothstep(.55, .95, fbm(cp*1.1))*smoothstep(.05, .35, up);
        vec3 cc = vec3(.012, .016, .026) + vec3(.35, .4, .5)*exp(-md*3.)*.12;
        col = mix(col, cc, cl*.45);
        // étoile filante, toutes les ~11 s (une fois sur deux)
        float per = 11., k = floor(t/per), ft = fract(t/per)*per;
        if(h31(vec3(k, 1., 2.)) > .5 && ft < 1.1){
          vec3 a = normalize(vec3(h31(vec3(k, 3., 1.)) - .5, .55 + .35*h31(vec3(k, 4., 1.)), h31(vec3(k, 5., 1.)) - .5));
          vec3 dir = normalize(cross(a, normalize(vec3(h31(vec3(k, 6., 1.)) - .5, .1, h31(vec3(k, 7., 1.)) - .5))));
          float pr = ft/1.1, L = .32;
          vec3 head = normalize(a + dir*pr*L);
          vec3 e = d - head; float along = -dot(e, dir), side = length(e + dir*along);
          float tail = smoothstep(.12, 0., along)*step(0., along)*smoothstep(.0025, 0., side);
          col += vec3(.9, .95, 1.)*tail*(1. - pr)*1.8 + vec3(1.)*smoothstep(.006, 0., length(d - head))*(1. - pr)*2.;
        }
        gl_FragColor = vec4(col, 1.);
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 32), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; root.add(sky);
  sky.onBeforeRender = () => { skyMat.uniforms.t.value = now(); };

  /* ---------- la verrière : verre + armature de laiton ---------- */
  const glass = new THREE.MeshPhysicalMaterial({color: 0x9fb4d0, roughness: .05, metalness: 0, transparent: true, opacity: .045, envMapIntensity: .35, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clearcoatRoughness: .05});
  const gl = new THREE.Mesh(new THREE.SphereGeometry(R*.985, 96, 28, 0, TAU, 0, TH_G), glass); gl.scale.y = YS; gl.position.y = H; gl.renderOrder = 2; root.add(gl);
  const brass = new THREE.MeshStandardMaterial({color: 0xb08a3e, metalness: 1, roughness: .32, emissive: 0x1a1006, emissiveIntensity: .3});
  const P = (a, th, f = .99) => new THREE.Vector3(Math.cos(a)*Math.sin(th)*R*f, H + Math.cos(th)*R*YS*f, Math.sin(a)*Math.sin(th)*R*f);
  // montants (méridiens) : 24 gros + 24 fins entre eux
  const bars = [];
  for(let i=0;i<48;i++){ const a = i/48*TAU, big = i%2 === 0, pts = [];
    for(let k=0;k<=14;k++) pts.push(P(a, TH0 + k/14*(TH_G - TH0)));
    bars.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, big ? .055 : .025, 6)); }
  // traverses (parallèles) : les vitres rectangulaires
  for(let k=1;k<9;k++){ const th = TH0 + k/9*(TH_G - TH0), rr = Math.sin(th)*R*.99, yy = H + Math.cos(th)*R*YS*.99, tor = new THREE.TorusGeometry(rr, k%3 === 0 ? .05 : .025, 6, 160); tor.rotateX(Math.PI/2); tor.translate(0, yy, 0); bars.push(tor); }
  // bague basse de la verrière (là où le dôme plein reprend)
  { const rr = Math.sin(TH_G)*R*.99, yy = H + Math.cos(TH_G)*R*YS*.99, tor = new THREE.TorusGeometry(rr, .11, 10, 192); tor.rotateX(Math.PI/2); tor.translate(0, yy, 0); bars.push(tor); }
  const merge = gs => { let n = 0; gs.forEach(g => { g = g.index ? g : g; n += (g.index ? g.index.count : g.attributes.position.count); });
    const pos = [], nor = [], idx = []; let off = 0;
    gs.forEach(g0 => { const g = g0.index ? g0 : g0; const p = g.attributes.position.array, nn = g.attributes.normal.array; for(let i=0;i<p.length;i++){ pos.push(p[i]); nor.push(nn[i]); }
      if(g.index){ const ix = g.index.array; for(let i=0;i<ix.length;i++) idx.push(ix[i] + off); } else for(let i=0;i<p.length/3;i++) idx.push(i + off);
      off += p.length/3; g0.dispose(); });
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx); out.computeBoundingSphere(); return out; };
  const frame = new THREE.Mesh(merge(bars), brass); root.add(frame);

  /* ---------- clair de lune : lumière froide venant de la lune + rayon dans le puits ---------- */
  // la grande lumière du centre (qui donne les ombres) devient le clair de lune
  let moonL = S.sun;
  if(moonL){ moonL.color.set(0xc4d4ff); moonL.intensity = 1.7; moonL.position.copy(MOON).multiplyScalar(30); }
  else { moonL = new THREE.DirectionalLight(0xa9c2ff, .55); moonL.position.copy(MOON).multiplyScalar(30); root.add(moonL); }
  const fillL = new THREE.HemisphereLight(0x3a5285, 0x120c08, .25); root.add(fillL);
  if(S.shaft){ S.shaft.uniforms.c.value.set(0x9fbfff); }
  // un long rayon de lune incliné, du haut de la verrière vers le sol (faux volumétrique)
  const beamMat = new THREE.ShaderMaterial({transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: {t: {value: 0}},
    vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix*w; }",
    fragmentShader: "uniform float t; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 2.); float fall = smoothstep(0., .5, vUv.y)*(.25 + .75*vUv.y); float wob = .8 + .2*sin(vUv.x*31. + t*.3 + vUv.y*4.); gl_FragColor = vec4(vec3(.55, .68, 1.)*edge*fall*wob*.07, 1.); }"});
  const top = new THREE.Vector3(MOON.x*3.5, H + R*YS*.8, MOON.z*3.5), bot = new THREE.Vector3(-MOON.x*2.2, C.PIT_Y, -MOON.z*2.2);
  const len = top.distanceTo(bot), beam = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.3, len, 48, 1, true), beamMat);
  beam.position.copy(top).add(bot).multiplyScalar(.5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()); root.add(beam);
  beam.onBeforeRender = () => { beamMat.uniforms.t.value = now(); };
  S.sky = {mat: skyMat, moonL, beam, moonDir: MOON.clone(), dipDir: DIP.reduce((v, p) => v.add(new THREE.Vector3(p.x, p.y, p.z)), new THREE.Vector3()).normalize(), frame, glass: gl};
  return S.sky;
};
