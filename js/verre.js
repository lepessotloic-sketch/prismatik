// Formulaire en verre : une vraie dalle de verre 3D (réfraction, biseau, irisation) épinglée
// derrière la carte du formulaire, comme sur Signature 3D. Derrière le verre : le marbre et
// deux lueurs, or et vert. Sans WebGL, la carte garde un verre en CSS.
import { chargeTrois } from './logo-vivant.js?v=2';

const RIM_PX = 16, RAYON_PX = 30, EPAISSEUR = 0.08, RIM_EP = 0.06, DIST = 6;

export async function creerVerre({ section, canvas, carte, marbre }) {
  const THREE = await chargeTrois();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#050b08');
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100); scene.add(camera);

  // Reflets : un studio doux.
  const studio = new THREE.Scene(); studio.background = new THREE.Color('#0b0f0d');
  for (const [w, h, x, y, z, c, col] of [[6, 2, -3, 4, 4, 2.4, '#ffffff'], [1, 6, 4, 0, 3, 2.0, '#e7f6ee'], [8, .6, 0, -4, 3, 1.4, '#fff1d6'], [.5, 5, -4, 0, -2, 2.2, '#e7cc86']]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color:new THREE.Color(col).multiplyScalar(c), side:THREE.DoubleSide }));
    p.position.set(x, y, z); p.lookAt(0, 0, 0); studio.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(studio, 0.03).texture; pm.dispose();
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const cle = new THREE.DirectionalLight(0xfff3dc, 2.2); cle.position.set(-3, 4, 6); scene.add(cle);

  // Fond : le marbre de la page.
  const img = new Image(); img.src = marbre; await img.decode();
  const tc = document.createElement('canvas'); tc.width = 1400; tc.height = 1400;
  const cx = tc.getContext('2d'); cx.fillStyle = '#050b08'; cx.fillRect(0, 0, 1400, 1400);
  cx.drawImage(img, 0, 0, 1400, 1400);
  const texMarbre = new THREE.CanvasTexture(tc); texMarbre.colorSpace = THREE.SRGBColorSpace;
  texMarbre.wrapS = texMarbre.wrapT = THREE.RepeatWrapping;
  const fond = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map:texMarbre }));
  camera.add(fond);
  // Deux lueurs, or et vert, pour que le verre ait quelque chose à tordre.
  const lueur = (couleur) => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, couleur); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map:t, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false }));
  };
  const lueurOr = lueur('rgba(201,162,75,.55)'), lueurVert = lueur('rgba(87,177,131,.45)');
  camera.add(lueurOr, lueurVert);

  // La dalle de verre (même matériau que Signature 3D, version fumée et dépolie).
  // Teintes possibles du verre (?verre=a|b|c pour comparer) ; « a » = celle du modèle premium-3d-glass d'origine.
  const TEINTES = {
    a:{ color:'#9ea6b8', attenuationColor:'#10241a', attenuationDistance:1.8, roughness:0.34, iridescence:0.18 },
    b:{ color:'#cfe9db', attenuationColor:'#0f3a27', attenuationDistance:2.4, roughness:0.30, iridescence:0.10 },
    c:{ color:'#ffffff', attenuationColor:'#202020', attenuationDistance:4.0, roughness:0.22, iridescence:0.28 }
  };
  const T = TEINTES[new URLSearchParams(location.search).get('verre')] || TEINTES.a;
  const verre = new THREE.MeshPhysicalMaterial({ color:T.color, metalness:0, roughness:T.roughness, transmission:1, thickness:0.35, ior:1.46,
    attenuationColor:new THREE.Color(T.attenuationColor), attenuationDistance:T.attenuationDistance, clearcoat:1, clearcoatRoughness:0.14,
    iridescence:T.iridescence, iridescenceIOR:1.3, iridescenceThicknessRange:[100, 420], envMapIntensity:0.55, side:THREE.FrontSide });
  verre.onBeforeCompile = shader => {
    shader.uniforms.uChromaticSpread = { value:0.018 };
    shader.fragmentShader = 'uniform float uChromaticSpread;\n' + shader.fragmentShader;
    const t = THREE.ShaderChunk.transmission_fragment.replace(/vec4 transmitted = getIBLVolumeRefraction\([\s\S]*?\);/,
      `float chromaticSpread = uChromaticSpread * mix(0.35, 1.0, smoothstep(0.15, 0.85, 1.0 - abs(dot(n, v))));
      vec4 transmitted = getIBLVolumeRefraction(n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90, pos, modelMatrix, viewMatrix, projectionMatrix, material.ior, material.thickness, material.attenuationColor, material.attenuationDistance);
      vec4 transmittedRed = getIBLVolumeRefraction(n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90, pos, modelMatrix, viewMatrix, projectionMatrix, material.ior - chromaticSpread, material.thickness, material.attenuationColor, material.attenuationDistance);
      vec4 transmittedBlue = getIBLVolumeRefraction(n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90, pos, modelMatrix, viewMatrix, projectionMatrix, material.ior + chromaticSpread, material.thickness, material.attenuationColor, material.attenuationDistance);
      transmitted = vec4(transmittedRed.r, transmitted.g, transmittedBlue.b, (transmittedRed.a + transmitted.a + transmittedBlue.a) / 3.0);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', t);
  };
  verre.customProgramCacheKey = () => 'prismatik-verre-carte-v1';
  const formeArrondie = (w, hh, r) => {
    const s = new THREE.Shape(), x = -w / 2, y = -hh / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + hh - r); s.absarc(x + w - r, y + hh - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + hh); s.absarc(x + r, y + hh - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false); return s;
  };
  const geoDalle = (w, hh, upp) => {
    const rim = RIM_PX * upp, rayon = Math.max(rim + 0.002, RAYON_PX * upp);
    const geo = new THREE.ExtrudeGeometry(formeArrondie(w - 2 * rim, hh - 2 * rim, rayon - rim),
      { depth:EPAISSEUR, steps:1, bevelEnabled:true, bevelSize:rim, bevelThickness:RIM_EP, bevelSegments:10, curveSegments:18 });
    geo.translate(0, 0, -(EPAISSEUR + RIM_EP)); return geo;
  };
  const dalle = new THREE.Mesh(geoDalle(1, 1, 1), verre); dalle.userData = { w:0, h:0 }; camera.add(dalle);

  let souris = { x:0, y:0 };
  section.addEventListener('pointermove', e => { const r = section.getBoundingClientRect(); souris = { x:(e.clientX - r.left) / r.width * 2 - 1, y:(e.clientY - r.top) / r.height * 2 - 1 }; });

  const horloge = new THREE.Clock();
  function rendu() {
    const L = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
    if (renderer.domElement.width !== Math.round(L * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(H * renderer.getPixelRatio())) {
      renderer.setSize(L, H, false);
    }
    camera.aspect = L / H; camera.updateProjectionMatrix();
    const upp = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / H;   // unités par pixel au plan de la dalle
    // Fond plein cadre, un peu plus loin.
    const dF = DIST + 4, uppF = upp * dF / DIST;
    fond.position.set(0, 0, -dF); fond.scale.set(L * uppF * 1.05, H * uppF * 1.05, 1);
    texMarbre.repeat.set(L / 1400, H / 1400);
    const t = horloge.getElapsedTime();
    lueurOr.position.set(-L * upp * 0.18 + Math.sin(t * 0.2) * 0.4, H * upp * 0.12, -DIST - 2); lueurOr.scale.setScalar(H * upp * 0.9);
    lueurVert.position.set(L * upp * 0.22 + Math.cos(t * 0.17) * 0.4, -H * upp * 0.18, -DIST - 2.4); lueurVert.scale.setScalar(H * upp * 1.0);
    // La dalle suit la carte du formulaire.
    const rc = canvas.getBoundingClientRect(), rect = carte.getBoundingClientRect();
    const w = rect.width * upp, hh = rect.height * upp;
    if (Math.abs(dalle.userData.w - w) > 0.003 || Math.abs(dalle.userData.h - hh) > 0.003) {
      dalle.geometry.dispose(); dalle.geometry = geoDalle(w, hh, upp); dalle.userData = { w, h:hh };
    }
    const ccx = rect.left + rect.width / 2 - (rc.left + L / 2), ccy = (rc.top + H / 2) - (rect.top + rect.height / 2);
    dalle.position.set(ccx * upp, ccy * upp, -DIST);
    dalle.rotation.set(-souris.y * 0.02, souris.x * 0.025, 0);
    renderer.render(scene, camera);
  }
  let actif = false;
  const io = new IntersectionObserver(([e]) => { actif = e.isIntersecting; renderer.setAnimationLoop(actif ? rendu : null); });
  io.observe(section);
  rendu();
  document.body.classList.add('has-glass-card');
  return { rendu };
}
