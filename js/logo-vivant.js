// Logo vivant — moteur réutilisable (même rendu que le skill logo-vivant validé le 2026-10-04).
// Un logo en image → morceaux 3D qui arrivent un à un, puis un trait de lumière.
// Garde-fous : l'image normale reste affichée tant que la 3D n'a pas rendu ; repli image si lent ou en erreur.
//
//   const lv = await creerLogoVivant({ canvas, image, src, surTemps, surRepli });
//   lv.rejouer(); lv.changer(src); lv.temps = 2.5 (fige l'animation, pour les tests) ;
//
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
let THREE = null;
export async function chargeTrois() { if (!THREE) THREE = await import(THREE_URL); return THREE; }

const clamp = t => Math.min(1, Math.max(0, t));
const sortie = t => 1 - Math.pow(1 - t, 3);
export const rebond = t => { const c = 1.25; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export { clamp, sortie };
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 1. Lire le logo : séparer le dessin du fond ----------
export async function chargeImage(src) {
  // Un raté de réseau ne doit pas priver la page de 3D : on réessaie deux fois.
  for (let essai = 0; ; essai++) {
    try { const im = new Image(); im.src = essai && !src.startsWith('data:') ? src + (src.includes('?') ? '&' : '?') + 'r=' + essai : src; await im.decode(); return im; }
    catch (e) { if (essai >= 2) throw e; await new Promise(ok => setTimeout(ok, 500 * (essai + 1))); }
  }
}

export function analyse(img, options = {}) {
  const k = 1000 / Math.max(img.naturalWidth, img.naturalHeight);
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently:true });
  cx.drawImage(img, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data;

  let nTransp = 0, nBord = 0; const rs = [], gs = [], bs = [];
  const bord = (x, y) => { const i = (y * W + x) * 4; nBord++;
    if (px[i + 3] < 40) nTransp++; else { rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); } };
  for (let x = 0; x < W; x += 2) { bord(x, 0); bord(x, H - 1); }
  for (let y = 0; y < H; y += 2) { bord(0, y); bord(W - 1, y); }
  const transparent = nTransp / nBord > 0.5;
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; };
  const fond = transparent ? null : [med(rs), med(gs), med(bs)];
  let seuil = 46;
  if (fond) {
    let s = 0; for (let i = 0; i < rs.length; i++) s += Math.hypot(rs[i] - fond[0], gs[i] - fond[1], bs[i] - fond[2]);
    seuil = Math.max(46, Math.min(90, (s / Math.max(1, rs.length)) * 3.2));
  }
  let m = new Uint8Array(W * H), nPlein = 0, nSombre = 0;
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    if (px[j + 3] < 110) continue;
    if (fond && Math.hypot(px[j] - fond[0], px[j + 1] - fond[1], px[j + 2] - fond[2]) < seuil) continue;
    m[i] = 1; nPlein++;
    if (0.2126 * px[j] + 0.7152 * px[j + 1] + 0.0722 * px[j + 2] < 70) nSombre++;
  }
  const passe = (a, r, grow) => {
    const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r; d++) { const xx = x + d; const s = xx >= 0 && xx < W ? a[y * W + xx] : 0;
        if (grow ? s : !s) { v = grow ? 1 : 0; break; } }
      t[y * W + x] = v;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = grow ? 0 : 1;
      for (let d = -r; d <= r; d++) { const yy = y + d; const s = yy >= 0 && yy < H ? t[yy * W + x] : 0;
        if (grow ? s : !s) { v = grow ? 1 : 0; break; } }
      o[y * W + x] = v;
    }
    return o;
  };
  m = passe(passe(m, 1, true), 1, false);
  // Logo sur fond plein (blanc, couleur) : on rogne 1 pixel de bord, sinon un liseré de fond reste collé aux lettres.
  if (fond) {
    // … mais seulement les pixels de bord dont la couleur tire vers le fond (les traits fins restent entiers).
    const m2 = m.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!m[i]) continue;
      if (m[i - 1] && m[i + 1] && m[i - W] && m[i + W]) continue;
      const j = i * 4;
      if (Math.hypot(px[j] - fond[0], px[j + 1] - fond[1], px[j + 2] - fond[2]) < seuil * 2.2) m2[i] = 0;
    }
    m = m2;
  }
  let couverture = 0; for (let i = 0; i < W * H; i++) couverture += m[i]; couverture /= W * H;
  const etiquette = (test) => {
    const lab = new Int32Array(W * H).fill(-1); const zones = []; const pile = [];
    for (let i0 = 0; i0 < W * H; i0++) {
      if (lab[i0] !== -1 || !test(i0)) continue;
      const id = zones.length; const z = { id, n:0, x0:W, y0:H, x1:0, y1:0, bord:false, r:0, g:0, b:0 };
      lab[i0] = id; pile.push(i0);
      while (pile.length) {
        const i = pile.pop(); const x = i % W, y = (i / W) | 0; z.n++;
        if (x < z.x0) z.x0 = x; if (x > z.x1) z.x1 = x; if (y < z.y0) z.y0 = y; if (y > z.y1) z.y1 = y;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) z.bord = true;
        z.r += px[i * 4]; z.g += px[i * 4 + 1]; z.b += px[i * 4 + 2];
        if (x > 0 && lab[i - 1] === -1 && test(i - 1)) { lab[i - 1] = id; pile.push(i - 1); }
        if (x < W - 1 && lab[i + 1] === -1 && test(i + 1)) { lab[i + 1] = id; pile.push(i + 1); }
        if (y > 0 && lab[i - W] === -1 && test(i - W)) { lab[i - W] = id; pile.push(i - W); }
        if (y < H - 1 && lab[i + W] === -1 && test(i + W)) { lab[i + W] = id; pile.push(i + W); }
      }
      zones.push(z);
    }
    return { lab, zones };
  };
  const minTrou = Math.max(14, W * H * 0.00002);
  { const { lab, zones } = etiquette(i => !m[i]);
    for (let i = 0; i < W * H; i++) if (!m[i]) { const z = zones[lab[i]]; if (!z.bord && z.n < minTrou) m[i] = 1; } }
  const { lab, zones } = etiquette(i => m[i]);
  const minAire = Math.max(30, W * H * 0.00006);
  const gardees = zones.filter(z => z.n >= minAire);
  let morceaux;
  if (options.cellules) {
    // Éclats : chaque morceau est découpé par un pavage irrégulier (cellules de Voronoï), comme une pierre brisée.
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (const z of gardees) { bx0 = Math.min(bx0, z.x0); by0 = Math.min(by0, z.y0); bx1 = Math.max(bx1, z.x1); by1 = Math.max(by1, z.y1); }
    const bw = Math.max(1, bx1 - bx0), bh = Math.max(1, by1 - by0);
    const pas = Math.sqrt(bw * bh / options.cellules);
    const nx = Math.max(1, Math.ceil(bw / pas)), ny = Math.max(1, Math.ceil(bh / pas));
    let graine = 7; const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
    const gx = new Float32Array(nx * ny), gy = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      gx[j * nx + i] = bx0 + (i + 0.15 + hasard() * 0.7) * pas; gy[j * nx + i] = by0 + (j + 0.15 + hasard() * 0.7) * pas;
    }
    const garde = new Uint8Array(zones.length); for (const z of gardees) garde[z.id] = 1;
    const cel = new Int32Array(W * H).fill(-1);
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const i = y * W + x; if (!m[i] || !garde[lab[i]]) continue;
      const ci = Math.min(nx - 1, Math.floor((x - bx0) / pas)), cj = Math.min(ny - 1, Math.floor((y - by0) / pas));
      let best = -1, bd = 1e18;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const k = b * nx + a, d = (gx[k] - x) ** 2 + (gy[k] - y) ** 2; if (d < bd) { bd = d; best = k; }
      }
      cel[i] = best;
    }
    const lab2 = new Int32Array(W * H).fill(-1); const eclats = []; const pile = [];
    for (let i0 = 0; i0 < W * H; i0++) {
      if (cel[i0] < 0 || lab2[i0] !== -1) continue;
      const id = eclats.length, c0 = cel[i0], l0 = lab[i0];
      const z = { id, n:0, x0:W, y0:H, x1:0, y1:0, r:0, g:0, b:0, comp:l0 };
      lab2[i0] = id; pile.push(i0);
      while (pile.length) {
        const i = pile.pop(); const x = i % W, y = (i / W) | 0; z.n++;
        if (x < z.x0) z.x0 = x; if (x > z.x1) z.x1 = x; if (y < z.y0) z.y0 = y; if (y > z.y1) z.y1 = y;
        z.r += px[i * 4]; z.g += px[i * 4 + 1]; z.b += px[i * 4 + 2];
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
          if (j >= 0 && lab2[j] === -1 && cel[j] === c0 && lab[j] === l0) { lab2[j] = id; pile.push(j); }
      }
      eclats.push(z);
    }
    morceaux = eclats.filter(z => z.n >= 6).map(z => {
      const test = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lab2[y * W + x] === z.id ? 1 : 0;
      return { z, boucles:contours(test, z.x0, z.y0, z.x1, z.y1), eclat:true };
    }).filter(o => o.boucles.length);
  } else {
    morceaux = gardees.map(z => {
      const test = (x, y) => x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === z.id ? 1 : 0;
      return { z, boucles:contours(test, z.x0, z.y0, z.x1, z.y1) };
    }).filter(o => o.boucles.length);
  }

  const plaques = [];
  if (fond && !options.cellules) {
    const p = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < W * H; i++, j += 4)
      if (px[j + 3] >= 110 && Math.hypot(px[j] - fond[0], px[j + 1] - fond[1], px[j + 2] - fond[2]) >= 14) p[i] = 1;
    const P = etiquette(i => p[i]);
    for (const z of P.zones) {
      if (z.bord || z.n < W * H * 0.04) continue;
      const plein = z.n / ((z.x1 - z.x0 + 1) * (z.y1 - z.y0 + 1));
      let faible = 0;
      for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) { const i = y * W + x; if (P.lab[i] === z.id && !m[i]) faible++; }
      if (plein < 0.6 || faible / z.n < 0.6) continue;
      const test = (x, y) => x >= 0 && y >= 0 && x < W && y < H && P.lab[y * W + x] === z.id ? 1 : 0;
      const b = contours(test, z.x0, z.y0, z.x1, z.y1).sort((u, v) => Math.abs(aire(v)) - Math.abs(aire(u)));
      if (b.length) plaques.push({ z, boucles:[b[0]], plaque:true });
    }
  }
  if (plaques.length) {
    const dedans = (z, q) => { const mx = (q.x1 - q.x0) * 0.03, my = (q.y1 - q.y0) * 0.03;
      return z.x0 > q.x0 + mx && z.x1 < q.x1 - mx && z.y0 > q.y0 + my && z.y1 < q.y1 - my; };
    const touche = (z, q) => !(z.x1 < q.x0 || z.x0 > q.x1 || z.y1 < q.y0 || z.y0 > q.y1);
    for (let k2 = morceaux.length - 1; k2 >= 0; k2--) {
      const z = morceaux[k2].z;
      if (plaques.some(q => touche(z, q.z) && !dedans(z, q.z))) morceaux.splice(k2, 1);
    }
    morceaux.unshift(...plaques);
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, lum = 0, nLum = 0;
  for (const { z } of morceaux) {
    x0 = Math.min(x0, z.x0); y0 = Math.min(y0, z.y0); x1 = Math.max(x1, z.x1 + 1); y1 = Math.max(y1, z.y1 + 1);
    lum += (0.2126 * z.r + 0.7152 * z.g + 0.0722 * z.b); nLum += z.n;
  }
  return { W, H, fond, transparent, morceaux, boite:[x0, y0, x1, y1],
    lumLogo: nLum ? lum / nLum / 255 : 0.5, partSombre: nPlein ? nSombre / nPlein : 0,
    // Fond chargé (photo, capture d'écran) : le fond varie beaucoup ou le « dessin » couvre presque toute l'image.
    fondCharge: !!fond && (seuil >= 85 || couverture > 0.55) };
}

export function contours(test, x0, y0, x1, y1) {
  const suivant = new Map();
  const cle = (x, y) => Math.round(x * 2) * 8192 + Math.round(y * 2);
  for (let y = y0 - 1; y <= y1; y++) for (let x = x0 - 1; x <= x1; x++) {
    const c = test(x, y) * 8 + test(x + 1, y) * 4 + test(x + 1, y + 1) * 2 + test(x, y + 1);
    if (c === 0 || c === 15) continue;
    const mx = x + .5, my = y + .5;
    const N = { T:[mx, y], R:[x + 1, my], B:[mx, y + 1], L:[x, my] };
    const seg = (a, b) => suivant.set(cle(N[a][0], N[a][1]), N[b]);
    switch (c) {
      case 1: seg('L', 'B'); break; case 2: seg('B', 'R'); break; case 3: seg('L', 'R'); break;
      case 4: seg('R', 'T'); break; case 5: seg('L', 'T'); seg('R', 'B'); break; case 6: seg('B', 'T'); break;
      case 7: seg('L', 'T'); break; case 8: seg('T', 'L'); break; case 9: seg('T', 'B'); break;
      case 10: seg('T', 'R'); seg('B', 'L'); break; case 11: seg('T', 'R'); break; case 12: seg('R', 'L'); break;
      case 13: seg('R', 'B'); break; case 14: seg('B', 'L'); break;
    }
  }
  const boucles = []; const vu = new Set();
  for (const [k0] of suivant) {
    if (vu.has(k0)) continue;
    const b = []; let k = k0;
    while (!vu.has(k)) { vu.add(k); const p = suivant.get(k); if (!p) break; b.push(p); k = cle(p[0], p[1]); }
    if (b.length > 6) boucles.push(simplifieBoucle(b, 0.85));
  }
  return boucles.filter(b => b.length >= 3);
}
function rdp(pts, e) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1]; let idx = 0, dmax = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= e) return [a, b];
  return rdp(pts.slice(0, idx + 1), e).slice(0, -1).concat(rdp(pts.slice(idx), e));
}
function simplifieBoucle(l, e) {
  let loin = 0, best = -1;
  l.forEach((p, i) => { const d = Math.hypot(p[0] - l[0][0], p[1] - l[0][1]); if (d > best) { best = d; loin = i; } });
  return rdp(l.slice(0, loin + 1), e).slice(0, -1).concat(rdp(l.slice(loin).concat([l[0]]), e).slice(0, -1));
}
export const aire = b => { let s = 0; for (let i = 0; i < b.length; i++) { const p = b[i], q = b[(i + 1) % b.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };


// ---------- 2. Les briques 3D (partagées par les logos clients et l'ouverture de la vitrine) ----------
const hasardFixe = (i, s) => { const x = Math.sin((i + 1) * 12.9898 * s + s * 78.233) * 43758.5453; return x - Math.floor(x); };

export function creerStudio(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const cle = new THREE.DirectionalLight(0xffffff, 1.1); cle.position.set(-2.5, 3, 5); scene.add(cle);
  const contre = new THREE.DirectionalLight(0xfff1dc, 0.8); contre.position.set(3, -1.5, 2); scene.add(contre);
  const studio = new THREE.Scene(); studio.background = new THREE.Color('#1a1c1f');
  for (const [w, h, x, y, z, c] of [[6, 2, -3, 4, 4, 2.2], [1, 6, 4, 0, 3, 1.6], [8, .6, 0, -4, 3, 1.2], [3, 3, 0, 2, -5, .8]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color:new THREE.Color(1, 1, 1).multiplyScalar(c), side:THREE.DoubleSide }));
    p.position.set(x, y, z); p.lookAt(0, 0, 0); studio.add(p);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(studio, 0.04).texture; pm.dispose();
  const groupe = new THREE.Group(); scene.add(groupe);
  const SWEEP = { value:-99 };
  const materiauFace = (texture) => {
    const m = new THREE.MeshStandardMaterial({ map:texture, emissiveMap:texture, emissive:0xffffff, emissiveIntensity:0.5,
      roughness:0.42, metalness:0.12, envMapIntensity:0.35, transparent:true, opacity:0 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uSweep = SWEEP;
      sh.vertexShader = 'varying vec3 vMonde;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n  vMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uSweep;\nvarying vec3 vMonde;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
        `float bande = exp(-pow((vMonde.x + vMonde.y * 0.45 - uSweep) / 0.2, 2.0));
  outgoingLight += vec3(1.0, 0.93, 0.78) * bande * 0.55;
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'logo-vivant-face-v1';
    return m;
  };
  return { renderer, scene, camera, groupe, SWEEP, materiauFace };
}

// Transforme l'analyse d'un logo en pièces 3D. S = unités par pixel d'analyse ; (cx, cy) = point du logo placé en (0, 0).
export function fabriquerPieces(studio, info, img, { S, cx, cy, profondeur = 0.07, parent = studio.groupe, zone = null } = {}) {
  const { renderer, materiauFace } = studio;
  const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
  const tc = document.createElement('canvas');
  tc.width = Math.round(img.naturalWidth * k); tc.height = Math.round(img.naturalHeight * k);
  tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
  const texture = new THREE.CanvasTexture(tc);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const { W, H, boite } = info;
  if (S == null) S = 4 / Math.max(boite[2] - boite[0], boite[3] - boite[1]);
  if (cx == null) cx = (boite[0] + boite[2]) / 2;
  if (cy == null) cy = (boite[1] + boite[3]) / 2;
  const P = ([x, y]) => new THREE.Vector2((x - cx) * S, -(y - cy) * S);
  const uv = (v, i) => new THREE.Vector2((v[i * 3] / S + cx) / W, 1 - (-v[i * 3 + 1] / S + cy) / H);
  const UVGenerator = { generateTopUV:(g, v, a, b, c) => [uv(v, a), uv(v, b), uv(v, c)],
    generateSideWallUV:(g, v, a, b, c, d) => [uv(v, a), uv(v, b), uv(v, c), uv(v, d)] };
  const pieces = [];
  const ajoute = (formes, z, opts) => {
    const geo = new THREE.ExtrudeGeometry(formes, { depth:opts.profondeur, bevelEnabled:false, UVGenerator });
    geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, -opts.profondeur / 2);
    const couleur = new THREE.Color(z.r / z.n / 255, z.g / z.n / 255, z.b / z.n / 255).convertSRGBToLinear().multiplyScalar(opts.plaque ? 0.7 : 0.62);
    const face = materiauFace(texture);
    const cote = new THREE.MeshStandardMaterial({ color:couleur, roughness:0.5, metalness:opts.plaque ? 0.1 : 0.25, envMapIntensity:0.5, transparent:true, opacity:0 });
    const mesh = new THREE.Mesh(geo, [face, cote]);
    const home = new THREE.Vector3(c.x, c.y, opts.plaque ? -0.11 : 0);
    mesh.position.copy(home); parent.add(mesh);
    // Position dans l'image (0..1), pour savoir si la pièce est dans la zone qui éclate.
    const fx = (c.x / S + cx) / W, fy = (-c.y / S + cy) / H;
    const dansZone = !!zone && fx >= zone[0] && fx <= zone[2] && fy >= zone[1] && fy <= zone[3];
    const p = { mesh, face, cote, home, plaque:!!opts.plaque, dansZone, fx, fy };
    pieces.push(p); return p;
  };
  const forme = (boucles) => {
    const triees = boucles.slice().sort((p, q) => Math.abs(aire(q)) - Math.abs(aire(p)));
    const f = new THREE.Shape(triees[0].map(P));
    for (const t of triees.slice(1)) if (Math.abs(aire(t)) > 4) f.holes.push(new THREE.Path(t.map(P)));
    return f;
  };
  for (const o of info.morceaux.filter(o => o.plaque)) ajoute(new THREE.Shape(o.boucles[0].map(P)), o.z, { profondeur:0.05, plaque:true });
  const tri = info.morceaux.filter(o => !o.plaque).sort((a, b) => (a.z.x0 + a.z.x1) - (b.z.x0 + b.z.x1));
  const eclats = tri.length && tri[0].eclat;
  const paquet = eclats ? Math.max(1, Math.ceil(tri.length / 260)) : Math.max(1, Math.ceil(tri.length / 48));
  for (let i = 0; i < tri.length; i += paquet) {
    const lot = tri.slice(i, i + paquet);
    const z = { r:0, g:0, b:0, n:0 }; for (const o of lot) { z.r += o.z.r; z.g += o.z.g; z.b += o.z.b; z.n += o.z.n; }
    ajoute(lot.map(o => forme(o.boucles)), z, { profondeur });
  }
  const bw = (boite[2] - boite[0]) * S, bh = (boite[3] - boite[1]) * S;
  const centre = new THREE.Vector2(((boite[0] + boite[2]) / 2 - cx) * S, -((boite[1] + boite[3]) / 2 - cy) * S);
  return { pieces, texture, S, cx, cy, eclats, largeur:bw, hauteur:bh, centre };
}

// Prépare le trajet de chaque éclat : il part de loin, en tournant, et revient à sa place.
export function prepareEclats(pieces, centre, { retard = 0.15, etalement = 0.55, graine = 1 } = {}) {
  let dmax = 0.001; for (const p of pieces) dmax = Math.max(dmax, Math.hypot(p.home.x - centre.x, p.home.y - centre.y));
  pieces.forEach((p, i) => {
    const h = k => hasardFixe(i, k * 3.1 + graine);
    const dx = p.home.x - centre.x, dy = p.home.y - centre.y, d = Math.hypot(dx, dy) || 0.001;
    const ang = Math.atan2(dy, dx) + (h(1) - 0.5) * 0.9;
    const loin = 1.4 + h(2) * 2.6;
    p.dep = new THREE.Vector3(Math.cos(ang) * loin, Math.sin(ang) * loin, -2.5 + h(3) * 3.2);
    p.rot = new THREE.Vector3((h(4) - 0.5) * 6, (h(5) - 0.5) * 6, (h(6) - 0.5) * 4);
    p.debut = retard + (d / dmax) * etalement * 0.6 + h(7) * etalement * 0.4;
    p.dir = new THREE.Vector3(dx / d, dy / d, 0.4 + h(8) * 0.6).normalize();
    p.force = 0.25 + h(9) * 0.55;
  });
  return Math.max(...pieces.map(p => p.debut)) + 1.3;
}
// Arrivée d'un éclat (u : 0 → 1 pendant 1,3 s).
export function poseEclat(p, t, extra = null) {
  const u = clamp((t - p.debut) / 1.3), e = sortie(u), r = rebond(u);
  let x = p.home.x + p.dep.x * (1 - e), y = p.home.y + p.dep.y * (1 - e), z = p.home.z + p.dep.z * (1 - e);
  let rx = p.rot.x * (1 - r), ry = p.rot.y * (1 - r), rz = p.rot.z * (1 - r);
  if (extra) { x += extra.x; y += extra.y; z += extra.z; rx += extra.rx; ry += extra.ry; rz += extra.rz; }
  p.mesh.position.set(x, y, z); p.mesh.rotation.set(rx, ry, rz);
  const o = clamp(u * 3);
  if (p.face.opacity !== o) { p.face.opacity = o; p.cote.opacity = o; }
  p.face.transparent = p.cote.transparent = o < 1;
}
// Éclatement sur place : la pièce part vers l'extérieur puis revient (b : 0 → 1).
export function souffle(p, b, ampleur = 1) {
  if (b <= 0 || b >= 1.6) return null;
  const k = b < 0.3 ? sortie(b / 0.3) : 1 - rebond(clamp((b - 0.3) / 0.9));
  const a = k * p.force * ampleur;
  return { x:p.dir.x * a * 1.4, y:p.dir.y * a * 1.4, z:p.dir.z * a * 1.6, rx:p.rot.x * a * 0.18, ry:p.rot.y * a * 0.18, rz:p.rot.z * a * 0.14 };
}

// ---------- 3. Un logo vivant complet sur une toile ----------
// eclats : nombre d'éclats (0 = morceaux entiers, rendu des vidéos validé) ; zone : [x0,y0,x1,y1] en fractions de l'image, la partie qui éclate.
export async function creerLogoVivant({ canvas, image, src, marges = { haut:0, bas:0 }, surTemps = null, surRepli = null, surPret = null, auto = true, eclats = 0, zone = null }) {
  const lv = { temps:null, etat:'depart', raison:'', finIntro:3, pieces:0 };
  let studio = null;
  const repli = (raison) => {
    lv.etat = 'image'; lv.raison = raison;
    canvas.classList.remove('vivant'); if (image) image.classList.remove('cache');
    try { studio && studio.renderer.setAnimationLoop(null); } catch (e) {}
    if (surRepli) surRepli(raison);
  };
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('pas de WebGL');
    await chargeTrois();
    studio = creerStudio(canvas);
  } catch (e) { repli(String(e.message || e)); return lv; }
  const { renderer, scene, camera, groupe, SWEEP } = studio;
  let jeu = null, bornes = { gauche:-2, droite:2, demiL:2, demiH:1 }, distance = 8, debut = 0, finIntro = 3, tEclat = 99;

  function construit(info, img) {
    if (jeu) { for (const p of jeu.pieces) { p.mesh.geometry.dispose(); p.face.dispose(); p.cote.dispose(); groupe.remove(p.mesh); } jeu.texture.dispose(); }
    jeu = fabriquerPieces(studio, info, img, { zone });
    const pieces = jeu.pieces;
    if (jeu.eclats) {
      finIntro = prepareEclats(pieces, jeu.centre);
      tEclat = zone ? finIntro + 1.5 : 99;
    } else {
      pieces.forEach((p, i) => {
        p.dx = p.home.x * 0.35; p.dy = -0.9 - hasardFixe(i, 1) * 0.5; p.dz = p.plaque ? -2.5 : -3.2 - hasardFixe(i, 2) * 1.5;
        p.rx = p.plaque ? -0.5 : -1.15; p.ry = p.plaque ? 0 : hasardFixe(i, 3) * 0.9; p.rz = p.plaque ? 0 : hasardFixe(i, 4) * 0.35;
      });
      const etale = Math.min(0.09, 1.5 / Math.max(1, pieces.length));
      const decal = pieces.some(p => p.plaque) ? 0.55 : 0; let n = 0;
      pieces.forEach(p => { p.debut = p.plaque ? 0.1 : 0.25 + decal + (n++) * etale; });
      finIntro = 0.25 + decal + Math.max(0, n - 1) * etale + 1.15;
      tEclat = 99;
    }
    bornes = { gauche:-jeu.largeur / 2 - 1.2, droite:jeu.largeur / 2 + 1.2, demiL:jeu.largeur / 2, demiH:jeu.hauteur / 2 };
    lv.finIntro = finIntro; lv.tEclat = tEclat; lv.pieces = pieces.length;
    cadre();
  }

  function cadre() {
    const L = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
    camera.aspect = L / H; camera.updateProjectionMatrix();
    renderer.setSize(L, H, false);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const haut = marges.haut || 0, bas = marges.bas || 0;
    const utileH = Math.max(0.2, (H - haut - bas) / H);
    distance = Math.max(bornes.demiL * 1.22 / (t * camera.aspect), bornes.demiH * 1.3 / (t * utileH));
    groupe.position.y = ((bas - haut) / H) * distance * t;
  }

  let pointeur = { x:0, y:0, actif:false }, incl = { x:0, y:0 };
  canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect();
    pointeur = { x:(e.clientX - r.left) / r.width * 2 - 1, y:(e.clientY - r.top) / r.height * 2 - 1, actif:true }; });
  canvas.addEventListener('pointerleave', () => { pointeur.actif = false; });

  function pose(t) {
    for (const p of jeu.pieces) {
      if (jeu.eclats) { poseEclat(p, t, p.dansZone ? souffle(p, (t - tEclat) / 1.2, 1.2) : null); continue; }
      const l = clamp((t - p.debut) / 1.1), e = sortie(l), eb = rebond(l);
      p.mesh.position.set(p.home.x + p.dx * (1 - e), p.home.y + p.dy * (1 - e), p.home.z + p.dz * (1 - e));
      p.mesh.rotation.set(p.rx * (1 - eb), p.ry * (1 - eb), p.rz * (1 - eb));
      const o = clamp(l * 2.4);
      if (p.face.opacity !== o) { p.face.opacity = o; p.cote.opacity = o; }
      p.face.transparent = p.cote.transparent = o < 1;
    }
    const g = sortie(clamp(t / (finIntro + 0.3)));
    camera.position.set(0, 0, distance * (1.28 - 0.28 * g));
    // Un trait de lumière à l'arrivée, un second juste après l'éclatement.
    const s1 = clamp((t - finIntro + 0.1) / 1.2), s2 = clamp((t - tEclat - 0.9) / 1.2);
    const s = s1 > 0 && s1 < 1 ? s1 : s2 > 0 && s2 < 1 ? s2 : 0;
    SWEEP.value = s > 0 ? bornes.gauche + (bornes.droite - bornes.gauche + 1.5) * s : -99;
    const repos = clamp((t - finIntro) / 1.5);
    const cible = pointeur.actif ? { x:pointeur.y * 0.12, y:pointeur.x * 0.3 } : { x:Math.sin(t * 0.5) * 0.05, y:Math.sin(t * 0.33) * 0.16 };
    incl.x += (cible.x * repos - incl.x) * 0.06; incl.y += (cible.y * repos - incl.y) * 0.06;
    groupe.rotation.set(incl.x, incl.y + (1 - g) * 0.45, 0);
    if (surTemps) surTemps(t, finIntro);
  }

  let mesures = [], dernier = 0, fluide = false, enPause = false;
  function boucle(ms) {
    const t = lv.temps != null ? lv.temps : ms / 1000 - debut;
    pose(t);
    renderer.render(scene, camera);
    if (lv.etat === 'pret') { canvas.classList.add('vivant'); if (image) image.classList.add('cache'); lv.etat = 'vivant'; if (surPret) surPret(); }
    if (lv.temps != null) { dernier = ms; return; }
    if (dernier && t > 0.4 && t < 2.4 && !fluide) mesures.push(ms - dernier);
    if (t >= 2.4 && !fluide && mesures.length) {
      fluide = true; const tri = mesures.slice().sort((a, b) => a - b); const med = tri[tri.length >> 1];
      lv.fluidite = Math.round(1000 / med) + ' img/s';
      if (med > 55) repli('téléphone trop lent (' + lv.fluidite + ')');
    }
    dernier = ms;
  }

  lv.rejouer = () => { lv.temps = null; debut = performance.now() / 1000 - (reduit ? 99 : 0); mesures = []; dernier = 0; };
  lv.changer = async (nouveau, options = {}) => {
    if ('zone' in options) zone = options.zone;
    const img = await chargeImage(nouveau);
    const info = analyse(img, { cellules:eclats });
    if (!info.morceaux.length) throw new Error('aucun dessin trouvé dans l’image');
    lv.info = info;
    construit(info, img);
    lv.rejouer();
    if (lv.etat !== 'image' && lv.etat !== 'vivant') lv.etat = 'pret';
    if (!enPause) renderer.setAnimationLoop(boucle);
    return info;
  };
  lv.cadre = () => cadre();
  // Ne calcule que si la toile est à l'écran (économise la batterie du téléphone).
  lv.pause = (oui) => { enPause = oui; if (lv.etat === 'image') return; renderer.setAnimationLoop(oui ? null : boucle); };
  new ResizeObserver(() => cadre()).observe(canvas);

  try { await lv.changer(src); if (!auto) lv.pause(true); }
  catch (e) { repli(String(e.message || e)); }
  return lv;
}
