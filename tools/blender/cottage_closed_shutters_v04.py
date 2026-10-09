"""Close the existing wooden side shutters, retaining geometry, UVs and baked maps."""
import bpy,json
from pathlib import Path
ROOT=Path('C:/Engine2');OUT=ROOT/'public/game/props/gothic-cottage/v04';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'public/game/props/gothic-cottage/v03/gothic-cottage-glass-v03.blend'))
bpy.context.scene.render.threads_mode='FIXED';bpy.context.scene.render.threads=2
def close_shutters(obj):
    # The joined bake mesh retains disconnected parts. Move the existing board/strap
    # components together, rather than replacing them with a flat new rectangle.
    m=obj.data;adj=[[] for _ in m.vertices]
    for e in m.edges:a,b=e.vertices;adj[a].append(b);adj[b].append(a)
    unseen=set(range(len(m.vertices)));moved=0
    while unseen:
        start=unseen.pop();todo=[start];component=[start]
        while todo:
            v=todo.pop()
            for neighbor in adj[v]:
                if neighbor in unseen:unseen.remove(neighbor);todo.append(neighbor);component.append(neighbor)
        coords=[m.vertices[i].co for i in component]
        cx=(min(v.x for v in coords)+max(v.x for v in coords))/2
        cy=(min(v.y for v in coords)+max(v.y for v in coords))/2
        minz=min(v.z for v in coords);maxz=max(v.z for v in coords)
        if 2.85<cx<3.02 and .45<abs(cy)<1.02 and minz>.96 and maxz<2.35:
            sign=1 if cy>0 else -1
            for i in component:
                v=m.vertices[i].co;v.y=sign*.275+(v.y-sign*.72)*1.15
            moved+=1
    m.update();print(obj.name,'closed shutter components:',moved,flush=True)
    if moved<8:raise RuntimeError('Expected shutter boards and iron straps were not found')
lo=bpy.data.objects['GothicCottage_LOD0'];lod=bpy.data.objects['GothicCottage_LOD1'];hi=bpy.data.objects['GothicCottage_HIGH'];glass=bpy.data.objects['GothicCottage_Glass']
for o in [lo,lod,hi]:close_shutters(o)
hi.hide_set(True);hi.hide_render=True;lod.hide_set(False);lod.hide_render=False
bpy.ops.object.select_all(action='DESELECT')
for o in [lo,lod,glass]:o.select_set(True);o['version']='v04-closed-shutters'
bpy.context.view_layer.objects.active=lo
bpy.ops.export_scene.gltf(filepath=str(OUT/'gothic-cottage-v04.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT')
def tris(o):o.data.calc_loop_triangles();return len(o.data.loop_triangles)
stats={'version':'v04-closed-shutters','basedOn':'v03-glass','lod0Triangles':tris(lo)+tris(glass),'lod1Triangles':tris(lod)+tris(glass),'glazingTriangles':tris(glass),'gpuRGBA8WithMipMiB':64,'threads':2,'sideWindow':'original shutters closed; original glass retained behind them'}
(OUT/'metrics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats),flush=True)
lod.hide_render=True;lod.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gothic-cottage-closed-shutters-v04.blend'))
