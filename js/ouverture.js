// Ouverture de la vitrine Prismatik : l'IM d'Impact-NVA arrive en éclats, la lumière passe,
// puis le M éclate et disparaît : ses éclats révèlent N, V, A (lettres romaines, dans le vert du M).
// Résultat : I · N V A sur une ligne.
import { chargeTrois, chargeImage, analyse, creerStudio, fabriquerPieces, prepareEclats, poseEclat, clamp, sortie } from './logo-vivant.js?v=2';

let THREE = null;
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, t) => a + (b - a) * t;

// Les lettres N, V, A dessinées en Cinzel, dans le dégradé vert du M du logo.
async function imageNVA() {
  await document.fonts.load('700 300px Cinzel');
  const taille = 420, lettres = ['N', 'V', 'A'];
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d');
  cx.font = `700 ${taille}px Cinzel, Georgia, serif`;
  const largeurs = lettres.map(l => cx.measureText(l).width), ecart = taille * 0.16, marge = 40;
  cv.width = Math.ceil(largeurs.reduce((a, b) => a + b, 0) + ecart * 2 + marge * 2); cv.height = Math.ceil(taille * 1.05 + marge * 2);
  cx.font = `700 ${taille}px Cinzel, Georgia, serif`; cx.textBaseline = 'alphabetic';
  const base = marge + taille * 0.86;
  const deg = cx.createLinearGradient(0, marge, 0, base);
  deg.addColorStop(0, '#c8f0da'); deg.addColorStop(0.4, '#7fcfa2'); deg.addColorStop(0.75, '#4a9e72'); deg.addColorStop(1, '#2c7a4f');
  let x = marge;
  lettres.forEach((l, i) => {
    cx.lineJoin = 'round'; cx.lineWidth = 7; cx.strokeStyle = '#1f5a3b'; cx.strokeText(l, x, base);
    cx.fillStyle = deg; cx.fillText(l, x, base);
    // Arête claire en haut à gauche : la lettre paraît taillée.
    cx.save(); cx.globalCompositeOperation = 'source-atop'; cx.fillStyle = 'rgba(255,255,255,.18)'; cx.fillText(l, x - 3, base - 3); cx.restore();
    x += largeurs[i] + ecart;
  });
  return chargeImage(cv.toDataURL('image/png'));
}

export async function creerOuverture({ canvas, image, surRepli = null, surPret = null }) {
  const ov = { temps:null, etat:'depart', raison:'' };
  let studio = null;
  const repli = (raison) => {
    ov.etat = 'image'; ov.raison = raison;
    canvas.classList.remove('vivant'); if (image) image.classList.remove('cache');
    try { studio && studio.renderer.setAnimationLoop(null); } catch (e) {}
    if (surRepli) surRepli(raison);
  };
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('pas de WebGL');
    THREE = await chargeTrois();
    studio = creerStudio(canvas);
  } catch (e) { repli(String(e.message || e)); return ov; }
  const { renderer, scene, camera, groupe, SWEEP } = studio;

  try {
    // 1. L'IM, découpé en éclats. Tout ce qui est à gauche de 34 % de l'image appartient au I.
    const imgIM = await chargeImage('img/im.png');
    const infoIM = analyse(imgIM, { cellules:70 });
    const IM = fabriquerPieces(studio, infoIM, imgIM, {});
    for (const p of IM.pieces) p.lettre = p.fx < 0.34 ? 'I' : 'M';
    const finIM = prepareEclats(IM.pieces, IM.centre, { retard:0.15, etalement:0.6 });
    // Bords du I, hauteur et centre du M vert (étalon pour N, V, A).
    let vy0 = 1e9, vy1 = -1e9, ix0 = 1e9, ix1 = -1e9;
    for (const o of infoIM.morceaux) {
      const z = o.z, fx = (z.x0 + z.x1) / 2 / infoIM.W;
      if (fx < 0.34) { ix0 = Math.min(ix0, z.x0); ix1 = Math.max(ix1, z.x1); continue; }
      if (z.g > z.r * 1.08) { vy0 = Math.min(vy0, z.y0); vy1 = Math.max(vy1, z.y1); }
    }
    const S = IM.S, versY = y => -(y - IM.cy) * S, versX = x => (x - IM.cx) * S;
    const hM = (vy1 - vy0) * S, cyM = versY((vy0 + vy1) / 2);
    const gaucheI = versX(ix0), droiteI = versX(ix1);
    const centreM = new THREE.Vector3(versX(infoIM.W * 0.62), cyM, 0);

    // 2. N, V, A, à la même hauteur que le M vert. Le M éclate et disparaît ; ses éclats révèlent N, V, A.
    const imgNVA = await imageNVA();
    const infoNVA = analyse(imgNVA, { cellules:54 });
    const hautPx = infoNVA.boite[3] - infoNVA.boite[1];
    const sousGroupe = new THREE.Group(); groupe.add(sousGroupe);
    const NVA = fabriquerPieces(studio, infoNVA, imgNVA, { S:hM * 1.08 / hautPx, parent:sousGroupe });
    const tB = finIM + 1.3;                            // le M éclate
    prepareEclats(NVA.pieces, NVA.centre, { retard:tB + 0.2, etalement:0.6, graine:5 });
    const finTout = Math.max(...NVA.pieces.map(p => p.debut)) + 1.3;
    ov.finIM = finIM; ov.tB = tB; ov.finTout = finTout;

    // 3. Mise en page finale : I · N V A sur une ligne, centrée (recalculée à chaque changement de taille).
    let L = { decI:new THREE.Vector2(), posNVA:new THREE.Vector2(), dIM:6, dFin:9, gauche:-3, droite:3 };
    const tanDemi = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    function cadre() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
      const t = tanDemi(), ecart = hM * 0.32;
      const dist = (demiL, demiH) => Math.max(demiL * 1.3 / (t * camera.aspect), demiH * 1.28 / t);
      const total = (droiteI - gaucheI) + ecart + NVA.largeur;
      const decI = new THREE.Vector2(-total / 2 - gaucheI, 0);
      const posNVA = new THREE.Vector2(droiteI + decI.x + ecart + NVA.largeur / 2, cyM);
      L = { decI, posNVA, dIM:dist(IM.largeur / 2, IM.hauteur / 2), dFin:dist(total / 2, IM.hauteur / 2), gauche:-total / 2 - 1.2, droite:total / 2 + 1.2 };
      // Les éclats de N, V, A jaillissent du M.
      for (const p of NVA.pieces) {
        const versM = new THREE.Vector3(centreM.x + decI.x * 0.5 - posNVA.x - p.home.x, centreM.y - posNVA.y - p.home.y, 0);
        p.depBase = p.depBase || p.dep.clone();
        p.dep = versM.add(new THREE.Vector3(p.depBase.x * 0.3, p.depBase.y * 0.3, p.depBase.z * 0.45));
      }
    }
    cadre(); new ResizeObserver(() => cadre()).observe(canvas);

    let pointeur = { x:0, y:0, actif:false }; const incl = { x:0, y:0 };
    canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect();
      pointeur = { x:(e.clientX - r.left) / r.width * 2 - 1, y:(e.clientY - r.top) / r.height * 2 - 1, actif:true }; });
    canvas.addEventListener('pointerleave', () => { pointeur.actif = false; });

    const zero = { x:0, y:0, z:0, rx:0, ry:0, rz:0 };
    function pose(t) {
      const dep = sortie(clamp((t - tB - 0.1) / 1.4));         // le I glisse à sa place dans la ligne
      for (const p of IM.pieces) {
        if (p.lettre === 'I') { poseEclat(p, t, { ...zero, x:L.decI.x * dep, y:L.decI.y * dep }); continue; }
        // Le M : éclate vers l'extérieur et s'efface, sans revenir.
        const u = clamp((t - tB) / 1.2), e = sortie(u), f = 0.9 + p.force * 2.2;
        poseEclat(p, t, { x:p.dir.x * f * 2.2 * e, y:p.dir.y * f * 2.2 * e, z:p.dir.z * f * 2.6 * e,
          rx:p.rot.x * 0.35 * e, ry:p.rot.y * 0.35 * e, rz:p.rot.z * 0.25 * e });
        if (t > tB) {
          const o = 1 - clamp((t - tB - 0.2) / 0.75);
          p.face.opacity = p.cote.opacity = o; p.face.transparent = p.cote.transparent = true;
          p.mesh.visible = o > 0.001;
        } else p.mesh.visible = true;
      }
      sousGroupe.position.set(L.posNVA.x, L.posNVA.y, 0);
      for (const p of NVA.pieces) poseEclat(p, t);
      const arrivee = sortie(clamp(t / (finIM + 0.3)));
      camera.position.set(0, 0, lerp(L.dIM * 1.3, L.dIM, arrivee) + (L.dFin - L.dIM) * dep);
      const s1 = clamp((t - finIM + 0.1) / 1.2), s2 = clamp((t - finTout + 0.1) / 1.4);
      const s = s1 > 0 && s1 < 1 ? s1 : s2 > 0 && s2 < 1 ? s2 : 0;
      SWEEP.value = s > 0 ? L.gauche + (L.droite - L.gauche + 1.5) * s : -99;
      const repos = clamp((t - finTout) / 1.5);
      const cible = pointeur.actif ? { x:pointeur.y * 0.1, y:pointeur.x * 0.22 } : { x:Math.sin(t * 0.5) * 0.04, y:Math.sin(t * 0.33) * 0.12 };
      incl.x += (cible.x * repos - incl.x) * 0.06; incl.y += (cible.y * repos - incl.y) * 0.06;
      groupe.rotation.set(incl.x, incl.y + (1 - arrivee) * 0.4, 0);
    }

    let debut = 0, mesures = [], dernier = 0, fluide = false;
    function boucle(ms) {
      const t = ov.temps != null ? ov.temps : ms / 1000 - debut;
      pose(t); renderer.render(scene, camera);
      if (ov.etat === 'pret') { canvas.classList.add('vivant'); if (image) image.classList.add('cache'); ov.etat = 'vivant'; if (surPret) surPret(); }
      if (ov.temps != null) { dernier = ms; return; }
      if (dernier && t > 0.4 && t < 2.4 && !fluide) mesures.push(ms - dernier);
      if (t >= 2.4 && !fluide && mesures.length) {
        fluide = true; const tri = mesures.slice().sort((a, b) => a - b); const med = tri[tri.length >> 1];
        ov.fluidite = Math.round(1000 / med) + ' img/s';
        if (med > 55) repli('téléphone trop lent (' + ov.fluidite + ')');
      }
      dernier = ms;
    }
    ov.rejouer = () => { ov.temps = null; debut = performance.now() / 1000 - (reduit ? 99 : 0); mesures = []; dernier = 0; };
    ov.pause = (oui) => { if (ov.etat === 'image') return; renderer.setAnimationLoop(oui ? null : boucle); };
    ov.cadre = cadre;
    ov.pieces = IM.pieces.length + NVA.pieces.length;
    ov.rejouer(); ov.etat = 'pret';
    renderer.setAnimationLoop(boucle);
  } catch (e) { repli(String(e.message || e)); }
  return ov;
}
