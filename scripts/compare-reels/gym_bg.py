"""
Dark gym backdrop for the reels (Blender / bpy), rendered once as a still.

  python gym_bg.py -- out.png [samples]

A moody strength room: concrete wall, rubber floor, racks and plate trees in
the background, strip lights overhead, one warm spotlight on the stage where
the athlete is composited. Shallow depth of field so it reads as a real room
without competing with the figure.
"""
import bpy, sys, math, random
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
OUT = a[0]; SAMPLES = int(a[1]) if len(a) > 1 else 96
random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, col, rough=0.6, metal=0.0, emit=None, es=0.0, noise=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    if emit: p.inputs['Emission Color'].default_value = (*emit, 1); p.inputs['Emission Strength'].default_value = es
    if noise:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 6; n.inputs['Detail'].default_value = 8
        r = nt.nodes.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].color = (col[0] * (1 - noise), col[1] * (1 - noise), col[2] * (1 - noise), 1)
        r.color_ramp.elements[1].color = (*col, 1)
        nt.links.new(n.outputs['Fac'], r.inputs['Fac']); nt.links.new(r.outputs['Color'], p.inputs['Base Color'])
    return m

CONC = mat('concrete', (0.035, 0.035, 0.038), 0.85, noise=0.6)
FLOOR = mat('rubber', (0.012, 0.012, 0.013), 0.42, noise=0.4)
STEEL = mat('steel', (0.09, 0.09, 0.095), 0.35, 0.85)
RUBBER = mat('plates', (0.015, 0.015, 0.016), 0.55)
LIGHT = mat('strip', (1, 1, 1), emit=(1, 0.93, 0.82), es=22)
ACC = mat('accent', (0, 0, 0), emit=(0.96, 0.6, 0.12), es=14)

def box(loc, size, m):
    bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object; o.scale = (size[0] / 2, size[1] / 2, size[2] / 2); o.data.materials.append(m); return o
def cyl(loc, r, d, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=d, location=loc, rotation=rot); o = bpy.context.object; o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o

# room: floor, back wall, side walls
box((0, 0, -0.05), (30, 30, 0.1), FLOOR)
box((0, 9, 4), (30, 0.3, 8), CONC)
box((-7, 0, 4), (0.3, 30, 8), CONC)
box((7, 0, 4), (0.3, 30, 8), CONC)
# accent light line on the back wall
box((0, 8.84, 2.6), (9, 0.02, 0.04), ACC)

# power racks along the back
for x in (-4.2, -1.4, 1.4, 4.2):
    for dx in (-0.55, 0.55):
        for dy in (-0.55, 0.55):
            box((x + dx, 7.2 + dy, 1.15), (0.08, 0.08, 2.3), STEEL)
    box((x, 7.2 - 0.55, 2.3), (1.2, 0.08, 0.08), STEEL); box((x, 7.2 + 0.55, 2.3), (1.2, 0.08, 0.08), STEEL)
    cyl((x, 6.6, 1.4), 0.016, 2.2, STEEL, (0, math.radians(90), 0))
    for s in (-1, 1):
        for k in range(2):
            cyl((x + s * (0.82 + 0.06 * k), 6.6, 1.4), 0.225, 0.05, RUBBER, (0, math.radians(90), 0))
# plate trees and dumbbell rack on the sides
for x in (-5.8, 5.8):
    box((x, 4.5, 0.8), (0.1, 0.1, 1.6), STEEL)
    for z in (0.4, 0.8, 1.2):
        cyl((x, 4.5, z), 0.2 + random.random() * 0.03, 0.06, RUBBER, (math.radians(90), 0, math.radians(90)))
for i in range(10):
    x = -3.6 + i * 0.8
    box((x, 8.3, 0.5), (0.6, 0.5, 0.05), STEEL)
    cyl((x, 8.3, 0.62), 0.09, 0.32, RUBBER, (0, math.radians(90), 0))
# overhead strip lights, receding
for y in (2, 4.5, 7):
    for x in (-3, 0, 3):
        box((x, y, 5.2), (1.8, 0.12, 0.04), LIGHT)

# warm spot on the stage
L = bpy.data.lights.new('spot', 'SPOT'); L.energy = 4200; L.color = (1, 0.82, 0.55); L.spot_size = math.radians(42); L.spot_blend = 0.6; L.shadow_soft_size = 0.4
o = bpy.data.objects.new('spot', L); sc.collection.objects.link(o); o.location = (0, 0.6, 5.0); o.rotation_euler = (math.radians(4), 0, 0)
F = bpy.data.lights.new('fill', 'AREA'); F.energy = 120; F.size = 6; F.color = (0.7, 0.78, 1)
o = bpy.data.objects.new('fill', F); sc.collection.objects.link(o); o.location = (0, -4, 3); o.rotation_euler = (math.radians(70), 0, 0)

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.002, 0.002, 0.003, 1)
# light haze for the beam
vol = w.node_tree.nodes.new('ShaderNodeVolumePrincipled'); vol.inputs['Density'].default_value = 0.012
w.node_tree.links.new(vol.outputs[0], w.node_tree.nodes['World Output'].inputs['Volume'])

cam = bpy.data.cameras.new('cam'); cam.lens = 30; cam.dof.use_dof = True; cam.dof.focus_distance = 4.0; cam.dof.aperture_fstop = 0.75
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0, -4.6, 1.0); co.rotation_euler = (math.radians(91), 0, 0)

r = sc.render; r.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
r.resolution_x, r.resolution_y = (2160, 3840) if '--4k' in a else (1080, 1920)
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
r.filepath = OUT; bpy.ops.render.render(write_still=True)
