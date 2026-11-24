"""
Warfare Fitness — exercise comparison renderer (Blender / bpy).

Builds a matte graphite mannequin in a dark studio, drives it with simple
sagittal-plane kinematics (so the movement is biomechanically credible:
the bar stays over mid-foot in the squat, the leg press sled runs on a fixed
rail) and renders one looping rep.

  python rig.py -- <exercise> <glow 0|1> <view a|b> <outdir> [samples] [res] [frames]

exercise: squat | press | rdl | hipthrust (squat and press implemented)
glow: 1 lights the working muscles in brand gold, weighted per exercise.
Reusable: add an exercise by writing a pose(s) function that returns joints.
"""
import bpy, math, sys
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
EX, GLOW, VIEW, OUT = a[0], a[1] == '1', a[2], a[3]
SAMPLES = int(a[4]) if len(a) > 4 else 24
RES = int(a[5]) if len(a) > 5 else 1080
FRAMES = int(a[6]) if len(a) > 6 else 48

ACCENT = (0.96, 0.62, 0.12)
L_SH, L_TH, L_TO, L_UA, L_FA = 0.44, 0.45, 0.50, 0.29, 0.27

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------- materials ----------
def mat(name, base, rough=0.5, metal=0.0, emit=None, es=0.0, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*base, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if coat: p.inputs['Coat Weight'].default_value = coat
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = es
    return m

SKIN = mat('graphite', (0.045, 0.045, 0.05), 0.42, coat=0.25)
STEEL = mat('steel', (0.55, 0.55, 0.57), 0.28, 1.0)
RUBBER = mat('rubber', (0.018, 0.018, 0.02), 0.6)
PAD = mat('pad', (0.03, 0.03, 0.032), 0.55)
FRAME = mat('frame', (0.05, 0.05, 0.055), 0.45, 0.35)
FLOOR = mat('floor', (0.006, 0.006, 0.007), 0.4)

def glow_mat(level):
    return mat(f'glow{level}', (0.25, 0.14, 0.03), 0.4, emit=ACCENT, es=0.4 + 2.6 * level)

# ---------- primitives ----------
def ellipsoid(name, m, seg=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1)
    o = bpy.context.object; o.name = name
    bpy.ops.object.shade_smooth(); o.data.materials.append(m)
    return o

def cyl(name, m, r, depth, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth)
    o = bpy.context.object; o.name = name
    bpy.ops.object.shade_smooth(); o.data.materials.append(m)
    return o

def box(name, m, sx, sy, sz, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.name = name; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 4
    o.data.materials.append(m); bpy.ops.object.shade_smooth()
    return o

def place(o, p, q, rx, ry, fwd=None, frame=None, extra=1.0):
    """Ellipsoid between points p and q, radii rx (front/back) ry (side)."""
    d = q - p; L = d.length; z = d.normalized()
    f = (fwd if fwd is not None else Vector((1, 0, 0)))
    x = (f - z * f.dot(z)).normalized()
    y = z.cross(x)
    M = Matrix((x, y, z)).transposed().to_4x4()
    o.matrix_world = Matrix.Translation((p + q) / 2) @ M @ Matrix.Diagonal((rx, ry, L / 2 * extra, 1))
    if frame is not None:
        o.keyframe_insert('location', frame=frame)
        o.keyframe_insert('rotation_euler', frame=frame)
        o.keyframe_insert('scale', frame=frame)

def place_cyl(o, p, q, frame=None):
    d = q - p; z = d.normalized()
    o.rotation_mode = 'QUATERNION'
    o.location = (p + q) / 2
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(z)
    if frame is not None:
        o.keyframe_insert('location', frame=frame); o.keyframe_insert('rotation_quaternion', frame=frame)

def ik2(root, target, l1, l2, pole):
    """Two-bone IK: returns middle joint, bending toward pole."""
    d = target - root; D = min(d.length, l1 + l2 - 1e-4); u = d.normalized()
    a = (l1 * l1 + D * D - l2 * l2) / (2 * D); h = math.sqrt(max(l1 * l1 - a * a, 0))
    pv = (pole - u * pole.dot(u)).normalized()
    return root + u * a + pv * h

def rot(v, deg):  # rotate in XZ plane, + = toward +x from +z
    r = math.radians(deg)
    return Vector((v.x * math.cos(r) + v.z * math.sin(r), v.y, -v.x * math.sin(r) + v.z * math.cos(r)))

# ---------- rep timing (eccentric slower than concentric) ----------
def ease(t): return t * t * (3 - 2 * t)
def depth(i):
    t = i / FRAMES
    if t < 0.10: return 0.0
    if t < 0.52: return ease((t - 0.10) / 0.42)
    if t < 0.60: return 1.0
    if t < 0.92: return 1 - ease((t - 0.60) / 0.32)
    return 0.0

# ---------- poses: return dict of joints (world) ----------
HIP_W, SH_W = 0.12, 0.2

def pose_squat(s):
    ankle = Vector((0, 0, 0.085))
    a_sh = 38 * s                                   # shank forward lean
    knee = ankle + L_SH * Vector((math.sin(math.radians(a_sh)), 0, math.cos(math.radians(a_sh))))
    th = 4 + 98 * s                                 # thigh from vertical, hips travel back
    hip = knee + L_TH * Vector((-math.sin(math.radians(th)), 0, math.cos(math.radians(th))))
    # Torso lean solved so the bar stays over mid-foot (x ~ 0.06).
    bar_x = 0.06
    lean = math.degrees(math.asin(max(-0.9, min(0.9, (bar_x - hip.x) / (L_TO + 0.02)))))
    lean = max(lean, 4)
    tdir = Vector((math.sin(math.radians(lean)), 0, math.cos(math.radians(lean))))
    neck = hip + tdir * L_TO
    tf = rot(tdir, 90)                              # torso front
    bar = neck - tf * 0.07 + tdir * 0.0
    return dict(ankle=ankle, knee=knee, hip=hip, neck=neck, tdir=tdir, tf=tf, bar=bar,
                hand_off=0.36, hands=None, foot_dir=Vector((1, 0, 0)))

PRESS_W = rot(Vector((0, 0, 1)), 58).normalized()  # sled line, 32 deg above horizontal
PRESS_HIP = Vector((0.0, 0, 0.62))
def pose_press(s):
    hip = PRESS_HIP
    D = 0.86 - 0.47 * s
    ankle = hip + PRESS_W * D
    tdir = rot(Vector((0, 0, 1)), -55)               # reclined against back pad
    neck = hip + tdir * L_TO
    tf = rot(tdir, 90)
    p = Vector((-PRESS_W.z, 0, PRESS_W.x))           # along platform, toes up
    return dict(ankle=ankle, knee=None, hip=hip, neck=neck, tdir=tdir, tf=tf, bar=None,
                hand_off=0.3, hands=hip + Vector((0.1, 0, -0.08)), foot_dir=p, knee_pole=Vector((-0.2, 0, 1)))

POSE = {'squat': pose_squat, 'press': pose_press}[EX]

# ---------- build mannequin ----------
parts = {}
def P(n, m=SKIN): parts[n] = ellipsoid(n, m); return parts[n]
for side in 'LR':
    for n in ('shank', 'thigh', 'foot', 'uarm', 'farm', 'hand', 'calf'):
        P(n + side)
for n in ('pelvis', 'abs', 'chest', 'neck', 'head', 'shL', 'shR'):
    P(n)

LV = {'squat': dict(quad=1.0, glute=0.85, back=0.6, core=0.55, ham=0.35),
      'press': dict(quad=1.0, glute=0.5, back=0.0, core=0.08, ham=0.15)}[EX]
G = {}
if GLOW:
    for side in 'LR':
        for k in ('quad', 'glute', 'ham'):
            if LV[k] > 0.05: G[k + side] = ellipsoid(k + side, glow_mat(LV[k]))
    for k in ('back', 'core'):
        if LV[k] > 0.05: G[k] = ellipsoid(k, glow_mat(LV[k]))

def build_frame(i):
    s = depth(i); J = POSE(s); f = i + 1
    tdir, tf, hip, neck = J['tdir'], J['tf'], J['hip'], J['neck']
    for side, sy in (('L', 1), ('R', -1)):
        off = Vector((0, sy * HIP_W, 0))
        h = hip + off; an = J['ankle'] + off * (1.45 if EX == 'squat' else 1.3)
        if J['knee'] is not None:
            kn = J['knee'] + off * 1.55
        else:
            kn = ik2(h, an, L_TH, L_SH, J['knee_pole'])
        thf = rot((kn - h).normalized(), 90)
        place(parts['thigh' + side], h, kn, 0.098, 0.092, fwd=thf, frame=f, extra=1.08)
        shf = rot((an - kn).normalized(), 90)
        place(parts['shank' + side], kn, an, 0.056, 0.056, fwd=shf, frame=f, extra=1.06)
        cf = kn + (an - kn) * 0.33 - shf * 0.022
        place(parts['calf' + side], kn + (an - kn) * 0.08 - shf * 0.02, kn + (an - kn) * 0.62 - shf * 0.02, 0.058, 0.056, fwd=shf, frame=f)
        fd = J['foot_dir']
        heel = an - fd * 0.06 - (Vector((0, 0, 0.06)) if EX == 'squat' else PRESS_W * 0.05)
        toe = heel + fd * 0.26
        place(parts['foot' + side], heel, toe, 0.04, 0.045, fwd=(Vector((0, 0, 1)) if EX == 'squat' else -PRESS_W), frame=f)
        if GLOW:
            dn = (kn - h).normalized()
            if 'quad' + side in G:
                place(G['quad' + side], h + dn * 0.07 + thf * 0.03, kn - dn * 0.06 + thf * 0.035, 0.082, 0.082, fwd=thf, frame=f, extra=1.0)
            if 'ham' + side in G:
                place(G['ham' + side], h + dn * 0.1 - thf * 0.03, kn - dn * 0.1 - thf * 0.03, 0.064, 0.066, fwd=thf, frame=f)
            if 'glute' + side in G:
                c = hip + off * 0.85 - tf * 0.075 - tdir * 0.03
                place(G['glute' + side], c - tdir * 0.075, c + tdir * 0.075, 0.075, 0.085, fwd=tf, frame=f)
    # trunk
    place(parts['pelvis'], hip - tdir * 0.07, hip + tdir * 0.15, 0.12, 0.18, fwd=tf, frame=f)
    place(parts['abs'], hip + tdir * 0.08, hip + tdir * 0.32, 0.11, 0.165, fwd=tf, frame=f)
    place(parts['chest'], hip + tdir * 0.24, neck + tdir * 0.02, 0.14, 0.215, fwd=tf, frame=f, extra=1.05)
    place(parts['neck'], neck - tdir * 0.02, neck + tdir * 0.09, 0.045, 0.048, fwd=tf, frame=f)
    hd = (tdir + Vector((0, 0, 1)) * (0.6 if EX == 'squat' else 0.2)).normalized()
    hb = neck + tdir * 0.07
    place(parts['head'], hb, hb + hd * 0.235, 0.098, 0.088, fwd=rot(hd, 90), frame=f)
    if GLOW:
        if 'back' in G:
            place(G['back'], hip + tdir * 0.05 - tf * 0.07, hip + tdir * 0.33 - tf * 0.085, 0.05, 0.12, fwd=tf, frame=f)
        if 'core' in G:
            place(G['core'], hip + tdir * 0.08 + tf * 0.05, hip + tdir * 0.3 + tf * 0.05, 0.07, 0.12, fwd=tf, frame=f)
    # arms
    for side, sy in (('L', 1), ('R', -1)):
        sh = neck - tdir * 0.05 + Vector((0, sy * SH_W, 0))
        place(parts['sh' + side], sh - Vector((0, sy * 0.05, 0)), sh + Vector((0, sy * 0.06, 0)), 0.08, 0.075, fwd=tf, frame=f)
        if J['bar'] is not None:
            hand = J['bar'] + Vector((0, sy * J['hand_off'], 0))
            pole = -tdir * 0.6 - tf * 0.8 + Vector((0, sy * 0.4, 0))
        else:
            hand = J['hands'] + Vector((0, sy * J['hand_off'], 0))
            pole = tf * 0.2 + Vector((0, sy * 0.6, 0)) - tdir * 0.3
        el = ik2(sh, hand, L_UA, L_FA, pole)
        place(parts['uarm' + side], sh, el, 0.058, 0.058, fwd=tf, frame=f, extra=1.05)
        place(parts['farm' + side], el, hand, 0.047, 0.047, fwd=tf, frame=f, extra=1.05)
        place(parts['hand' + side], hand - (hand - el).normalized() * 0.03, hand + (hand - el).normalized() * 0.07, 0.03, 0.04, fwd=tf, frame=f)
    return J

# ---------- equipment ----------
if EX == 'squat':
    bar = cyl('bar', STEEL, 0.0145, 2.1)
    plates = []
    for sy in (1, -1):
        for k, (r, w) in enumerate(((0.225, 0.055), (0.225, 0.055), (0.16, 0.03))):
            p = cyl(f'pl{sy}{k}', RUBBER, r, w, 64); plates.append((p, sy * (0.68 + k * 0.06)))
        c = cyl(f'col{sy}', STEEL, 0.03, 0.04); plates.append((c, sy * 0.86))
    def equip(J, f):
        b = J['bar']
        place_cyl(bar, b + Vector((0, -1.05, 0)), b + Vector((0, 1.05, 0)), f)
        for p, y in plates:
            place_cyl(p, b + Vector((0, y - 0.01, 0)), b + Vector((0, y + 0.01, 0)), f)
else:
    W = PRESS_W; p = Vector((-W.z, 0, W.x))
    sled = box('sled', FRAME, 0.05, 0.72, 0.5, 0.01)
    plate_face = box('face', RUBBER, 0.012, 0.66, 0.44, 0.006)
    sled.rotation_mode = plate_face.rotation_mode = 'QUATERNION'
    q = Vector((1, 0, 0)).rotation_difference(W)
    # rails
    for sy in (0.38, -0.38):
        r = cyl(f'rail{sy}', FRAME, 0.03, 1)
        a0 = PRESS_HIP + W * 0.35 - p * 0.32 + Vector((0, sy, 0)); a1 = PRESS_HIP + W * 1.75 - p * 0.32 + Vector((0, sy, 0))
        place_cyl(r, a0, a1); r.scale.z = (a1 - a0).length
        leg = cyl(f'leg{sy}', FRAME, 0.035, 1); b0 = Vector((a1.x, sy, 0)); place_cyl(leg, b0, a1); leg.scale.z = (a1 - b0).length
        leg2 = cyl(f'legb{sy}', FRAME, 0.035, 1); b1 = Vector((a0.x, sy, 0)); place_cyl(leg2, b1, a0); leg2.scale.z = (a0 - b1).length
    # weight horns + plates on the sled
    horns = []
    for sy in (0.48, -0.48):
        h = cyl(f'horn{sy}', STEEL, 0.025, 0.28); horns.append((h, sy))
        for k in range(3):
            pl = cyl(f'wp{sy}{k}', RUBBER, 0.2, 0.045, 64); horns.append((pl, sy + (0.03 + 0.05 * k) * (1 if sy > 0 else -1)))
    # seat + back pad
    seat = box('seat', PAD, 0.42, 0.5, 0.09, 0.03)
    seat.location = PRESS_HIP + Vector((-0.12, 0, -0.14)); seat.rotation_euler = (0, math.radians(-8), 0)
    back = box('backpad', PAD, 0.09, 0.5, 0.78, 0.03)
    td = rot(Vector((0, 0, 1)), -55)
    back.location = PRESS_HIP + td * 0.42 - rot(td, 90) * 0.15
    back.rotation_euler = (0, math.radians(-55), 0)
    base = box('base', FRAME, 2.6, 1.0, 0.05, 0.01); base.location = (0.5, 0, 0.025)
    pedestal = box('ped', FRAME, 0.2, 0.3, 0.5, 0.01); pedestal.location = PRESS_HIP + Vector((-0.12, 0, -0.45))
    def equip(J, f):
        c = J['ankle'] + W * 0.07
        sled.location = c + W * 0.03; sled.rotation_quaternion = q
        plate_face.location = c - W * 0.0; plate_face.rotation_quaternion = q
        sled.keyframe_insert('location', frame=f); sled.keyframe_insert('rotation_quaternion', frame=f)
        plate_face.keyframe_insert('location', frame=f); plate_face.keyframe_insert('rotation_quaternion', frame=f)
        for o, y in horns:
            base_pt = c + W * 0.12 + p * 0.05
            place_cyl(o, base_pt + Vector((0, y - 0.012, 0)), base_pt + Vector((0, y + 0.012, 0)) if 'wp' in o.name else base_pt + Vector((0, y + (0.28 if y > 0 else -0.28), 0)), f)

for i in range(FRAMES):
    J = build_frame(i); equip(J, i + 1)
for o in bpy.data.objects:
    if o.animation_data and o.animation_data.action:
        for fc in getattr(o.animation_data.action, 'fcurves', []):
            for k in fc.keyframe_points: k.interpolation = 'LINEAR'

# ---------- studio ----------
bpy.ops.mesh.primitive_plane_add(size=40); fl = bpy.context.object; fl.data.materials.append(FLOOR)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.004, 0.004, 0.005, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 1.0

def light(name, loc, energy, color, size, target=(0, 0, 0.9)):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = color; L.size = size
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o
cx = 0.0 if EX == 'squat' else 0.45
light('key', (2.2, -3.0, 2.8), 260, (1, 0.97, 0.94), 1.6, (cx, 0, 1.1))
light('rimA', (-2.6, 1.2, 2.2), 520, ACCENT, 0.8, (cx, 0, 1.0))
light('rimB', (-2.2, -2.0, 1.6), 240, (0.75, 0.8, 1.0), 0.8, (cx, 0, 1.0))
light('top', (cx, 0, 4.2), 60, (0.9, 0.92, 1), 2.0, (cx, 0, 0))
# soft backdrop glow far behind
bpy.ops.mesh.primitive_plane_add(size=1); bg = bpy.context.object
bg.scale = (14, 1, 7); bg.location = (cx - 4.5, 0, 2.5); bg.rotation_euler = (math.radians(90), 0, math.radians(90))
bg.location = (cx - 6, 0, 2.5); bgm = mat('bg', (0.0, 0.0, 0.0), 1.0, emit=(0.16, 0.1, 0.035), es=0.06); bg.data.materials.append(bgm)

# ---------- camera ----------
cam = bpy.data.cameras.new('cam'); cam.lens = 62 if EX == 'squat' else 52
cam.dof.use_dof = True; cam.dof.aperture_fstop = 3.2
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
ang = {'a': 58, 'b': 88}[VIEW]
tgt = Vector((cx, 0, 0.88 if EX == 'squat' else 0.78))
dist = 5.6 if EX == 'squat' else 5.4
r = math.radians(ang)
co.location = tgt + Vector((math.cos(r) * dist, -math.sin(r) * dist, 0.55))
co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()
cam.dof.focus_distance = (tgt - co.location).length

r_ = sc.render; r_.engine = 'CYCLES'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.cycles.device = 'CPU'; sc.cycles.max_bounces = 4; sc.cycles.use_adaptive_sampling = True
r_.resolution_x = RES; r_.resolution_y = RES; r_.film_transparent = False
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
r_.image_settings.file_format = 'PNG'; r_.use_persistent_data = True
sc.frame_start, sc.frame_end = 1, FRAMES
r_.filepath = OUT.rstrip('/') + '/f_'
if '--still' in a:
    sc.frame_set(int(a[a.index('--still') + 1])); r_.filepath = OUT; bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
if '--blend' in a:
    bpy.ops.wm.save_as_mainfile(filepath=a[a.index('--blend') + 1])
