"""Blender: реалистичный асық (таранная кость барана) → asyq.glb + рендер Cycles.
Запуск: blender -b --python blender_asyq.py -- OUT_DIR
Локальные оси модели (как в glTF / three.js): X — длина, +Y бүк, −Y шік, +Z алшы, −Z тәйкі.
В Blender (Z-up) это: (x, -z, y)."""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, noise

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp'
HX, HY, HZ = 0.25, 0.16, 0.175
G = lambda x, s: math.exp(-(x * x) / (s * s))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ── 1. база: подразделённый куб → кубосфера ──
bpy.ops.mesh.primitive_cube_add(size=2)
ob = bpy.context.active_object; ob.name = 'Asyq'
mod = ob.modifiers.new('sub', 'SUBSURF'); mod.levels = mod.render_levels = 6; mod.subdivision_type = 'SIMPLE'
bpy.ops.object.modifier_apply(modifier='sub')

def shape(d):
    """d — направление (единичный вектор, glTF-оси). Возвращает точку и «глубину впадины»."""
    E = 0.42
    sp = lambda t: math.copysign(abs(t) ** E, t)
    u, v, w = sp(d.x), sp(d.y), sp(d.z)
    x, y, z, cav = u * HX, v * HY, w * HZ, 0.0
    z *= 1 - 0.13 * u; y *= 1 - 0.06 * u; y += 0.012 * (1 - u * u)
    if v > 0:   # БҮК
        k = v ** 3; y += 0.035 * k * (1 - u * u * 0.6); gr = 0.022 * k * G(w, 0.22) * (1 - u * u); y -= gr; cav += gr * 10
    if v < 0:   # ШІК
        k = (-v) ** 3; pit = 0.078 * k * G(u - 0.04, 0.38) * G(w + 0.05, 0.42); y += pit; cav += pit * 12
        y -= 0.012 * k * G(math.hypot(u / 0.62, w / 0.68) - 1, 0.18)
    if w > 0:   # АЛШЫ
        k = w ** 4; z -= 0.02 * k; s = 0.34 * math.sin(u * 2.7 + 0.2)
        ridge = 0.028 * k * G(v - s, 0.17) * (1 - abs(u) ** 4); z += ridge
        hol = 0.022 * k * (G(v - s - 0.38, 0.16) + G(v - s + 0.4, 0.16)) * (1 - u * u); z -= hol; cav += hol * 14
    if w < 0:   # ТӘЙКІ
        k = (-w) ** 4; z += 0.012 * k; dip = 0.044 * k * G(u + 0.05, 0.42) * G(v - 0.05, 0.38); z += dip; cav += dip * 12
    au = abs(u)
    if au > 0.55:  # суставные блоки
        k = ((au - 0.55) / 0.45) ** 1.6; gro = 0.047 * k * G(w + 0.02 * math.copysign(1, u), 0.2) * (1 - abs(v) ** 3)
        x -= math.copysign(gro, u); cav += gro * 12
        x += math.copysign(0.013 * k * (G(w - 0.55, 0.22) + G(w + 0.55, 0.22)), u)
    return Vector((x, y, z)), cav

me = ob.data
cavs = []
for vtx in me.vertices:
    b = vtx.co.normalized()                     # Blender-оси
    d = Vector((b.x, b.z, -b.y))                # → glTF-оси
    p, cav = shape(d)
    vtx.co = Vector((p.x, -p.z, p.y))           # обратно в Blender
    cavs.append(cav)

# ── 1б. равномерная сетка: Voxel Remesh + сглаживание ступенек ──
rm = ob.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.0042; rm.adaptivity = 0
bpy.ops.object.modifier_apply(modifier='rm')
lap = ob.modifiers.new('lap', 'SMOOTH'); lap.factor = 0.6; lap.iterations = 6
bpy.ops.object.modifier_apply(modifier='lap')
me = ob.data

# ── 2. поверхность кости: процедурные текстуры Blender ──
def displace(name, ttype, strength, size, **kw):
    tex = bpy.data.textures.new(name, ttype); tex.noise_scale = size
    for k, v in kw.items(): setattr(tex, k, v)
    m = ob.modifiers.new(name, 'DISPLACE'); m.texture = tex; m.strength = strength; m.mid_level = 0.5; m.texture_coords = 'LOCAL'
    bpy.ops.object.modifier_apply(modifier=name)
displace('clouds', 'CLOUDS', 0.006, 0.06, noise_depth=3)          # неровность
displace('pores', 'VORONOI', -0.0011, 0.0045, distance_metric='DISTANCE')  # поры
displace('fine', 'CLOUDS', 0.0005, 0.004, noise_depth=1)          # микрорельеф
sm = ob.modifiers.new('cs', 'CORRECTIVE_SMOOTH'); sm.factor = 0.35; sm.iterations = 2
bpy.ops.object.modifier_apply(modifier='cs')

# ── 3. цвет: слоновая кость, желтизна, пятна + «грязь» во впадинах ──
attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
random.seed(3)
for i, vtx in enumerate(me.vertices):
    c = vtx.co; u = abs(c.x) / HX
    m = noise.noise(Vector((c.x * 9 + 7, c.y * 9, c.z * 9))) * 0.5 + 0.5
    t = min(1, max(0, u * u * 0.55 + (m - 0.45) * 0.7))
    base = [1.0 * (1 - t) + 0.92 * t, 0.9 * (1 - t) + 0.74 * t, 0.68 * (1 - t) + 0.42 * t]
    dark = 1.0
    attr.data[i].color = (base[0] * dark, base[1] * dark, base[2] * dark, 1)
me.color_attributes.active_color = attr
bpy.ops.object.mode_set(mode='VERTEX_PAINT')
bpy.ops.paint.vertex_color_dirt(blur_strength=1.0, blur_iterations=2, clean_angle=3.14159, dirt_angle=0.0, dirt_only=False, normalize=True)
bpy.ops.object.mode_set(mode='OBJECT')

# ── 4. облегчение для веба ──
dec = ob.modifiers.new('dec', 'DECIMATE'); dec.ratio = max(0.02, 9000 / max(1, len(me.polygons)))
bpy.ops.object.modifier_apply(modifier='dec')
bpy.ops.object.shade_smooth()
print('ASYQ verts', len(me.vertices), 'tris', sum(len(p.vertices) - 2 for p in me.polygons))

# ── 5. материал (для рендера и glTF) ──
mat = bpy.data.materials.new('Bone'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.38
for nm, val in (('Subsurface Weight', 0.15), ('Coat Weight', 0.25)):
    if nm in bsdf.inputs: bsdf.inputs[nm].default_value = val
ob.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'asyq.glb'), export_format='GLB', use_selection=False,
                          export_colors=True, export_normals=True, export_texcoords=False, export_materials='EXPORT',
                          export_draco_mesh_compression_enable=False, export_yup=True)

# ── 6. рендер Cycles: асық на войлоке ──
if os.environ.get('RENDER', '1') == '1':
    ob.location = (0, 0, 0); ob.rotation_euler = (0.35, 0.15, 0.9)
    # вторая кость — красная сақа
    sq = ob.copy(); sq.data = ob.data.copy(); scene.collection.objects.link(sq)
    m2 = mat.copy(); m2.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.45, 0.04, 0.02, 1)
    mix = m2.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    m2.node_tree.links.new(m2.node_tree.nodes['Color Attribute'].outputs['Color'] if 'Color Attribute' in m2.node_tree.nodes else m2.node_tree.nodes[-2].outputs['Color'], mix.inputs[6])
    mix.inputs[7].default_value = (0.75, 0.08, 0.05, 1)
    m2.node_tree.links.new(mix.outputs[2], m2.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    sq.data.materials.clear(); sq.data.materials.append(m2)
    sq.location = (0.62, 0.32, 0.0); sq.rotation_euler = (math.pi / 2, 0.2, -0.5); sq.scale = (1.12,) * 3
    bpy.context.view_layer.update()
    for o in (ob, sq):
        zmin = min((o.matrix_world @ v.co).z for v in o.data.vertices); o.location.z -= zmin
    # войлок
    bpy.ops.mesh.primitive_plane_add(size=6); fl = bpy.context.active_object
    fm = bpy.data.materials.new('Felt'); fm.use_nodes = True; fb = fm.node_tree.nodes['Principled BSDF']
    fb.inputs['Base Color'].default_value = (0.16, 0.035, 0.025, 1); fb.inputs['Roughness'].default_value = 1
    nz = fm.node_tree.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 400
    bump = fm.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.3
    fm.node_tree.links.new(nz.outputs['Fac'], bump.inputs['Height']); fm.node_tree.links.new(bump.outputs['Normal'], fb.inputs['Normal'])
    fl.data.materials.append(fm)
    # свет
    bpy.ops.object.light_add(type='AREA', location=(1.2, -1.4, 1.6)); k = bpy.context.active_object; k.data.energy = 120; k.data.size = 0.8; k.data.color = (1, 0.88, 0.7)
    k.rotation_euler = (0.75, 0, 0.7)
    bpy.ops.object.light_add(type='AREA', location=(-1.5, 1.2, 0.8)); r = bpy.context.active_object; r.data.energy = 40; r.data.size = 1.5; r.data.color = (0.6, 0.7, 1)
    r.rotation_euler = (1.1, 0, -2.3)
    world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True; world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.01, 0.008, 1)
    # камера
    bpy.ops.object.camera_add(location=(0.75, -2.3, 0.95)); cam = bpy.context.active_object; scene.camera = cam
    cam.data.lens = 55; cam.data.dof.use_dof = True; cam.data.dof.focus_object = ob; cam.data.dof.aperture_fstop = 5.6
    tgt = bpy.data.objects.new('t', None); scene.collection.objects.link(tgt); tgt.location = (0.25, 0.1, 0.12)
    tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = int(os.environ.get('SAMPLES', '64')); scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = 1400, 900
    scene.view_settings.view_transform = 'AgX' if 'AgX' in [v.name for v in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
    scene.render.filepath = os.path.join(OUT, 'asyq_render.png')
    bpy.ops.render.render(write_still=True)
print('DONE')
