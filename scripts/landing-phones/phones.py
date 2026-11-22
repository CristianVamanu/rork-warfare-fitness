import bpy, bmesh, math, sys, os
D = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[sys.argv.index('--') + 1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.samples = 160; sc.cycles.use_denoising = False
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = 2600, 2800
sc.view_settings.view_transform = 'Standard'
W, H, T = 0.74, 1.54, 0.08

def pbr(name, color, metallic, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Metallic'].default_value = metallic; b.inputs['Roughness'].default_value = rough
    return m
GOLD = pbr('black', (0.025, 0.025, 0.028), 1.0, 0.38)
BLACK = pbr('black', (0.008, 0.008, 0.01), 0.0, 0.06)
def mat_screen(img):
    m = bpy.data.materials.new('scr'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(D, img))
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Strength'].default_value = 1.15
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(t.outputs['Color'], e.inputs['Color']); nt.links.new(e.outputs['Emission'], o.inputs['Surface'])
    return m

def slab(w, h, t, r, mat, name, edge=0.012):
    """Box with corners rounded in the face plane (radius r) and softened rims."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(w, h, t), verts=bm.verts)
    vert_edges = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-6]
    bmesh.ops.bevel(bm, geom=vert_edges, offset=r, segments=14, affect='EDGES', profile=0.5)
    if edge > 0 and t > edge * 2.2:
        rim = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=rim, offset=edge, segments=4, affect='EDGES', profile=0.5)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    me.materials.append(mat)
    return o

def screen(w, h, r, img):
    o = slab(w, h, 0.002, r, mat_screen(img), 'screen', edge=0)
    uv = o.data.uv_layers.new(name='uv')
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            co = o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv = (co.x / w + 0.5, co.y / h + 0.5)
    return o

def phone(img, loc, rot):
    body = slab(W, H, T, 0.125, GOLD, 'body')
    face = slab(W - 0.026, H - 0.026, 0.006, 0.113, BLACK, 'face', edge=0); face.location.z = T / 2 + 0.001
    s = screen(W - 0.07, H - 0.07, 0.095, img); s.location.z = T / 2 + 0.0055
    isl = slab(0.2, 0.052, 0.002, 0.0259, BLACK, 'island', edge=0); isl.location = (0, H / 2 - 0.082, T / 2 + 0.0075)
    for o in (face, s, isl): o.parent = body
    body.location = loc; body.rotation_euler = [math.radians(a) for a in rot]
    return body

phone('screen_ripz.jpg', (0.52, -0.02, -0.75), (0, -26, -7))
phone('screen_home_p.jpg', (-0.20, 0.0, 0.2), (0, -26, -7))

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
cam.location = (0.08, 0.0, 5.45); cam.data.lens = 85; sc.camera = cam
def area(loc, rot, energy, color, size):
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'AREA')); bpy.context.collection.objects.link(l)
    l.location = loc; l.rotation_euler = [math.radians(a) for a in rot]
    l.data.energy = energy; l.data.color = color; l.data.size = size
area((-2.5, 1.0, 3.0), (0, -35, 0), 120, (1.0, 0.97, 0.94), 3)      # soft front key
area((-3.0, 0.0, -0.4), (0, -95, 0), 300, (0.95, 0.95, 1.0), 2.5)  # orange light on the left edges
area((3.0, 0.5, -0.6), (0, 95, 0), 450, (1.0, 0.96, 0.92), 2.5)    # orange rim from the right
area((0, -3, 0.5), (80, 0, 0), 250, (1.0, 0.8, 0.6), 2.5)          # glow from below
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.22, 0.22, 0.24, 1); bg.inputs['Strength'].default_value = 0.45
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
