"""Render a foil booster pack.  python pack.py <id> <hex1,hex2,hex3> <out.png> [--back] [--res 760]"""
import bpy, sys, os, math, numpy as np
a = sys.argv[1:]; pid, cols, out = a[0], a[1].split(','), a[2]; BACK = '--back' in a
RES = int(a[a.index('--res') + 1]) if '--res' in a else 760
SAMPLES = int(a[a.index('--samples') + 1]) if '--samples' in a else 96
HERE = os.path.dirname(os.path.abspath(__file__))
def rgb(h): h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]; return [x ** 2.2 for x in c] + [1]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
# ── pack: a pillow of foil, flat crimped seals at both ends
W, H = 1.0, 1.585; NX, NY = 150, 240
rng = np.random.default_rng(11)
us = np.linspace(-1, 1, NX + 1); vs = np.linspace(-1, 1, NY + 1)
U, V = np.meshgrid(us, vs)
SEAL = 0.84
body = np.clip(1 - (np.abs(V) / SEAL) ** 2.6, 0, 1) ** 0.6 * np.clip(1 - np.abs(U) ** 2.4, 0, 1) ** 0.55
Z = 0.085 * body
# creases fanning out of each seal, fading into the body
fade = np.exp(-np.clip(SEAL - np.abs(V), 0, 1) * 7.0) * (np.abs(V) < SEAL)
Z += 0.012 * fade * np.sin(U * 13 + np.sin(V * 9) * 1.3) * np.clip(1 - np.abs(U) ** 6, 0, 1)
# long soft wrinkles across the body
Z += 0.006 * body * (np.sin(U * 5.2 + V * 2.1) * np.sin(V * 3.7 - U * 1.4) + 0.6 * np.sin(U * 9.5 - V * 6.3))
# crimp ridges in the seals
seal = (np.abs(V) >= SEAL)
Z += seal * 0.0045 * np.sin(U * math.pi * 46)
verts = np.stack([U * W / 2, V * H / 2, Z], -1).reshape(-1, 3)
idx = np.arange((NX + 1) * (NY + 1)).reshape(NY + 1, NX + 1)
faces = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], -1).reshape(-1, 4)
me = bpy.data.meshes.new('pack'); me.from_pydata(verts.tolist(), [], faces.tolist())
uv = me.uv_layers.new(name='uv'); flat = np.stack([(U + 1) / 2, (V + 1) / 2], -1).reshape(-1, 2)
loops = np.array([l.vertex_index for l in me.loops]); uv.data.foreach_set('uv', flat[loops].ravel())
me.polygons.foreach_set('use_smooth', [True] * len(me.polygons)); me.update()
ob = bpy.data.objects.new('pack', me); sc.collection.objects.link(ob)

# ── foil material
m = bpy.data.materials.new('foil'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
for n in list(N): N.remove(n)
outn = N.new('ShaderNodeOutputMaterial'); tc = N.new('ShaderNodeTexCoord')
c1, c2, c3 = rgb(cols[0]), rgb(cols[1]), rgb(cols[2])
# colour: vertical ramp of the three pack colours, then broken up per crystal facet
sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['UV'], sep.inputs[0])
ramp = N.new('ShaderNodeValToRGB'); L.new(sep.outputs['Y'], ramp.inputs[0])
ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = [x * 0.75 for x in c3[:3]] + [1]
ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = c2
e = ramp.color_ramp.elements.new(0.5); e.color = [x * 0.9 for x in c2[:3]] + [1]
mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (8.5, 13.5, 1); L.new(tc.outputs['UV'], mp.inputs[0])
vor = N.new('ShaderNodeTexVoronoi'); vor.feature = 'F1'; vor.inputs['Scale'].default_value = 1.0; L.new(mp.outputs[0], vor.inputs['Vector'])
# each facet: its own brightness and its own tilt, like cut crystal
hsv = N.new('ShaderNodeSeparateColor'); L.new(vor.outputs['Color'], hsv.inputs[0])
mr = N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.5; mr.inputs['To Max'].default_value = 1.2; L.new(hsv.outputs['Red'], mr.inputs['Value'])
mul = N.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs['Fac'].default_value = 1.0
bright = N.new('ShaderNodeCombineColor'); [L.new(mr.outputs[0], bright.inputs[i]) for i in range(3)]
L.new(ramp.outputs['Color'], mul.inputs['Color1']); L.new(bright.outputs[0], mul.inputs['Color2'])
nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.0 if BACK else 0.42
tilt = N.new('ShaderNodeMixRGB'); tilt.inputs['Fac'].default_value = 0.35; tilt.inputs['Color1'].default_value = (0.5, 0.5, 1, 1); L.new(vor.outputs['Color'], tilt.inputs['Color2'])
L.new(tilt.outputs[0], nm.inputs['Color'])
# fine crinkle of the foil itself
noi = N.new('ShaderNodeTexNoise'); noi.inputs['Scale'].default_value = 34; noi.inputs['Detail'].default_value = 6; noi.inputs['Roughness'].default_value = 0.6
L.new(tc.outputs['UV'], noi.inputs['Vector'])
bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.11; bump.inputs['Distance'].default_value = 0.02
L.new(noi.outputs['Fac'], bump.inputs['Height']); L.new(nm.outputs[0], bump.inputs['Normal'])
foil = N.new('ShaderNodeBsdfPrincipled'); foil.inputs['Metallic'].default_value = 1.0; foil.inputs['Roughness'].default_value = 0.26
L.new((ramp if BACK else mul).outputs['Color'], foil.inputs['Base Color']); L.new(bump.outputs[0], foil.inputs['Normal'])
shader = foil.outputs[0]
if not BACK:
    # the print: opaque white ink (and the emblem) laid on the foil, following its wrinkles
    img = N.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(os.path.join(HERE, 'art', pid + '.png')); img.extension = 'CLIP'
    L.new(tc.outputs['UV'], img.inputs[0])
    ink = N.new('ShaderNodeBsdfPrincipled'); ink.inputs['Roughness'].default_value = 0.42; ink.inputs['Metallic'].default_value = 0.0
    L.new(img.outputs['Color'], ink.inputs['Base Color']); L.new(bump.outputs[0], ink.inputs['Normal'])
    ink.inputs['Emission Color'].default_value = (1, 1, 1, 1); L.new(img.outputs['Color'], ink.inputs['Emission Color']); ink.inputs['Emission Strength'].default_value = 0.0
    mix = N.new('ShaderNodeMixShader'); L.new(img.outputs['Alpha'], mix.inputs[0]); L.new(foil.outputs[0], mix.inputs[1]); L.new(ink.outputs[0], mix.inputs[2])
    shader = mix.outputs[0]
# zig-zag cut ends
msk = N.new('ShaderNodeTexImage'); msk.image = bpy.data.images.load(os.path.join(HERE, 'art', 'mask.png')); msk.extension = 'CLIP'; L.new(tc.outputs['UV'], msk.inputs[0])
tr = N.new('ShaderNodeBsdfTransparent'); cut = N.new('ShaderNodeMixShader')
L.new(msk.outputs['Alpha'], cut.inputs[0]); L.new(tr.outputs[0], cut.inputs[1]); L.new(shader, cut.inputs[2]); L.new(cut.outputs[0], outn.inputs['Surface'])
ob.data.materials.append(m)

# ── studio: soft boxes for the foil to reflect, nothing visible to the camera
def box(name, loc, rot, size, power, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.shape = 'RECTANGLE'; d.size, d.size_y = size; d.energy = power; d.color = color
    o = bpy.data.objects.new(name, d); o.location = loc; o.rotation_euler = [math.radians(x) for x in rot]; sc.collection.objects.link(o)
box('key', (-1.5, 1.0, 1.6), (-28, -42, 0), (1.2, 2.6), 150)
box('fill', (1.6, -0.3, 1.5), (8, 46, 0), (0.7, 2.6), 22)
box('strip', (0.0, 1.6, 1.1), (-55, 0, 0), (2.4, 0.4), 85)
box('front', (0.1, 0.0, 3.0), (0, 0, 0), (0.5, 2.2), 26)
box('low', (0.2, -1.6, 1.0), (56, 0, 0), (2.2, 0.5), 30, tuple(rgb(cols[0])[:3]))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.006, 0.007, 0.01, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = H * 1.0
co = bpy.data.objects.new('cam', cam); co.location = (0, 0, 5); sc.collection.objects.link(co); sc.camera = co
r = sc.render; r.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
r.resolution_x = RES; r.resolution_y = round(RES * H / W); r.resolution_percentage = 100; r.film_transparent = True
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
try: sc.view_settings.view_transform = 'Khronos PBR Neutral'
except Exception: sc.view_settings.view_transform = 'Standard'
r.filepath = os.path.abspath(out); bpy.ops.render.render(write_still=True)
