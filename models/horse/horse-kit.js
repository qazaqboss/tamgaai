// ═══════════════════════════════════════════════════════════════════════
//  Конь с седлом — общий модуль для сайта (index.html) и игр (games/*)
//  • horse.glb  — «The Horse» © aaadragon (Sketchfab), CC BY 4.0, скелет + анимация галопа
//  • saddle.glb — седло «Western Saddle» (saddle_blockout.fbx + текстуры), сконвертировано tools/horse
//  Система координат экземпляра: копыта на y = 0, нос смотрит в +Z, 1 ед. = 1 м (холка ≈ 1.5 м).
// ═══════════════════════════════════════════════════════════════════════
// Использование:
//   const kit = await loadHorseKit({ THREE, GLTFLoader, SkeletonUtils, mergeBufferGeometries, base: 'models/horse/' });
//   const h = kit.create({ tint: 0x2a1d14 });  scene.add(h.root);
//   h.seat.add(rider);            // всадник: начало координат — точка посадки в седле, +Z — вперёд
//   h.update(dt, speedMetersPerSec);
const SPINE = 'Spine01_02';
const HOOF = { FL: 'F_Leg05l_029', FR: 'F_Leg05r_034', RL: 'R_Leg05l_015', RR: 'R_Leg05r_027' };
const TAIL = ['Tail01_017', 'Tail02_018', 'Tail03_019', 'Tail04_020', 'Tail05_021', 'TailIK_022'];
const SADDLE_Z = 0.02, SADDLE_DY = -0.03; // седло чуть позади холки, плотно на спине

let _kit = null;
export function loadHorseKit(deps) { return _kit || (_kit = build(deps)); }

async function build({ THREE: T, GLTFLoader, SkeletonUtils, mergeBufferGeometries, base = 'models/horse/', onProgress }) {
  const L = new GLTFLoader();
  const prog = { h: 0, s: 0 }, tick = () => onProgress?.((prog.h * 1.3 + prog.s * 3.1) / 4.4);
  const [hg, sg] = await Promise.all([
    L.loadAsync(base + 'horse.glb', e => { if (e.total) { prog.h = e.loaded / e.total; tick(); } }),
    L.loadAsync(base + 'saddle.glb', e => { if (e.total) { prog.s = e.loaded / e.total; tick(); } }),
  ]);
  const src = hg.scene, run = hg.animations[0];
  src.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  const bones = {}; src.traverse(o => { if (o.isBone) bones[o.name] = o; });
  let body = null; src.traverse(o => { if (o.isSkinnedMesh && !body) body = o; });
  const v = new T.Vector3(), wp = n => bones[n].getWorldPosition(new T.Vector3());
  const skinMinY = (filter) => { const p = body.geometry.attributes.position; let m = Infinity; for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i); body.boneTransform(i, v); v.applyMatrix4(body.matrixWorld); if (!filter || filter(v)) m = Math.min(m, v.y); } return m; };

  // ── седло в позе привязки: верх спины по средней линии над точкой SADDLE_Z ──
  src.updateMatrixWorld(true);
  let backTop = -Infinity; { const p = body.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); body.boneTransform(i, v); v.applyMatrix4(body.matrixWorld); if (Math.abs(v.x) < 0.06 && Math.abs(v.z - SADDLE_Z) < 0.05) backTop = Math.max(backTop, v.y); } }
  // точка трензеля (угол рта): кончик морды, чуть назад и вниз — для поводьев
  let nose = null; { const p = body.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); body.boneTransform(i, v); v.applyMatrix4(body.matrixWorld); if (Math.abs(v.x) < 0.05 && (!nose || v.z > nose.z)) nose = v.clone(); } }
  const HEAD = 'Head_07', mouthLocal = nose.add(new T.Vector3(0, -0.04, -0.09)).applyMatrix4(new T.Matrix4().copy(bones[HEAD].matrixWorld).invert());
  const saddleWorld = new T.Matrix4().makeTranslation(0, backTop + SADDLE_DY, SADDLE_Z);
  const saddleLocal = new T.Matrix4().copy(bones[SPINE].matrixWorld).invert().multiply(saddleWorld); // в системе кости спины
  // точка посадки: верх сиденья по осевой линии в самой низкой точке «чаши» (между рожком и задней лукой)
  let seatY = 0.12, seatZ = -0.04; { const col = {}; sg.scene.traverse(o => { if (!o.isMesh || /horn/i.test(o.name)) return; const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.03) { const z = Math.round(p.getZ(i) * 50) / 50; if (Math.abs(z) < 0.16) col[z] = Math.max(col[z] ?? -1, p.getY(i)); } });
    const lo = Object.entries(col).filter(([, y]) => y > 0.07).sort((a, b) => a[1] - b[1])[0]; // только верх сиденья, не низ ленчика
    if (lo) { seatZ = +lo[0]; seatY = lo[1]; } }

  // ── поза «стоит» ──
  // Анимации стойки у модели нет, поэтому строим её сами:
  //  • корпус, шея и голова — из самого спокойного кадра галопа (спина ровная, голова поднята), хвост — из кадра, где он висит ниже всего;
  //  • каждая нога выпрямляется под корпус решателем FABRIK, начиная с формы ноги в её опорной фазе (суставы гнутся естественно);
  //  • копыто ставится плоско — ориентация из опорного кадра.
  const mixer = new T.AnimationMixer(src); const act = mixer.clipAction(run); act.play();
  const D = run.duration, N = 48, wq = n => bones[n].getWorldQuaternion(new T.Quaternion());
  const LEG = {
    FL: { up: 'F_Leg01l_038', j: ['F_Leg02l_039', 'F_Leg03l_040', 'F_Leg04l_041', 'F_Leg05l_029'], ik: 'F_LegIKl_028', dz: 0.03 },
    FR: { up: 'F_Leg01r_042', j: ['F_Leg02r_043', 'F_Leg03r_044', 'F_Leg04r_045', 'F_Leg05r_034'], ik: 'F_LegIKr_033', dz: 0.03 },
    RL: { j: ['R_Leg02l_013', 'R_Leg03l_00', 'R_Leg04l_014', 'R_Leg05l_015'], ik: null, dz: 0.07 },
    RR: { j: ['R_Leg02r_024', 'R_Leg03r_025', 'R_Leg04r_026', 'R_Leg05r_027'], ik: null, dz: 0.07 },
  };
  // длины костей ног в позе привязки (в кадрах галопа IK-копыто передней ноги «растягивает» пясть)
  for (const k in LEG) LEG[k].bind = LEG[k].j.slice(1).map((n, m) => wp(n).distanceTo(wp(LEG[k].j[m])));
  let body0 = null, tailT = null;
  for (let i = 0; i < N; i++) { const t = i / N * D; mixer.setTime(t); src.updateMatrixWorld(true);
    for (const k in LEG) { const L = LEG[k], n = L.j.length, top = wp(L.j[0]), hoof = wp(L.j[n - 1]); const sc = Math.abs(hoof.z - top.z) + hoof.y * 0.6 - top.distanceTo(hoof) * 0.8;
      if (!L.st || sc < L.st.s) L.st = { s: sc, rel: L.j.map(n => wp(n).sub(top)), child: L.j.slice(0, n - 1).map((b, m) => bones[b].worldToLocal(wp(L.j[m + 1]))), hoofQ: wq(L.j[n - 1]), ikQ: L.ik ? wq(L.ik) : null }; }
    const sc = Math.abs(wp('Spine02_03').y - wp('Spine01_02').y) - wp('Head_07').y * 3; if (!body0 || sc < body0.s) body0 = { s: sc, t };
    const ty = wp('Tail05_021').y; if (!tailT || ty < tailT.s) tailT = { s: ty, t }; }
  const names = Object.keys(bones), pose = {};
  const grab = () => Object.fromEntries(names.map(n => [n, { q: bones[n].quaternion.clone(), p: bones[n].position.clone() }]));
  mixer.setTime(tailT.t); const tailPose = grab(); mixer.setTime(body0.t); act.stop(); mixer.uncacheRoot(src);
  const bodyPose = grab(); names.forEach(n => { const b = TAIL.includes(n) ? tailPose[n] : bodyPose[n]; bones[n].quaternion.copy(b.q); bones[n].position.copy(b.p); }); src.updateMatrixWorld(true);
  // земля, до которой дотягиваются все четыре ноги (нога вытянута не больше чем на 97%)
  for (const k in LEG) { const L = LEG[k]; L.len = L.ik ? L.bind : L.st.rel.slice(1).map((r, m) => r.distanceTo(L.st.rel[m])); L.total = L.len.reduce((a, b) => a + b, 0); }
  const aim = (n, childLocal, target) => { const b = bones[n]; b.updateWorldMatrix(true, false); const bw = wp(n), cw = b.localToWorld(childLocal.clone());
    const q = new T.Quaternion().setFromUnitVectors(cw.sub(bw).normalize(), target.clone().sub(bw).normalize());
    b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q.multiply(wq(n)))); b.updateMatrixWorld(true); };
  // плечевая кость передней ноги: в галопе выброшена вперёд — частично (70 %) разворачиваем локоть под плечо, чтобы не рвать кожу у холки
  const aimPart = (n, childLocal, dir, k) => { const b = bones[n]; b.updateWorldMatrix(true, false); const bw = wp(n), cw = b.localToWorld(childLocal.clone()).sub(bw).normalize();
    const q = new T.Quaternion().slerp(new T.Quaternion().setFromUnitVectors(cw, dir.clone().normalize()), k);
    b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q.multiply(wq(n)))); b.updateMatrixWorld(true); };
  // земля — по задним ногам (почти прямые)
  const G = Math.max(...Object.values(LEG).filter(L => !L.ik).map(L => wp(L.j[0]).y - Math.sqrt((0.995 * L.total) ** 2 - L.dz ** 2)));
  // плечевая кость: в галопе выброшена вперёд — разворачиваем умеренно (сильнее — рвётся кожа у холки)
  for (const k in LEG) if (LEG[k].up) aimPart(LEG[k].up, bones[LEG[k].j[0]].position.clone(), new T.Vector3(0, -1, -0.35), 1);
  for (const k in LEG) { const L = LEG[k], root = wp(L.j[0]);
    const n = L.j.length, S = n - 1; let P;
    if (L.ik) { // передняя: предплечье вертикально, запястье сгибается совсем немного; остаток разницы снимет наклон корпуса
      const build = t => [new T.Vector3(0, -1, 0.02), new T.Vector3(0, -1, t), new T.Vector3(0, -1, -t * 0.6)].reduce((a, d, m) => (a.push(a[m].clone().add(d.setLength(L.len[m]))), a), [root.clone()]);
      let lo = 0, hi = 0.35; for (let it = 0; it < 30; it++) { const t = (lo + hi) / 2; if (build(t)[S].y < G) lo = t; else hi = t; } P = build((lo + hi) / 2);
    } else { // задняя: форма опорной фазы, FABRIK к точке под тазобедренным суставом
      P = L.st.rel.map(r => root.clone().add(r)); const target = new T.Vector3(P[S].x, G, root.z + L.dz);
      for (let it = 0; it < 60; it++) { P[S].copy(target); for (let m = S - 1; m >= 0; m--) P[m] = P[m + 1].clone().add(P[m].clone().sub(P[m + 1]).setLength(L.len[m]));
        P[0].copy(root); for (let m = 0; m < S; m++) P[m + 1] = P[m].clone().add(P[m + 1].clone().sub(P[m]).setLength(L.len[m])); } }
    for (let m = 0; m < S; m++) aim(L.j[m], L.st.child[m], P[m + 1]);
    const hoof = bones[L.j[S]];
    if (L.ik) { const ik = bones[L.ik]; ik.quaternion.copy(ik.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(L.st.ikQ)); ik.updateMatrixWorld(true);
      hoof.quaternion.copy(wq(L.ik).invert().multiply(L.st.hoofQ)); hoof.updateMatrixWorld(true);
      const off = wp(L.j[S]).sub(wp(L.ik)); ik.position.copy(ik.parent.worldToLocal(P[S].clone().sub(off))); ik.updateMatrixWorld(true); }
    else { hoof.quaternion.copy(hoof.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(L.st.hoofQ)); hoof.updateMatrixWorld(true); } }
  // корпус: поворачиваем вокруг поперечной оси через задние копыта, чтобы передние копыта встали на ту же землю
  { const F = ['FL', 'FR'].map(k => wp(LEG[k].j[LEG[k].j.length - 1])), Hh = ['RL', 'RR'].map(k => wp(LEG[k].j[LEG[k].j.length - 1]));
    const f = F[0].clone().add(F[1]).multiplyScalar(0.5), hh = Hh[0].clone().add(Hh[1]).multiplyScalar(0.5), phi = Math.atan2(hh.y - f.y, f.z - hh.z);
    const rj = bones._rootJoint, M = new T.Matrix4().makeTranslation(0, hh.y, hh.z).multiply(new T.Matrix4().makeRotationX(-phi)).multiply(new T.Matrix4().makeTranslation(0, -hh.y, -hh.z)).multiply(rj.matrixWorld);
    M.premultiply(new T.Matrix4().copy(rj.parent.matrixWorld).invert()).decompose(rj.position, rj.quaternion, rj.scale); src.updateMatrixWorld(true); }
  // шея: в галопе вытянута вперёд — поднимаем у основания (лоб ≈ на 0.3 м выше холки), голову чуть опускаем, чтобы морда смотрела вперёд-вниз
  { const turn = (n, a) => { const b = bones[n], q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), a); b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q.multiply(wq(n)))); b.updateMatrixWorld(true); };
    const want = wp('Neck01_04').y + 0.26, q0 = bones.Neck01_04.quaternion.clone(); let best = 0, bd = Infinity;
    for (let a = 0; a <= 1.0; a += 0.02) { bones.Neck01_04.quaternion.copy(q0); turn('Neck01_04', -a); const d = Math.abs(wp('Head_07').y - want); if (d < bd) { bd = d; best = a; } }
    bones.Neck01_04.quaternion.copy(q0); turn('Neck01_04', -best); turn('Head_07', best * 0.75); }
  names.forEach(n => pose[n] = { q: bones[n].quaternion.toArray(), p: bones[n].position.toArray() });
  // уровень земли в стойке → опускаем корень, чтобы копыта стояли на y = 0
  src.updateMatrixWorld(true);
  const hoofY = Object.values(HOOF).map(n => skinMinY(p => p.distanceTo(wp(n)) < 0.16));
  const standGround = hoofY.reduce((a, b) => a + b, 0) / hoofY.length;
  // земля в галопе — самая низкая точка копыт за цикл
  mixer.clipAction(run).play(); let runGround = Infinity; for (let i = 0; i < 16; i++) { mixer.setTime(i / 16 * D); src.updateMatrixWorld(true); runGround = Math.min(runGround, skinMinY(p => p.y < 0.3)); }
  mixer.stopAllAction(); mixer.uncacheRoot(src);
  const rootName = '_rootJoint'; // общий предок корпуса И передних ног (они висят не на Root_01)
  const rootStand = new T.Vector3().fromArray(pose[rootName].p).add(localDelta(T, bones[rootName], -standGround));
  const tracks = names.flatMap(n => [new T.QuaternionKeyframeTrack(n + '.quaternion', [0], pose[n].q), new T.VectorKeyframeTrack(n + '.position', [0], n === rootName ? rootStand.toArray() : pose[n].p)]);
  const stand = new T.AnimationClip('stand', -1, tracks);
  // галоп: копыта на земле
  const runClip = run.clone(); const rt = runClip.tracks.find(t => t.name === rootName + '.position');
  const runDelta = localDelta(T, bones[rootName], -runGround);
  if (rt) for (let i = 0; i < rt.values.length; i += 3) { rt.values[i] += runDelta.x; rt.values[i + 1] += runDelta.y; rt.values[i + 2] += runDelta.z; }
  else runClip.tracks.push(new T.VectorKeyframeTrack(rootName + '.position', [0], new T.Vector3().fromArray(pose[rootName].p).add(runDelta).toArray()));

  // ── седло: детали (для атласа) и склеенная версия (для игр — 3 вызова отрисовки) ──
  const saddleParts = sg.scene;
  const byMat = new Map(); saddleParts.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); o.updateMatrixWorld(true); g.applyMatrix4(o.matrixWorld); if (!g.attributes.uv) { const n = g.attributes.position.count; g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n * 2), 2)); } (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(g); } });
  const saddleMerged = new T.Group(); saddleMerged.name = 'saddle';
  byMat.forEach((gs, m) => { const g = mergeBufferGeometries(gs, false); const mesh = new T.Mesh(g, m); mesh.castShadow = true; mesh.name = m.name; saddleMerged.add(mesh); });

  const WITHERS = backTop - standGround;
  function create({ tint = null, saddle = true } = {}) {
    const root = new T.Group(); root.name = 'horse';
    const inst = SkeletonUtils.clone(src); root.add(inst);
    const ib = {}; inst.traverse(o => { if (o.isBone) ib[o.name] = o; if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    if (tint != null) inst.traverse(o => { if (o.isMesh && o.material?.name === 'horse') { o.material = o.material.clone(); o.material.color.copy(coatTint(T, tint)); } });
    const sad = saddle ? saddleMerged.clone() : new T.Group(); saddleLocal.decompose(sad.position, sad.quaternion, sad.scale); ib[SPINE].add(sad);
    const seat = new T.Object3D(); seat.name = 'seat'; seat.position.set(0, seatY, seatZ); sad.add(seat);
    const mouth = new T.Object3D(); mouth.name = 'mouth'; mouth.position.copy(mouthLocal); ib[HEAD].add(mouth);
    const mx = new T.AnimationMixer(inst), aRun = mx.clipAction(runClip), aStand = mx.clipAction(stand);
    aRun.play(); aStand.play(); aRun.time = Math.random() * D; let w = 0;
    const update = (dt, speed = 0) => {
      const target = smooth(0.6, 3.2, speed); w += (target - w) * Math.min(1, dt * 4);
      aRun.setEffectiveWeight(w); aStand.setEffectiveWeight(1 - w);
      aRun.setEffectiveTimeScale(Math.max(0.55, Math.min(1.7, speed / 11)));
      mx.update(dt);
    };
    update(0, 0);
    return { root, seat, mouth, saddle: sad, bones: ib, mixer: mx, update, withers: WITHERS, seatHeight: () => seat.getWorldPosition(new T.Vector3()).y - root.getWorldPosition(new T.Vector3()).y };
  }
  return { create, saddleParts, saddleLocal, seatY, seatZ, withers: WITHERS, length: 2.25, spine: SPINE, src, stand, run: runClip };
}

// вектор (0, dy, 0) мира → в локальные координаты кости (через её родителя)
function localDelta(T, bone, dy) {
  const inv = new T.Matrix4().copy(bone.parent.matrixWorld).invert();
  const a = new T.Vector3(0, 0, 0).applyMatrix4(inv), b = new T.Vector3(0, dy, 0).applyMatrix4(inv);
  return b.sub(a);
}
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// окрас: текстура гнедая; тёмные масти — затемняем, светлые — оставляем как есть
function coatTint(T, hex) {
  const c = new T.Color(hex), hsl = c.getHSL({});
  if (hsl.l < 0.12) return new T.Color(0.30, 0.27, 0.25);
  if (hsl.l < 0.25) return new T.Color(0.62, 0.55, 0.50);
  if (hsl.l > 0.6) return new T.Color(1.0, 0.93, 0.86);
  return new T.Color(1, 1, 1);
}
