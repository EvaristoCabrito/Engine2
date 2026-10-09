# Claude's ground set: one material per Ember basic terrain, built as a real 3D scene in Blender
# (grass blades, leaves, pebbles, beveled slabs, rubble, cracked plates...) and rendered straight
# down into seamless PBR maps, for comparison with GPT's Task 9 set.
# Serial 049 is append-only: output is public/game/ground-claude/049-plains/{color,normal,rough}.png.
#
# Seamless by construction: heights and masks are periodic Fourier/Voronoi fields over the 4 x 4
# unit tile (the repeat Engine2's terrain shader uses), shader micro-detail samples 4D noise on a
# torus, and every scattered object that crosses an edge is copied to the opposite side. The
# orthographic camera sees exactly one tile.
#
# Three emission renders per terrain (no lighting involved):
#   color  = albedo x ambient-occlusion cavity (sRGB)
#   normal = shading normal incl. bump, world space; seen from straight above this is tangent space
#            (+X right, +Y up = OpenGL), encoded n * 0.5 + 0.5 (linear)
#   rough  = roughness (linear)
#
#   blender -b -t 2 --factory-startup -P tools/blender/claude-ground/bake_ground.py -- [terrain ...]
# One job at a time, two threads (the PC cuts power under all-core load).

import math
import os
import sys

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'public', 'game', 'ground-claude', '049-plains')
SIZE = int(os.environ.get('GROUND_SIZE', '2048'))
TILE = 4.0          # world units per texture repeat (1 unit = 1 hex radius; a human is ~2.6 units tall)
HALF = TILE / 2
GRID = 640          # ground mesh resolution per tile side


def rgb(h):
    h = h.lstrip('#')
    s = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return np.array([(c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in s])


# ---- periodic fields (numpy) --------------------------------------------------------------------

_FIELDS = {}


def _field(seed, kmax, power):
    """Coefficients of one periodic noise field, plus its 1%/99% range measured on a reference grid."""
    key = (seed, kmax, power)
    if key not in _FIELDS:
        rng = np.random.default_rng(seed)
        ks, amps, phs = [], [], []
        for kx in range(-kmax, kmax + 1):
            for ky in range(0, kmax + 1):
                if ky == 0 and kx <= 0:
                    continue
                k = math.hypot(kx, ky)
                if k > kmax:
                    continue
                ks.append((kx, ky)); amps.append(rng.normal() / k ** power); phs.append(rng.uniform(0, 2 * math.pi))
        f = (np.array(ks, dtype=np.float64), np.array(amps), np.array(phs))
        ref = np.linspace(-HALF, HALF, 128, endpoint=False)
        rx, ry = np.meshgrid(ref, ref)
        raw = _raw(f, rx.ravel(), ry.ravel())
        _FIELDS[key] = (f, np.percentile(raw, 1), np.percentile(raw, 99))
    return _FIELDS[key]


def _raw(f, x, y):
    ks, amps, phs = f
    out = np.zeros(len(x))
    for start in range(0, len(x), 65536):
        xs, ys = x[start:start + 65536], y[start:start + 65536]
        arg = (np.outer(xs, ks[:, 0]) + np.outer(ys, ks[:, 1])) * (2 * math.pi / TILE) + phs
        out[start:start + 65536] = np.cos(arg) @ amps
    return out


def fourier(x, y, seed, kmax=6, power=1.4):
    """Smooth periodic noise in 0..1: random integer wave vectors, so it tiles exactly every TILE."""
    f, lo, hi = _field(seed, kmax, power)
    x = np.atleast_1d(np.asarray(x, dtype=np.float64)).ravel()
    y = np.atleast_1d(np.asarray(y, dtype=np.float64)).ravel()
    return np.clip((_raw(f, x, y) - lo) / (hi - lo + 1e-9), 0, 1)


def wrap_delta(d):
    return d - TILE * np.round(d / TILE)


def voronoi(x, y, pts):
    """Periodic Voronoi: (F1 distance, F2 - F1 edge distance, nearest index)."""
    f1 = np.full(x.shape, np.inf)
    f2 = np.full(x.shape, np.inf)
    idx = np.zeros(x.shape, dtype=np.int32)
    for i, (px, py) in enumerate(pts):
        d = np.hypot(wrap_delta(x - px), wrap_delta(y - py))
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        idx = np.where(closer, i, idx)
        f1 = np.where(closer, d, f1)
    return f1, (f2 - f1) / 2, idx


def jittered(n, seed, jitter=0.9):
    """About n points spread evenly over the tile (jittered grid)."""
    rng = np.random.default_rng(seed)
    side = max(1, int(round(math.sqrt(n))))
    cell = TILE / side
    gx, gy = np.meshgrid(np.arange(side), np.arange(side))
    px = -HALF + (gx.ravel() + 0.5 + rng.uniform(-jitter / 2, jitter / 2, side * side)) * cell
    py = -HALF + (gy.ravel() + 0.5 + rng.uniform(-jitter / 2, jitter / 2, side * side)) * cell
    return np.stack([px, py], 1)


def sample(field_fn, pts):
    return field_fn(pts[:, 0], pts[:, 1])


# ---- mesh building --------------------------------------------------------------------------------

class Batch:
    """Collects many small pieces into one mesh, with per-vertex colour and roughness."""

    def __init__(self):
        self.v, self.f, self.c, self.r = [], [], [], []
        self.n = 0

    def add(self, verts, faces, color, rough):
        verts = np.asarray(verts, dtype=np.float64)
        self.v.append(verts)
        self.f.extend([[i + self.n for i in face] for face in faces])
        self.c.append(np.repeat(np.asarray(color)[None, :3], len(verts), 0))
        self.r.append(np.full(len(verts), rough))
        self.n += len(verts)

    def add_wrapped(self, verts, faces, color, rough, radius):
        """Add a piece, plus copies on the far side of any tile edge it crosses."""
        verts = np.asarray(verts, dtype=np.float64)
        cx, cy = verts[:, 0].mean(), verts[:, 1].mean()
        xs = [0.0] + ([TILE] if cx < -HALF + radius else []) + ([-TILE] if cx > HALF - radius else [])
        ys = [0.0] + ([TILE] if cy < -HALF + radius else []) + ([-TILE] if cy > HALF - radius else [])
        for dx in xs:
            for dy in ys:
                self.add(verts + [dx, dy, 0], faces, color, rough)

    def build(self, name, material, smooth=True):
        mesh = bpy.data.meshes.new(name)
        if not self.v:
            return None
        v = np.concatenate(self.v)
        mesh.from_pydata(v.tolist(), [], self.f)
        if smooth:
            mesh.shade_smooth()
        col = mesh.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
        c = np.concatenate(self.c)
        col.data.foreach_set('color', np.concatenate([c, np.ones((len(c), 1))], 1).ravel())
        ra = mesh.attributes.new('rough', 'FLOAT', 'POINT')
        ra.data.foreach_set('value', np.concatenate(self.r))
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.data.materials.append(material)
        return obj


def ground(name, height_fn, color_fn, rough_fn, material, amp):
    """The base surface: a grid over exactly one tile, periodic heights (edges match)."""
    lin = np.linspace(-HALF, HALF, GRID + 1)
    gx, gy = np.meshgrid(lin, lin)
    x, y = gx.ravel(), gy.ravel()
    h = height_fn(x, y) * amp
    verts = np.stack([x, y, h], 1)
    i = np.arange(GRID * GRID)
    r, c = i // GRID, i % GRID
    a = r * (GRID + 1) + c
    faces = np.stack([a, a + 1, a + GRID + 2, a + GRID + 1], 1)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts.tolist(), [], faces.tolist())
    mesh.shade_smooth()
    col = mesh.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
    cc = color_fn(x, y)
    col.data.foreach_set('color', np.concatenate([cc, np.ones((len(cc), 1))], 1).ravel())
    ra = mesh.attributes.new('rough', 'FLOAT', 'POINT')
    ra.data.foreach_set('value', rough_fn(x, y))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def lerp_col(t, a, b):
    t = np.asarray(t)[:, None]
    a = a if np.ndim(a) == 2 else np.asarray(a)[None, :]
    b = b if np.ndim(b) == 2 else np.asarray(b)[None, :]
    return a * (1 - t) + b * t


def ramp(t, stops):
    t = np.clip(np.asarray(t), 0, 1)
    pos = np.array([p for p, _ in stops])
    cols = np.array([c for _, c in stops])
    out = np.zeros((len(t), 3))
    for ch in range(3):
        out[:, ch] = np.interp(t, pos, cols[:, ch])
    return out


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---- shapes ---------------------------------------------------------------------------------------

def blade(rng, x, y, z, height, width, lean):
    """A curved grass blade (3 segments, tapering), leaning in a random direction."""
    ang = rng.uniform(0, 2 * math.pi)
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx
    verts, faces = [], []
    seg = 3
    for s in range(seg + 1):
        t = s / seg
        w = width * (1 - t * 0.85)
        bend = lean * t * t * height
        cx, cy, cz = x + dx * bend, y + dy * bend, z + height * t * (1 - 0.35 * lean * t)
        verts += [(cx - px * w / 2, cy - py * w / 2, cz), (cx + px * w / 2, cy + py * w / 2, cz)]
    for s in range(seg):
        a = s * 2
        faces.append([a, a + 1, a + 3, a + 2])
    return verts, faces


def disc(rng, x, y, z, rx, ry, curl, sides=8):
    """A leaf / flake: a flattened fan, slightly cupped, randomly turned and tilted."""
    ang = rng.uniform(0, 2 * math.pi)
    ca, sa = math.cos(ang), math.sin(ang)
    tilt = rng.uniform(-0.35, 0.35)
    verts = [(x, y, z + curl * 0.2)]
    for k in range(sides):
        a = 2 * math.pi * k / sides
        lx, ly = math.cos(a) * rx, math.sin(a) * ry
        lz = curl * (lx * lx + ly * ly) / max(rx * rx, 1e-6) + tilt * lx
        verts.append((x + lx * ca - ly * sa, y + lx * sa + ly * ca, z + lz))
    faces = [[0, 1 + k, 1 + (k + 1) % sides] for k in range(sides)]
    return verts, faces


_ICO = None


def ico():
    global _ICO
    if _ICO is None:
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        _ICO = (np.array([v.co[:] for v in bm.verts]), [[v.index for v in f.verts] for f in bm.faces])
        bm.free()
    return _ICO


def stone(rng, x, y, z, size, flat, rough_amt):
    """A pebble / rock: a lumpy, flattened icosphere sunk a little into the ground."""
    v, f = ico()
    k = rng.normal(size=(3, 3)) * 0.15 + np.eye(3)
    sv = v @ k.T
    lump = 1 + rough_amt * np.sin(v @ rng.normal(size=3) * 3 + rng.uniform(0, 6)) * 0.5 + rough_amt * 0.25 * rng.normal(size=len(v))
    sv = sv * lump[:, None]
    sv = sv * [size, size * rng.uniform(0.6, 1.0), size * flat]
    ang = rng.uniform(0, 2 * math.pi)
    rot = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
    sv = sv @ rot.T + [x, y, z - size * flat * 0.35]
    return sv, f


def box(x0, y0, x1, y1, z0, z1, bevel):
    """A slab with chamfered top edges."""
    b = bevel
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1 - b), (x1, y0, z1 - b), (x1, y1, z1 - b), (x0, y1, z1 - b),
        (x0 + b, y0 + b, z1), (x1 - b, y0 + b, z1), (x1 - b, y1 - b, z1), (x0 + b, y1 - b, z1),
    ]
    faces = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
             [4, 5, 9, 8], [5, 6, 10, 9], [6, 7, 11, 10], [7, 4, 8, 11], [8, 9, 10, 11]]
    return verts, faces


def poly_slab(cx, cy, corners, z0, z1, inset):
    """A stone slab from a polygon outline (Voronoi cell), with a chamfer toward its centre."""
    n = len(corners)
    top = [(cx + (px - cx) * (1 - inset), cy + (py - cy) * (1 - inset), z1) for px, py in corners]
    mid = [(px, py, z1 - inset * 0.6) for px, py in corners]
    bot = [(px, py, z0) for px, py in corners]
    verts = bot + mid + top
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
        faces.append([n + i, n + j, 2 * n + j, 2 * n + i])
    faces.append(list(range(2 * n, 3 * n)))
    return verts, faces


# ---- materials ---------------------------------------------------------------------------------

class Mat:
    """One material: attribute colour/roughness, torus micro-detail bump, three emission outputs."""

    def __init__(self, name, detail_scale=30.0, detail_bump=0.004, color_var=0.25, cavity=0.7, ao_dist=0.25, grime=0.0, speckle=0.0):
        self.m = bpy.data.materials.new(name)
        self.m.use_nodes = True
        nt = self.nt = self.m.node_tree
        nt.nodes.clear()
        N, L = nt.nodes.new, nt.links.new
        # torus coordinates from world position: periodic over the tile
        geo = N('ShaderNodeNewGeometry')
        sep = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Position'], sep.inputs[0])

        def m(op, a, b=None):
            n = N('ShaderNodeMath'); n.operation = op
            (L(a, n.inputs[0]) if hasattr(a, 'is_output') else setattr(n.inputs[0], 'default_value', a))
            if b is not None:
                (L(b, n.inputs[1]) if hasattr(b, 'is_output') else setattr(n.inputs[1], 'default_value', b))
            return n.outputs[0]
        u = m('MULTIPLY', sep.outputs['X'], 2 * math.pi / TILE)
        v = m('MULTIPLY', sep.outputs['Y'], 2 * math.pi / TILE)
        comb = N('ShaderNodeCombineXYZ')
        L(m('COSINE', u), comb.inputs['X']); L(m('SINE', u), comb.inputs['Y']); L(m('COSINE', v), comb.inputs['Z'])
        noise = N('ShaderNodeTexNoise'); noise.noise_dimensions = '4D'
        L(comb.outputs[0], noise.inputs['Vector']); L(m('SINE', v), noise.inputs['W'])
        noise.inputs['Scale'].default_value = detail_scale
        noise.inputs['Detail'].default_value = 8
        noise.inputs['Roughness'].default_value = 0.6
        # also the object's own z, so stacked pieces don't share one pattern
        attr_c = N('ShaderNodeAttribute'); attr_c.attribute_name = 'col'
        attr_r = N('ShaderNodeAttribute'); attr_r.attribute_name = 'rough'
        # colour variation from the detail noise
        var = m('ADD', 1 - color_var / 2, m('MULTIPLY', noise.outputs['Fac'], color_var))

        def torus_noise(scale, detail, seed_w):
            n = N('ShaderNodeTexNoise'); n.noise_dimensions = '4D'
            L(comb.outputs[0], n.inputs['Vector']); L(m('ADD', m('SINE', v), seed_w), n.inputs['W'])
            n.inputs['Scale'].default_value = scale
            n.inputs['Detail'].default_value = detail
            n.inputs['Roughness'].default_value = 0.6
            return n.outputs['Fac']
        if grime:
            # broad grime and staining: darker blotches across pieces (periodic, low frequency)
            gfac = m('MULTIPLY', m('SUBTRACT', 1.0, grime), 1.0)
            stain = torus_noise(2.5, 6, 11.0)
            var = m('MULTIPLY', var, m('ADD', gfac, m('MULTIPLY', m('SUBTRACT', 1.0, stain), grime * 1.4)))
        if speckle:
            # mineral grain / speckles at a fine scale
            sp = torus_noise(detail_scale * 5, 2, 23.0)
            var = m('MULTIPLY', var, m('ADD', 1.0, m('MULTIPLY', m('SUBTRACT', sp, 0.5), speckle * 2)))
        mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
        ins = [s for s in mul.inputs if s.enabled]
        next(s for s in ins if s.name == 'Factor').default_value = 1.0
        a_in, b_in = [s for s in ins if s.type == 'RGBA'][:2]
        L(attr_c.outputs['Color'], a_in)
        cv = N('ShaderNodeCombineColor')
        for ch in ('Red', 'Green', 'Blue'):
            L(var, cv.inputs[ch])
        L(cv.outputs[0], b_in)
        albedo = next(s for s in mul.outputs if s.enabled and s.type == 'RGBA')
        # ambient-occlusion cavity
        ao = N('ShaderNodeAmbientOcclusion'); ao.samples = 16
        ao.inputs['Distance'].default_value = ao_dist
        cav = m('ADD', 1 - cavity, m('MULTIPLY', ao.outputs['AO'], cavity))
        mul2 = N('ShaderNodeMix'); mul2.data_type = 'RGBA'; mul2.blend_type = 'MULTIPLY'
        ins2 = [s for s in mul2.inputs if s.enabled]
        next(s for s in ins2 if s.name == 'Factor').default_value = 1.0
        a2, b2 = [s for s in ins2 if s.type == 'RGBA'][:2]
        L(albedo, a2)
        cc = N('ShaderNodeCombineColor')
        for ch in ('Red', 'Green', 'Blue'):
            L(cav, cc.inputs[ch])
        L(cc.outputs[0], b2)
        color_out = next(s for s in mul2.outputs if s.enabled and s.type == 'RGBA')
        # bumped normal, encoded
        bump = N('ShaderNodeBump'); bump.inputs['Distance'].default_value = detail_bump
        L(noise.outputs['Fac'], bump.inputs['Height'])
        L(bump.outputs['Normal'], ao.inputs['Normal'])
        enc = N('ShaderNodeVectorMath'); enc.operation = 'MULTIPLY_ADD'
        L(bump.outputs['Normal'], enc.inputs[0])
        enc.inputs[1].default_value = (0.5, 0.5, 0.5); enc.inputs[2].default_value = (0.5, 0.5, 0.5)
        # roughness, varied a little by the detail
        rgh = m('ADD', attr_r.outputs['Fac'], m('MULTIPLY', m('SUBTRACT', noise.outputs['Fac'], 0.5), 0.12))
        rc = N('ShaderNodeCombineColor')
        for ch in ('Red', 'Green', 'Blue'):
            L(rgh, rc.inputs[ch])
        self.emit = {}
        for key, sock in (('color', color_out), ('normal', enc.outputs[0]), ('rough', rc.outputs[0])):
            e = N('ShaderNodeEmission'); L(sock, e.inputs['Color'])
            self.emit[key] = e
        self.out = N('ShaderNodeOutputMaterial')

    def show(self, key):
        self.nt.links.new(self.emit[key].outputs[0], self.out.inputs['Surface'])


# ---- terrains -----------------------------------------------------------------------------------

def scene_plains(mats, seed=0, dry=0.0, rocks=0.0, dark=0.0):
    gm = mats('ground', detail_scale=40, detail_bump=0.006)
    bm = mats('grass', detail_scale=120, detail_bump=0.0015, color_var=0.35, cavity=0.8)
    sm = mats('stones', detail_scale=60, detail_bump=0.01)
    hfield = lambda x, y: fourier(x, y, seed + 1, kmax=7) * 0.6 + fourier(x, y, seed + 2, kmax=14, power=1.0) * 0.4
    patch = lambda x, y: fourier(x, y, seed + 3, kmax=4)
    soil = [(0.0, rgb('#2c2318')), (0.5, rgb('#4a3b2b')), (1.0, rgb('#655341'))]
    ground('ground', hfield, lambda x, y: ramp(fourier(x, y, seed + 4, kmax=12, power=1.0), soil) * (0.75 if dark else 1.0),
           lambda x, y: np.full(len(x), 0.93), gm.m, 0.06)
    rng = np.random.default_rng(seed + 5)
    blades = Batch()
    pts = jittered(42000, seed + 6, jitter=1.0)
    dens = sample(patch, pts)
    tone = sample(lambda x, y: fourier(x, y, seed + 7, kmax=9, power=1.1), pts)
    greens = [(0.0, rgb('#20291a' if not dark else '#161d12')), (0.45, rgb('#3d4826' if not dark else '#2a3219')),
              (0.75, rgb('#62603a' if dry else '#57613a')), (1.0, rgb('#8a7c52' if dry else '#73714a'))]
    for (x, y), d, t in zip(pts, dens, tone):
        if rng.random() > smooth(0.25, 0.55, d):
            continue
        z = hfield(np.array([x]), np.array([y]))[0] * 0.06
        h = rng.uniform(0.09, 0.2) * (0.7 + 0.6 * d)
        vv, ff = blade(rng, x, y, z, h, rng.uniform(0.012, 0.022), rng.uniform(0.4, 1.0))
        c = ramp(np.array([np.clip(t + rng.normal() * 0.15, 0, 1)]), greens)[0] * rng.uniform(0.8, 1.15)
        blades.add_wrapped(vv, ff, c, rng.uniform(0.6, 0.8), 0.25)
    blades.build('blades', bm.m)
    st = Batch()
    # grit: tiny stones everywhere (seen in the bare patches; hidden under the grass elsewhere)
    grit = jittered(5000, seed + 9, jitter=1.0)
    gz = hfield(grit[:, 0], grit[:, 1]) * 0.06
    gd = sample(patch, grit)
    for (x, y), z, d in zip(grit, gz, gd):
        if rng.random() < smooth(0.3, 0.5, d) * 0.9:
            continue
        s = rng.uniform(0.006, 0.018)
        vv, ff = stone(rng, x, y, z, s, rng.uniform(0.4, 0.8), 0.3)
        c = ramp(np.array([rng.random()]), [(0, rgb('#3a3229')), (1, rgb('#7a7062'))])[0]
        st.add_wrapped(vv, ff, c, 0.85, s * 1.4)
    for (x, y) in jittered(int(120 + 500 * rocks), seed + 8):
        if rng.random() > 0.35 + rocks * 0.5:
            continue
        s = rng.uniform(0.02, 0.06) * (1 + rocks * rng.uniform(0, 3))
        z = hfield(np.array([x]), np.array([y]))[0] * 0.06
        vv, ff = stone(rng, x, y, z, s, rng.uniform(0.35, 0.7), 0.25)
        c = ramp(np.array([rng.random()]), [(0, rgb('#3e3b36')), (1, rgb('#6d675c'))])[0]
        st.add_wrapped(vv, ff, c, rng.uniform(0.7, 0.85), s * 1.4)
    st.build('stones', sm.m)


def scene_woods(mats, seed=40):
    gm = mats('ground', detail_scale=40, detail_bump=0.006)
    lm = mats('leaves', detail_scale=150, detail_bump=0.0015, color_var=0.35, cavity=0.85, grime=0.3)
    tm = mats('twigs', detail_scale=90, detail_bump=0.002)
    hfield = lambda x, y: fourier(x, y, seed + 1, kmax=8)
    moss = lambda x, y: fourier(x, y, seed + 2, kmax=5)
    ground('ground', hfield,
           lambda x, y: lerp_col(smooth(0.55, 0.7, moss(x, y)), ramp(fourier(x, y, seed + 3, kmax=12), [(0, rgb('#1d1510')), (1, rgb('#3a2b1e'))]), rgb('#25311a')),
           lambda x, y: np.full(len(x), 0.9), gm.m, 0.05)
    rng = np.random.default_rng(seed + 4)
    leaves = Batch()
    pal = [(0.0, rgb('#1f150e')), (0.3, rgb('#3a2414')), (0.55, rgb('#55361b')), (0.75, rgb('#3a361c')), (1.0, rgb('#4a4029'))]
    layer_z = 0.0
    for (x, y) in jittered(11000, seed + 5, jitter=1.0):
        mv = moss(np.array([x]), np.array([y]))[0]
        if rng.random() < smooth(0.55, 0.75, mv) * 0.85:
            continue
        z = hfield(np.array([x]), np.array([y]))[0] * 0.05 + rng.uniform(0, 0.02)
        r = rng.uniform(0.045, 0.1)
        vv, ff = disc(rng, x, y, z, r, r * rng.uniform(0.45, 0.7), rng.uniform(0.005, 0.02))
        c = ramp(np.array([rng.random()]), pal)[0] * rng.uniform(0.75, 1.1)
        leaves.add_wrapped(vv, ff, c, rng.uniform(0.7, 0.85), r * 1.2)
    leaves.build('leaves', lm.m)
    tw = Batch()
    for (x, y) in jittered(140, seed + 6):
        ang = rng.uniform(0, 2 * math.pi); L = rng.uniform(0.15, 0.5); w = rng.uniform(0.006, 0.014)
        dx, dy = math.cos(ang) * L / 2, math.sin(ang) * L / 2
        z = hfield(np.array([x]), np.array([y]))[0] * 0.05 + 0.02
        vv, ff = box(-L / 2, -w, L / 2, w, z - w, z + w, w * 0.4)
        vv = np.array(vv)
        rot = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
        vv = vv @ rot.T + [x, y, 0]
        tw.add_wrapped(vv, ff, rgb('#2e2117') * rng.uniform(0.8, 1.2), 0.85, L)
    tw.build('twigs', tm.m)


def slab_floor(mats, seed, cells, inset, height, palette, gap_col, gap_fill, missing=0.0, sink=0.0, regular=False, rows=None):
    """Stone floor: one beveled slab per periodic Voronoi cell (or a running-bond grid)."""
    sm = mats('slabs', detail_scale=26, detail_bump=0.016, color_var=0.5, cavity=0.75, ao_dist=0.15, grime=0.45, speckle=0.12)
    gm = mats('joints', detail_scale=60, detail_bump=0.006)
    rng = np.random.default_rng(seed)
    ground('joints', lambda x, y: fourier(x, y, seed + 1, kmax=10) * 0.3,
           lambda x, y: ramp(fourier(x, y, seed + 2, kmax=12), gap_col), lambda x, y: np.full(len(x), 0.95), gm.m, 0.02)
    sl = Batch()
    wear = lambda x, y: fourier(x, y, seed + 3, kmax=5)
    if regular:
        nx, ny = rows
        w, h = TILE / nx, TILE / ny
        for j in range(ny):
            off = (j % 2) * w / 2
            for i in range(nx):
                if rng.random() < missing:
                    continue
                x0 = -HALF + i * w + off + inset * 0.5
                y0 = -HALF + j * h + inset * 0.5
                top = height + rng.uniform(-0.012, 0.012) - sink * rng.random()
                vv, ff = box(x0, y0, x0 + w - inset, y0 + h - inset, -0.05, top, inset * 0.7)
                vv = np.array(vv)
                tilt = rng.normal(size=2) * 0.01
                vv[:, 2] += (vv[:, 0] - vv[:, 0].mean()) * tilt[0] + (vv[:, 1] - vv[:, 1].mean()) * tilt[1]
                c = ramp(np.array([rng.random() * 0.7 + 0.3 * wear(np.array([x0]), np.array([y0]))[0]]), palette)[0]
                sl.add_wrapped(vv, ff, c, rng.uniform(0.45, 0.75), max(w, h))
    else:
        pts = jittered(cells, seed + 4, jitter=0.85)
        # polygon outline per cell: sample the cell boundary by marching rays from the seed
        for k, (px, py) in enumerate(pts):
            if rng.random() < missing:
                continue
            corners = []
            for a in np.linspace(0, 2 * math.pi, 14, endpoint=False):
                ca, sa = math.cos(a), math.sin(a)
                lo, hi = 0.0, TILE / 2
                for _ in range(18):
                    mid = (lo + hi) / 2
                    qx, qy = px + ca * mid, py + sa * mid
                    d = np.hypot(wrap_delta(pts[:, 0] - qx), wrap_delta(pts[:, 1] - qy))
                    if np.argmin(d) == k:
                        lo = mid
                    else:
                        hi = mid
                corners.append((px + ca * (lo - inset * 0.5), py + sa * (lo - inset * 0.5)))
            top = height + rng.uniform(-0.015, 0.015) - sink * rng.random()
            vv, ff = poly_slab(px, py, corners, -0.05, top, 0.06)
            vv = np.array(vv)
            tilt = rng.normal(size=2) * 0.015
            vv[:, 2] += (vv[:, 0] - px) * tilt[0] + (vv[:, 1] - py) * tilt[1]
            c = ramp(np.array([rng.random() * 0.7 + 0.3 * wear(np.array([px]), np.array([py]))[0]]), palette)[0]
            rad = max(math.hypot(cx - px, cy - py) for cx, cy in corners)
            sl.add_wrapped(vv, ff, c, rng.uniform(0.5, 0.8), rad)
    sl.build('slabs', sm.m, smooth=False)
    if gap_fill:
        bm = mats('weeds', detail_scale=120, detail_bump=0.0015, color_var=0.35, cavity=0.8)
        wb = Batch()
        for (x, y) in jittered(gap_fill, seed + 5, jitter=1.0):
            if rng.random() > 0.6:
                continue
            vv, ff = blade(rng, x, y, 0.0, rng.uniform(0.05, 0.12), rng.uniform(0.01, 0.02), rng.uniform(0.5, 1.0))
            c = ramp(np.array([rng.random()]), [(0, rgb('#1e2617')), (1, rgb('#4b5430'))])[0]
            wb.add_wrapped(vv, ff, c, 0.75, 0.2)
        wb.build('weeds', bm.m)


def scene_water(mats, seed=80):
    gm = mats('silt', detail_scale=50, detail_bump=0.004)
    pm = mats('pebbles', detail_scale=70, detail_bump=0.004, color_var=0.3, cavity=0.75, ao_dist=0.12)
    ground('silt', lambda x, y: fourier(x, y, seed + 1, kmax=8), lambda x, y: ramp(fourier(x, y, seed + 2, kmax=10), [(0, rgb('#2a261e')), (1, rgb('#463d2e'))]),
           lambda x, y: np.full(len(x), 0.3), gm.m, 0.04)
    rng = np.random.default_rng(seed + 3)
    pb = Batch()
    algae = lambda x, y: fourier(x, y, seed + 4, kmax=6)
    pal = [(0, rgb('#3b3b35')), (0.35, rgb('#5b574c')), (0.7, rgb('#766d5b')), (1.0, rgb('#4d4b40'))]
    for (x, y) in jittered(1500, seed + 5, jitter=1.0):
        s = rng.uniform(0.035, 0.12) * (1.6 if rng.random() < 0.06 else 1.0)
        vv, ff = stone(rng, x, y, 0.02, s, rng.uniform(0.35, 0.6), 0.12)
        c = ramp(np.array([rng.random()]), pal)[0]
        a = algae(np.array([x]), np.array([y]))[0]
        c = c * (1 - 0.5 * smooth(0.55, 0.8, a)) + rgb('#2f3a1f') * 0.5 * smooth(0.55, 0.8, a)
        pb.add_wrapped(vv, ff, c, rng.uniform(0.2, 0.4), s * 1.4)
    pb.build('pebbles', pm.m)


def scene_cracked(mats, seed, cells, plate_cols, gap_col, char=0.0, embers=0):
    """Dry cracked plates (flame) or charred ash (ember)."""
    gm = mats('plates', detail_scale=45, detail_bump=0.008, color_var=0.4, grime=0.35, speckle=0.1)
    pts = jittered(cells, seed + 1, jitter=0.9)
    fine = jittered(cells * 6, seed + 2, jitter=0.9)
    cache = {}

    def fields(x, y):
        key = (len(x), float(x[0]), float(y[0]))
        if key not in cache:
            _, e1, _ = voronoi(x, y, pts)
            _, e2, _ = voronoi(x, y, fine)
            cache[key] = (e1, e2)
        return cache[key]

    def height(x, y):
        e1, e2 = fields(x, y)
        return smooth(0.0, 0.022, e1) * (0.85 + 0.15 * smooth(0.0, 0.01, e2)) * (0.8 + 0.2 * fourier(x, y, seed + 3, kmax=10))

    def color(x, y):
        e1, e2 = fields(x, y)
        base = ramp(fourier(x, y, seed + 4, kmax=12, power=1.0), plate_cols)
        crack = 1 - smooth(0.0, 0.02, e1) * (0.75 + 0.25 * smooth(0.0, 0.008, e2))
        base = lerp_col(crack * 0.9, base, gap_col)
        if char:
            base = lerp_col(smooth(0.5, 0.75, fourier(x, y, seed + 5, kmax=5)) * char, base, rgb('#0b0a09'))
        return base

    ground('plates', height, color, lambda x, y: np.full(len(x), 0.93), gm.m, 0.08)
    if embers:
        em = mats('embers', detail_scale=80, detail_bump=0.002, color_var=0.2, cavity=0.2)
        rng = np.random.default_rng(seed + 6)
        eb = Batch()
        glow = lambda x, y: fourier(x, y, seed + 7, kmax=6)
        for (x, y) in jittered(embers, seed + 8, jitter=1.0):
            g = glow(np.array([x]), np.array([y]))[0]
            hot = rng.random() < smooth(0.55, 0.85, g)
            s = rng.uniform(0.015, 0.045)
            vv, ff = stone(rng, x, y, 0.05, s, 0.5, 0.3)
            c = (rgb('#c4501c') * rng.uniform(0.7, 1.2)) if hot else (rgb('#141210') * rng.uniform(0.8, 1.6))
            eb.add_wrapped(vv, ff, c, 0.9, s * 1.4)
        eb.build('embers', em.m)


def scene_rock(mats, seed=110):
    """Broken rock: a rough bedrock surface covered in angular boulders, chunks and gravel."""
    gm = mats('rock', detail_scale=22, detail_bump=0.02, color_var=0.45, cavity=0.75, ao_dist=0.3, grime=0.35, speckle=0.15)
    km = mats('chunks', detail_scale=30, detail_bump=0.015, color_var=0.45, cavity=0.8, ao_dist=0.2, grime=0.3, speckle=0.15)
    base_h = lambda x, y: fourier(x, y, seed + 1, kmax=10, power=1.2) * 0.7 + fourier(x, y, seed + 5, kmax=24, power=0.8) * 0.3
    lichen = lambda x, y: fourier(x, y, seed + 2, kmax=7)
    greys = [(0.0, rgb('#2a2927')), (0.4, rgb('#45433e')), (0.75, rgb('#5f5b53')), (1.0, rgb('#777166'))]

    def color(x, y):
        base = ramp(base_h(x, y), greys)
        return lerp_col(smooth(0.62, 0.75, lichen(x, y)) * 0.55, base, rgb('#4d5634'))

    ground('rock', base_h, color, lambda x, y: 0.72 + 0.15 * fourier(x, y, seed + 4, kmax=6), gm.m, 0.15)
    rng = np.random.default_rng(seed + 6)
    ch = Batch()
    for count, lo, hi, flat in ((70, 0.18, 0.42, 0.55), (420, 0.05, 0.16, 0.6), (2600, 0.012, 0.04, 0.7)):
        pts = jittered(count, seed + 7 + count, jitter=1.0)
        zs = base_h(pts[:, 0], pts[:, 1]) * 0.15
        for (x, y), z in zip(pts, zs):
            s = rng.uniform(lo, hi)
            vv, ff = stone(rng, x, y, z, s, flat, 0.55)
            c = ramp(np.array([rng.random()]), greys)[0]
            lv = lichen(np.array([x]), np.array([y]))[0]
            c = c * (1 - 0.5 * smooth(0.6, 0.8, lv)) + rgb('#4d5634') * 0.5 * smooth(0.6, 0.8, lv)
            ch.add_wrapped(vv, ff, c, rng.uniform(0.65, 0.85), s * 1.5)
    ch.build('chunks', km.m, smooth=False)


def scene_barricade(mats, seed=120):
    scene_plains(mats, seed, dry=1.0, rocks=0.0, dark=1.0)
    rm = mats('rubble', detail_scale=40, detail_bump=0.01, color_var=0.3, cavity=0.75)
    wm = mats('planks', detail_scale=60, detail_bump=0.004, color_var=0.3)
    rng = np.random.default_rng(seed + 9)
    rb = Batch()
    pile = lambda x, y: fourier(x, y, seed + 10, kmax=4)
    for (x, y) in jittered(900, seed + 11, jitter=1.0):
        if rng.random() > smooth(0.45, 0.7, pile(np.array([x]), np.array([y]))[0]):
            continue
        s = rng.uniform(0.04, 0.16)
        vv, ff = stone(rng, x, y, 0.03, s, rng.uniform(0.5, 0.9), 0.35)
        rb.add_wrapped(vv, ff, ramp(np.array([rng.random()]), [(0, rgb('#3e3a34')), (1, rgb('#69635a'))])[0], 0.85, s * 1.5)
    rb.build('rubble', rm.m)
    pl = Batch()
    for (x, y) in jittered(36, seed + 12):
        if rng.random() > 0.6:
            continue
        ang = rng.uniform(0, 2 * math.pi); L = rng.uniform(0.3, 0.9); w = rng.uniform(0.04, 0.08)
        vv, ff = box(-L / 2, -w, L / 2, w, 0.0, rng.uniform(0.015, 0.03), 0.004)
        vv = np.array(vv)
        rot = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
        vv = vv @ rot.T + [x, y, 0.04]
        pl.add_wrapped(vv, ff, rgb('#4a3424') * rng.uniform(0.7, 1.2), 0.8, L)
    pl.build('planks', wm.m, smooth=False)


def scene_snow(mats, seed=130):
    gm = mats('snow', detail_scale=70, detail_bump=0.004, color_var=0.06, cavity=0.35, ao_dist=0.4, speckle=0.04)
    drift = lambda x, y: fourier(x, y, seed + 1, kmax=6) * 0.7 + fourier(x, y, seed + 2, kmax=16, power=1.0) * 0.18 + fourier(x, y, seed + 6, kmax=30, power=0.6) * 0.12
    ground('snow', drift,
           lambda x, y: ramp(drift(x, y), [(0.0, rgb('#bcc6d3')), (0.5, rgb('#d9dfe7')), (1.0, rgb('#f0f2f5'))]),
           lambda x, y: 0.55 + 0.2 * fourier(x, y, seed + 3, kmax=8), gm.m, 0.12)
    rng = np.random.default_rng(seed + 4)
    st = Batch()
    sm = mats('rocks', detail_scale=50, detail_bump=0.01)
    for (x, y) in jittered(4, seed + 5):
        if rng.random() > 0.3:
            continue
        s = rng.uniform(0.04, 0.12)
        vv, ff = stone(rng, x, y, drift(np.array([x]), np.array([y]))[0] * 0.12 - s * 0.2, s, 0.6, 0.3)
        st.add_wrapped(vv, ff, rgb('#3a3936'), 0.8, s * 1.4)
    st.build('rocks', sm.m)


def build(name, mats):
    if name == 'plains':
        scene_plains(mats, 49)
    elif name == 'hill':
        scene_plains(mats, 20, dry=1.0, rocks=1.0)
    elif name == 'woods':
        scene_woods(mats)
    elif name == 'ruins':
        slab_floor(mats, 50, cells=26, inset=0.05, height=0.06,
                   palette=[(0, rgb('#2e2b27')), (0.5, rgb('#47433c')), (1, rgb('#625c51'))],
                   gap_col=[(0, rgb('#241c14')), (1, rgb('#3b3024'))], gap_fill=9000, missing=0.12, sink=0.03)
    elif name == 'nave':
        slab_floor(mats, 60, cells=0, inset=0.025, height=0.05,
                   palette=[(0, rgb('#2a2826')), (0.35, rgb('#3d3a35')), (0.7, rgb('#4f4a42')), (1, rgb('#5d5850'))],
                   gap_col=[(0, rgb('#161412')), (1, rgb('#24201b'))], gap_fill=0, regular=True, rows=(4, 6))
    elif name == 'door':
        slab_floor(mats, 70, cells=0, inset=0.03, height=0.045,
                   palette=[(0, rgb('#1f1e1c')), (0.5, rgb('#34322f')), (1, rgb('#4a4641'))],
                   gap_col=[(0, rgb('#100e0c')), (1, rgb('#1c1915'))], gap_fill=0, regular=True, rows=(6, 8))
    elif name == 'water':
        scene_water(mats)
    elif name == 'flame':
        scene_cracked(mats, 100, 18, [(0, rgb('#1d1510')), (0.5, rgb('#3c2b1f')), (1, rgb('#5c4332'))], rgb('#0a0807'), char=0.6)
    elif name == 'ember':
        scene_cracked(mats, 90, 30, [(0, rgb('#151311')), (0.5, rgb('#2c2824')), (1, rgb('#4b4540'))], rgb('#060505'), char=0.9, embers=1400)
    elif name == 'column':
        scene_rock(mats)
    elif name == 'barricade':
        scene_barricade(mats)
    elif name == 'snow':
        scene_snow(mats)
    else:
        raise ValueError(name)


TERRAINS = ['plains']


def render_terrain(name):
    folder = OUT
    if os.path.exists(folder):
        raise FileExistsError(f'Refusing to replace numbered tile assets in {folder}')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 12
    sc.cycles.max_bounces = 0
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = 2
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '8'
    sc.render.film_transparent = False
    sc.display_settings.display_device = 'sRGB'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0
    sc.view_settings.gamma = 1
    world = bpy.data.worlds.new('w')
    sc.world = world
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = TILE
    cam = bpy.data.objects.new('cam', cam_data)
    cam.location = (0, 0, 20)
    sc.collection.objects.link(cam)
    sc.camera = cam
    made = []

    def mats(key, **kw):
        m = Mat(f'{name}-{key}', **kw)
        made.append(m)
        return m

    build(name, mats)
    os.makedirs(folder, exist_ok=False)
    for key, view in (('color', 'Standard'), ('normal', 'Raw'), ('rough', 'Raw')):
        for m in made:
            m.show(key)
        sc.view_settings.view_transform = view
        sc.render.filepath = os.path.join(folder, f'{key}.png')
        bpy.ops.render.render(write_still=True)
        print(f'[claude-ground] {name}/{key}.png', flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for name in argv or TERRAINS:
        render_terrain(name)


main()
