// the_horse.glb → models/horse/horse.glb: убираем «свечение» (emissive = та же текстура ×1.4),
// из-за которого конь выглядит плоским и светится в тени. Геометрия, скелет и анимация не меняются.
import fs from 'fs';
const src = fs.readFileSync(new URL('../../the_horse.glb', import.meta.url));
const jl = src.readUInt32LE(12), j = JSON.parse(src.slice(20, 20 + jl).toString()), rest = src.slice(20 + jl);
j.materials.forEach(m => { delete m.emissiveTexture; delete m.emissiveFactor; if (m.extensions) { delete m.extensions.KHR_materials_emissive_strength; if (!Object.keys(m.extensions).length) delete m.extensions; } });
j.extensionsUsed = (j.extensionsUsed || []).filter(e => e !== 'KHR_materials_emissive_strength'); if (!j.extensionsUsed.length) delete j.extensionsUsed;
let js = Buffer.from(JSON.stringify(j)); const pad = (4 - js.length % 4) % 4; js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8); head.writeUInt32LE(js.length, 12); head.write('JSON', 16);
fs.writeFileSync(new URL('../../models/horse/horse.glb', import.meta.url), Buffer.concat([head, js, rest]));
console.log('ok', j.materials.map(m => m.name), 'bytes', 20 + js.length + rest.length);
