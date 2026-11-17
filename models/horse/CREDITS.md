# Конь с седлом

- `horse.glb` — «The Horse» by [aaadragon](https://sketchfab.com/aaadragon),
  https://sketchfab.com/3d-models/the-horse-ecfe459c6baa4377b487f89c57569d5c —
  licensed under [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/).
  Изменение: у материала убрано свечение (emissive), геометрия, скелет и анимация не тронуты
  (`tools/horse/fix_horse.mjs`).
- `saddle.glb` — седло «Western Saddle» (исходник `saddle_blockout.fbx` + текстуры `lambert20_*`,
  предоставлены владельцем проекта). Сконвертировано `tools/horse/convert_saddle.html`:
  метры, перёд = +Z, вершины склеены, текстуры 4096 → 2048/1024 (ORM = AO + roughness + metallic).

`horse-kit.js` — общий модуль: конь + седло, поза «стоит» (собрана из опорных кадров галопа),
плавный переход в галоп по скорости, точка посадки всадника и угол рта (для поводьев).
Используется в index.html (игры, атлас «Ер-тұрман») и games/bayge.
`three-global.js` — мост для importmap: ES-модули three.js получают глобальный THREE сайта.
