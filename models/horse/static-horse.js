// Статичный конь «Horse basemesh» © sidahearne (Sketchfab, CC BY 4.0) — для атласа «Ер-тұрман».
// fitStaticHorse: переводит модель в метры (холка ≈ 1.6 м, копыта на y = 0, нос в +Z),
// находит спину лучами по поверхности и возвращает группу «saddle» — систему седла
// (начало — низ ленчика на хребте, +Z — вперёд, наклон по линии спины).
export function fitStaticHorse(T, scene, { withers = 1.6, saddleZ = 0.56, sink = 0.02 } = {}) {
  scene.updateMatrixWorld(true);
  let mesh = null; scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const box = new T.Box3().setFromObject(scene), size = box.getSize(new T.Vector3());
  const ray = new T.Raycaster(), hit = (o, d) => { ray.set(o, d.clone().normalize()); const h = ray.intersectObject(mesh, false)[0]; return h ? h.point : null; };
  const up = size.y * 2, cx = (box.min.x + box.max.x) / 2;
  // корпус: грудь спереди и ягодица сзади — лучи на высоте 60 % роста
  const yMid = box.min.y + size.y * 0.55;
  const chest = hit(new T.Vector3(cx, yMid, box.max.z + 1), new T.Vector3(0, 0, -1)), butt = hit(new T.Vector3(cx, yMid, box.min.z - 1), new T.Vector3(0, 0, 1));
  const top = z => hit(new T.Vector3(cx, box.max.y + up, z), new T.Vector3(0, -1, 0))?.y ?? box.max.y;
  const span = chest.z - butt.z, zAt = f => butt.z + span * f;
  // холка — самая высокая точка спины в передней трети корпуса (до начала шеи)
  let wz = zAt(0.7), wy = -Infinity; for (let f = 0.62; f <= 0.8; f += 0.01) { const y = top(zAt(f)); if (y > wy) { wy = y; wz = zAt(f); } }
  const k = withers / (wy - box.min.y);
  const root = new T.Group(); root.name = 'horse';
  scene.position.set(-cx, -box.min.y, 0); const holder = new T.Group(); holder.scale.setScalar(k); holder.add(scene); root.add(holder);
  // седло: на saddleZ корпуса от ягодицы; наклон — по спине на ±0.2 м
  const zs = zAt(saddleZ), d = 0.2 / k, y0 = top(zs), yF = top(zs + d), yB = top(zs - d);
  const saddle = new T.Group(); saddle.name = 'saddle';
  saddle.position.set(0, (y0 - box.min.y) * k - sink, zs * k); saddle.rotation.x = -Math.atan2(yF - yB, 2 * d);
  root.add(saddle); root.updateMatrixWorld(true);
  return { root, saddle, mesh, scale: k, info: { scale: k, withersZ: wz * k, saddleZ: zs * k, pitchDeg: saddle.rotation.x * 57.3, chest: chest.z * k, butt: butt.z * k } };
}
