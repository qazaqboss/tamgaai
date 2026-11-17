// ═══════════════════════════════════════════════════════════════════════
//  Наездник — «Standing Man» © zhuoyi0904 (Sketchfab, CC BY 4.0), скелет Mixamo
//  Сажаем модель в седло через кости: бёдра обхватывают коня, колени согнуты, руки с поводьями.
//  Две посадки: обычная (k = 0) и жокейская на галопе (k = 1) — плавный переход по скорости.
// ═══════════════════════════════════════════════════════════════════════
// Использование:
//   const kit = await loadRiderKit({ THREE, GLTFLoader, SkeletonUtils, base: 'models/rider/' });
//   const r = kit.create({ shirt: 0x1d4fa0, hat: 'cap', capColor: 0xF0D882 });   // hat: 'cap' | null
//   horse.seat.add(r.root);  // начало координат — точка посадки, +Z — вперёд
//   r.setLean(k);            // 0 — сидит прямо, 1 — жокейская посадка
//   r.hands.L / r.hands.R   — кисти (для поводьев и камчи)
let _kit = null;
export function loadRiderKit(deps) { return _kit || (_kit = build(deps)); }

// направления костей в системе всадника (+Z — вперёд, +Y — вверх, +X — левая сторона всадника)
const POSE = {
  sit: {
    'Spine>Spine1': [0, 1, 0.06], 'Spine1>Spine2': [0, 1, 0.08], 'Spine2>Neck': [0, 1, 0.1], 'Neck>Head': [0, 1, 0.02], 'Head>HeadTop_End': [0, 1, 0.2],
    'LeftUpLeg>LeftLeg': [0.42, -0.55, 0.72], 'LeftLeg>LeftFoot': [0.12, -0.96, -0.12], 'LeftFoot>LeftToeBase': [0.08, -0.3, 1],
    'RightUpLeg>RightLeg': [-0.42, -0.55, 0.72], 'RightLeg>RightFoot': [-0.12, -0.96, -0.12], 'RightFoot>RightToeBase': [-0.08, -0.3, 1],
    'LeftArm>LeftForeArm': [0.12, -0.97, 0.12], 'LeftForeArm>LeftHand': [-0.3, -0.25, 0.9],
    'RightArm>RightForeArm': [-0.12, -0.97, 0.12], 'RightForeArm>RightHand': [0.3, -0.25, 0.9],
  },
  jockey: {
    'Spine>Spine1': [0, 1, 0.8], 'Spine1>Spine2': [0, 1, 1.0], 'Spine2>Neck': [0, 1, 0.5], 'Neck>Head': [0, 1, 0.1], 'Head>HeadTop_End': [0, 1, 0.45],
    'LeftUpLeg>LeftLeg': [0.42, -0.25, 0.88], 'LeftLeg>LeftFoot': [0.12, -0.75, -0.6], 'LeftFoot>LeftToeBase': [0.08, -0.2, 1],
    'RightUpLeg>RightLeg': [-0.42, -0.25, 0.88], 'RightLeg>RightFoot': [-0.12, -0.75, -0.6], 'RightFoot>RightToeBase': [-0.08, -0.2, 1],
    'LeftArm>LeftForeArm': [0.12, -0.85, 0.5], 'LeftForeArm>LeftHand': [-0.3, -0.45, 0.85],
    'RightArm>RightForeArm': [-0.12, -0.85, 0.5], 'RightForeArm>RightHand': [0.3, -0.45, 0.85],
  },
};
const short = n => n.replace(/^rider_/, '').replace(/^mixamorig:?/, '').replace(/_\d+$/, ''); // GLTFLoader убирает «:» из имён

async function build({ THREE: T, GLTFLoader, SkeletonUtils, base = 'models/rider/', onProgress }) {
  const g = await new GLTFLoader().loadAsync(base + 'rider.glb', e => { if (e.total) onProgress?.(e.loaded / e.total); });
  const src = g.scene; src.updateMatrixWorld(true);
  // уникальные имена: всадник сидит внутри иерархии коня, а у моделей Sketchfab общие имена узлов (_rootJoint, RootNode…) —
  // иначе анимация коня «находит» узлы всадника и крутит их
  src.traverse(o => { o.name = 'rider_' + o.name; });
  src.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  const B = {}; src.traverse(o => { if (o.isBone) B[short(o.name)] = o; });
  const wp = b => b.getWorldPosition(new T.Vector3()), wq = b => b.getWorldQuaternion(new T.Quaternion());
  // рост → метры (модель уже ~1.69 м); сохраняем позу T для переключения
  const tpose = Object.fromEntries(Object.entries(B).map(([n, b]) => [n, b.quaternion.clone()]));
  const aim = (from, to, dir) => { const b = B[from]; b.updateWorldMatrix(true, false); const cur = wp(B[to]).sub(wp(b)).normalize();
    const q = new T.Quaternion().setFromUnitVectors(cur, new T.Vector3(...dir).normalize());
    b.quaternion.copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q.multiply(wq(b)))); b.updateMatrixWorld(true); };
  const poses = {}, bonesUsed = new Set();
  for (const [name, P] of Object.entries(POSE)) {
    Object.entries(B).forEach(([n, b]) => b.quaternion.copy(tpose[n])); src.updateMatrixWorld(true);
    for (const [k, d] of Object.entries(P)) { const [a, c] = k.split('>'); aim(a, c, d); bonesUsed.add(a); }
    poses[name] = { q: Object.fromEntries([...bonesUsed].map(n => [n, B[n].quaternion.clone()])), hips: null };
  }
  // точка посадки: таз на ~0.09 м выше сиденья
  Object.entries(B).forEach(([n, b]) => b.quaternion.copy(tpose[n]));
  const hipsT = wp(B.Hips);
  // перекраска футболки: светлые малонасыщенные пиксели верхней половины текстуры одежды
  const outfit = []; src.traverse(o => { if (o.isMesh && o.material?.name === 'outfit_map') outfit.push(o); });
  const baseImg = outfit[0]?.material.map?.image, tintCache = new Map();
  const shirtTex = (hex) => { if (!baseImg || hex == null) return null; if (tintCache.has(hex)) return tintCache.get(hex);
    const c = document.createElement('canvas'); c.width = baseImg.width; c.height = baseImg.height; const x = c.getContext('2d'); x.drawImage(baseImg, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), px = d.data, col = new T.Color(hex), H = Math.floor(c.height * 0.44);
    const lum = (y0, y1) => { let s = 0, n = 0; for (let y = y0; y < y1; y += 8) for (let i = y * c.width * 4; i < (y + 1) * c.width * 4; i += 32) { s += px[i] + px[i + 1] + px[i + 2]; n++; } return s / n; };
    const flip = lum(c.height - H, c.height) > lum(0, H); // футболка внизу — картинка перевёрнута
    for (let y = flip ? c.height - H : 0; y < (flip ? c.height : H); y++) for (let i = y * c.width * 4, e = i + c.width * 4; i < e; i += 4) { const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx > 0.5 && (mx - mn) < 0.22) { const l = Math.min(1.15, (r + gg + b) / 3 / 0.82); px[i] = Math.min(255, col.r * 255 * l); px[i + 1] = Math.min(255, col.g * 255 * l); px[i + 2] = Math.min(255, col.b * 255 * l); } }
    x.putImageData(d, 0, 0); const m0 = outfit[0].material.map, t = new T.CanvasTexture(c);
    t.flipY = m0.flipY; t.encoding = m0.encoding; t.wrapS = m0.wrapS; t.wrapT = m0.wrapT; t.anisotropy = 4; tintCache.set(hex, t); return t; };

  function create({ shirt = null, hat = null, capColor = 0xF0D882 } = {}) {
    const root = new T.Group(); root.name = 'rider';
    const inst = SkeletonUtils.clone(src); root.add(inst);
    const ib = {}; inst.traverse(o => { if (o.isBone) ib[short(o.name)] = o; if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const tex = shirtTex(shirt); if (tex) inst.traverse(o => { if (o.isMesh && o.material?.name === 'outfit_map') { o.material = o.material.clone(); o.material.map = tex; } });
    inst.position.set(-hipsT.x, 0.09 - hipsT.y, -hipsT.z - 0.02);
    // головной убор
    if (hat) { const head = ib.Head, top = ib.HeadTop_End, hg = new T.Group(); head.add(hg);
      const tl = top.position.clone(), s = tl.length(); hg.position.copy(tl.multiplyScalar(0.6)); hg.scale.setScalar(s / 0.2);
      { // жокейская кепка
        const m = new T.MeshStandardMaterial({ color: capColor, roughness: 0.45 }); const cap = new T.Mesh(new T.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m); cap.position.y = -0.005; hg.add(cap);
        const visor = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.01, 24, 1, false, -Math.PI / 2, Math.PI), m); visor.position.set(0, -0.012, 0.045); visor.rotation.x = 0.15; hg.add(visor); }
      hg.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
    const names = Object.keys(poses.sit.q);
    const setLean = (k) => { names.forEach(n => ib[n].quaternion.slerpQuaternions(poses.sit.q[n], poses.jockey.q[n], k)); };
    setLean(0);
    // корпус держим по горизонту коня (ref — корень коня), а не по качающейся спине: так сидит живой всадник
    const level = (ref, k = 0.85) => { const want = ref.getWorldQuaternion(new T.Quaternion()), pq = root.parent.getWorldQuaternion(new T.Quaternion());
      root.quaternion.copy(pq.invert().multiply(want)); root.quaternion.slerp(new T.Quaternion(), 1 - k); };
    return { root, bones: ib, hands: { L: ib.LeftHand, R: ib.RightHand }, setLean, level };
  }
  return { create };
}
