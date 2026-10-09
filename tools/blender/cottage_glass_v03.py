"""Add real glazing to the approved v01 cottage, preserving all prior versions."""
import bpy,math,json
from pathlib import Path
ROOT=Path('C:/Engine2');OUT=ROOT/'public/game/props/gothic-cottage/v03';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'public/game/props/gothic-cottage/v01/gothic-cottage-baked-v01.blend'))
scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=2
hi=bpy.data.objects['GothicCottage_HIGH'];lo=bpy.data.objects['GothicCottage_LOD0'];lod=bpy.data.objects['GothicCottage_LOD1']
lod.hide_set(False);lod.hide_render=False
mat=bpy.data.materials.new('Antique window glass');mat.use_nodes=True
bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.7,.77,.8,1);bs.inputs['Roughness'].default_value=.1;bs.inputs['IOR'].default_value=1.52;bs.inputs['Transmission Weight'].default_value=.65;bs.inputs['Coat Weight'].default_value=.4
verts=[];faces=[]
def pane(points):
    start=len(verts);verts.extend(points)
    # Front glass normal faces outwards (-Y in Blender, +Z in game).
    faces.append(tuple(start+i for i in range(len(points))))
for x in [-1.65,1.65]:
    points=[(x-.29,-2.34,.89),(x+.29,-2.34,.89),(x+.29,-2.34,1.85)]
    for i in range(1,13):
        t=i/12;points.append((x+.29*(1-t)**.65,-2.34,1.85+.52*t))
    for i in range(1,13):
        t=1-i/12;points.append((x-.29*(1-t)**.65,-2.34,1.85+.52*t))
    pane(points)
# Side casement, inset behind its existing shutters.
pane([(2.9,-.54,1.04),(2.9,.54,1.04),(2.9,.54,2.27),(2.9,-.54,2.27)])
mesh=bpy.data.meshes.new('Separate actual window panes');mesh.from_pydata(verts,[],faces);mesh.update()
glass=bpy.data.objects.new('GothicCottage_Glass',mesh);bpy.context.collection.objects.link(glass);glass.data.materials.append(mat)
# Clean duplicate degenerates in LOD1, leaving the approved detailed model intact.
lod.data.validate(verbose=True)
shift=-min(v.co.z for v in lo.data.vertices)
for o in [hi,lo,lod,glass]:
    for v in o.data.vertices:v.co.z+=shift
hi.hide_set(True);hi.hide_render=True;bpy.ops.object.select_all(action='DESELECT')
for o in [lo,lod,glass]:o.select_set(True)
bpy.context.view_layer.objects.active=lo
lo['version']='v03-glass';lod['version']='v03-glass';glass['surface']='glass'
bpy.ops.export_scene.gltf(filepath=str(OUT/'gothic-cottage-v03.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT')
def tris(o):o.data.calc_loop_triangles();return len(o.data.loop_triangles)
stats={'version':'v03-glass','basedOn':'approved-v01','lod0Triangles':tris(lo)+tris(glass),'lod1Triangles':tris(lod)+tris(glass),'glazingTriangles':tris(glass),'gpuRGBA8WithMipMiB':64,'threads':2,'glass':{'ior':1.52,'roughness':.1,'transmission':.65}}
(OUT/'metrics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats),flush=True)
lod.hide_render=True;lod.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gothic-cottage-glass-v03.blend'))
