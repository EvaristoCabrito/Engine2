"""Engine2: authored cottage, high-poly source, LODs, sequential 2K Cycles bakes.
Run Blender --background --threads 2 --python this_file -- model|bake|render.
No external assets. Originals and previous versions are preserved.
"""
import bpy, math, random, sys, json, os
from pathlib import Path
from mathutils import Vector
ROOT=Path('C:/Engine2')
OUT=ROOT/'public/game/props/gothic-cottage/v01'
OUT.mkdir(parents=True,exist_ok=True)
MODE=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'model'
random.seed(6208)
os.environ['OMP_NUM_THREADS']='2'
scene=bpy.context.scene
scene.render.threads_mode='FIXED'; scene.render.threads=2
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
scene.cycles.use_denoising=True

def shader(name,color,rough=.8,metal=0,scale=8,wood=False,moss=False):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
    out=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');l.new(bs.outputs['BSDF'],out.inputs['Surface'])
    bs.inputs['Metallic'].default_value=metal
    coord=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(14,14,.65) if wood else (1,1,1);l.new(coord.outputs['Object'],mapping.inputs[0])
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=scale;noise.inputs['Detail'].default_value=5;noise.inputs['Roughness'].default_value=.72;l.new(mapping.outputs[0],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(*[c*.32 for c in color],1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(*color,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],bs.inputs['Base Color'])
    roughnode=n.new('ShaderNodeMapRange');roughnode.inputs['To Min'].default_value=max(.18,rough-.22);roughnode.inputs['To Max'].default_value=rough;l.new(noise.outputs['Fac'],roughnode.inputs[0]);l.new(roughnode.outputs[0],bs.inputs['Roughness'])
    fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=115 if not wood else 20;fine.inputs['Detail'].default_value=3;l.new(mapping.outputs[0],fine.inputs['Vector'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.6;bump.inputs['Distance'].default_value=.035 if not wood else .025;l.new(fine.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],bs.inputs['Normal'])
    if moss:
        sep=n.new('ShaderNodeSeparateXYZ');l.new(coord.outputs['Object'],sep.inputs[0]);height=n.new('ShaderNodeMapRange');height.clamp=True;height.inputs['From Min'].default_value=.08;height.inputs['From Max'].default_value=1.3;height.inputs['To Min'].default_value=.85;height.inputs['To Max'].default_value=0;l.new(sep.outputs['Z'],height.inputs[0])
        mult=n.new('ShaderNodeMath');mult.operation='MULTIPLY';l.new(height.outputs[0],mult.inputs[0]);l.new(noise.outputs['Fac'],mult.inputs[1]);mix=n.new('ShaderNodeMixRGB');mix.inputs[2].default_value=(.045,.063,.026,1);l.new(mult.outputs[0],mix.inputs[0]);l.new(ramp.outputs[0],mix.inputs[1]);l.new(mix.outputs[0],bs.inputs['Base Color'])
    return mat

parts=[]
def finish(o,name,mat,bevel=0):
    o.name=name;o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        b=o.modifiers.new('Worn rounded edges','BEVEL');b.width=bevel;b.segments=3
        b.affect='EDGES';b.profile=.6
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
    parts.append(o);return o

def box(name,loc,size,mat,bevel=.025,rot=(0,0,0),damage=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=size;o.rotation_euler=rot
    finish(o,name,mat,bevel)
    if damage:
        # Tiny deterministic geometric chips, not uniformly enlarged polygons.
        for v in o.data.vertices:
            if random.random()<.24:v.co+=Vector((random.uniform(-.013,.013),random.uniform(-.013,.013),random.uniform(-.013,.013)))
    return o

def curve(name,points,mat,radius=.025):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=2;c.bevel_depth=radius;c.bevel_resolution=2
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.data.materials.append(mat);parts.append(o);o.select_set(False);return o

def mesh(name,verts,faces,mat):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.data.materials.append(mat);parts.append(o);return o

def arch(name,x,y,z,w,h,mat,thickness=.09):
    # Lancet arch with two convex circular-ish sides and a pointed apex.
    points=[]
    for i in range(17):
        t=i/16;points.append((x-w/2*(1-t)**.65,y,z+h*t))
    for i in range(1,17):
        t=1-i/16;points.append((x+w/2*(1-t)**.65,y,z+h*t))
    return curve(name,points,mat,thickness)

def triangle_count(o):
    o.data.calc_loop_triangles();return len(o.data.loop_triangles)

if MODE=='model':
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    stone=shader('Cold weathered limestone',(.27,.29,.27),.9,scale=5,moss=True)
    mortar=shader('Damp recessed mortar',(.105,.11,.095),.96,scale=16,moss=True)
    timber=shader('Split dark oak',(.105,.076,.052),.78,scale=3,wood=True)
    slate=shader('Wet blue-grey slate',(.12,.15,.17),.6,scale=12)
    iron=shader('Oxidised forged iron',(.09,.075,.06),.62,.75,scale=22)
    black=shader('Smoky leaded glass',(.025,.032,.034),.3,.25,scale=9)
    # Body has actual recessed joints, individually damaged stones, and openings.
    W,D,H=5.4,4.2,2.9
    box('Recessed body',(0,0,1.45),(W-.12,D-.12,H),mortar,.03)
    rowh=.25
    for row in range(11):
        z=.19+row*rowh
        for side in [-1,1]:
            for i in range(11):
                x=-W/2+.24+i*.49+(row%2)*.12
                if x>W/2-.12:continue
                # Front door and both lancet windows have recessed backing.
                if side==-1 and ((abs(x)<.64 and z<2.55) or (1.4<abs(x)<2.05 and .9<z<2.55)):continue
                box('Hand laid face stone',(x,side*D/2,z),(.465+random.uniform(-.035,.025),.23+random.random()*.035,.225+random.uniform(-.01,.01)),stone,.022,rot=(random.uniform(-.02,.02),random.uniform(-.02,.02),random.uniform(-.02,.02)),damage=True)
            for i in range(9):
                y=-D/2+.24+i*.46+(row%2)*.12
                if y>D/2-.12:continue
                if side==1 and abs(y)<.6 and .95<z<2.35:continue
                box('Hand laid side stone',(side*W/2,y,z),(.25,.435+random.uniform(-.03,.02),.23),stone,.021,damage=True)
    # Foundation plinth, crumbling dressed quoins and shallow buttresses.
    for x in [-2.64,2.64]:
        for y in [-2.08,2.08]:
            for k in range(10):box('Corner quoin',(x,y,.16+k*.29),(.4,.4,.26),stone,.026,damage=True)
    for x in [-2.23,2.23]:
        box('Buttress foot',(x,-2.25,.18),(.48,.65,.36),stone,.04,damage=True)
        box('Buttress pier',(x,-2.22,1.35),(.3,.38,2.35),stone,.027,damage=True)
        box('Buttress weather cap',(x,-2.22,2.55),(.43,.52,.17),stone,.025,rot=(.14,0,0))
    # Steep gables. Solid brick backing plus a readable old timber frame.
    for y in [-D/2,D/2]:
        mesh('Stone gable',[(-2.7,y,2.83),(2.7,y,2.83),(0,y,5.6)],[(0,1,2)],mortar)
        for row in range(9):
            z=3+row*.26;extent=2.7*(5.6-z)/2.77
            for i in range(int(extent*2/.43)):
                x=-extent+.23+i*.43
                box('Gable stone',(x,y,z),(.405,.19,.23),stone,.018,damage=True)
        box('Gable tie beam',(0,y*1.02,2.91),(5.56,.22,.23),timber,.027,damage=True)
        box('Gable king post',(0,y*1.025,4.2),(.19,.23,2.65),timber,.024,damage=True)
        for sign in [-1,1]:
            curve('Gable rake',[(sign*2.75,y*1.027,2.86),(sign*1.35,y*1.027,4.25),(0,y*1.027,5.64)],timber,.115)
            curve('Diagonal oak brace',[(sign*1.83,y*1.027,2.96),(sign*.1,y*1.027,4.5)],timber,.07)
    # Roof: separated overlapping slate courses, irregular corners and chipped bevels.
    run,rise=3.05,2.91;angle=math.atan2(rise,run);slope=math.hypot(run,rise)
    for side in [-1,1]:
        box('Roof sheathing',(side*run/2,0,4.185),(slope,.0+4.9,.095),timber,.016,rot=(0,side*angle,0))
        for row in range(15):
            t=(row+.45)/15
            for col in range(14):
                y=-2.43+(col+.5)*.35+(row%2)*.08
                if y>2.43:continue
                if row>1 and random.random()<.012:continue
                x=side*run*(1-t);z=2.73+rise*t+.075
                box('Individual chipped slate',(x,y,z),(.38,.333,.045+random.random()*.014),slate,.009,rot=(random.uniform(-.016,.016),side*angle+random.uniform(-.018,.018),random.uniform(-.015,.015)),damage=True)
        # Rain-dark fascia and gutter, each with bent iron brackets.
        box('Weathered eave',(side*3.08,0,2.72),(.18,4.92,.2),timber,.035,damage=True)
        curve('Half round iron gutter',[(side*3.18,-2.45,2.7),(side*3.18,0,2.68),(side*3.18,2.45,2.67)],iron,.058)
    for i in range(16):box('Slate ridge cap',(0,-2.45+(i+.5)*.306,5.71),(.3,.32,.12),slate,.025,damage=True)
    curve('Bent downpipe',[(3.18,1.8,2.7),(2.96,1.8,2.4),(2.93,1.8,.32),(3.11,1.8,.15)],iron,.055)
    # Front door: 2.4-high timber opening plus a pointed stone hood.
    box('Deep doorway',(0,-2.16,1.2),(1.3,.15,2.4),black,.012)
    for i in range(7):box('Door oak plank',(-.48+i*.16,-2.265,1.17),(.147,.1,2.28),timber,.009,damage=True)
    for z in [.45,1.6]:
        box('Forged strap hinge',(-.03,-2.33,z),(.95,.035,.075),iron,.012)
        for x in [-.43,-.15,.17,.39]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.023,location=(x,-2.357,z));finish(bpy.context.object,'Iron rivet',iron)
    arch('Pointed door archivolt',0,-2.28,2.07,1.46,.73,stone,.135)
    for x in [-.73,.73]:box('Door jamb',(x,-2.27,1.04),(.25,.32,2.08),stone,.028,damage=True)
    bpy.ops.mesh.primitive_torus_add(major_radius=.065,minor_radius=.012,major_segments=20,minor_segments=6,location=(.34,-2.4,1.13),rotation=(math.pi/2,0,0));finish(bpy.context.object,'Iron ring handle',iron)
    box('Threshold',(0,-2.38,.065),(1.5,.7,.13),stone,.035,damage=True)
    box('Worn doorstep',(0,-2.7,.05),(1.85,.36,.1),stone,.025,damage=True)
    # Narrow gothic lancets: stone mullions, leaded panes, diamond iron work.
    for x in [-1.65,1.65]:
        box('Recessed lancet glass',(x,-2.21,1.62),(.61,.03,1.38),black,.008)
        arch('Lancet stone hood',x,-2.31,1.85,.83,.68,stone,.09)
        for xx in [x-.405,x+.405]:box('Lancet jamb',(xx,-2.3,1.35),(.13,.19,1.12),stone,.017,damage=True)
        box('Lancet sill',(x,-2.32,.79),(1,.35,.12),stone,.023,damage=True)
        box('Window mullion',(x,-2.345,1.61),(.035,.035,1.6),iron,.007)
        for z in [1.07,1.36,1.65,1.94]:
            for sign in [-1,1]:curve('Diamond lead caming',[(x-.28,-2.35,z),(x,-2.35,z+sign*.22),(x+.28,-2.35,z)],iron,.012)
    # Side casement and shutters.
    box('Side dark window',(2.83,0,1.65),(.03,1.15,1.3),black,.01)
    for y in [-.72,.72]:
        for i in range(4):box('Rotten shutter board',(2.9,y-.18+i*.12,1.65),(.095,.11,1.35),timber,.012,damage=True)
        for z in [1.2,2.08]:box('Shutter iron strap',(2.97,y,z),(.03,.52,.06),iron,.008)
    box('Side stone lintel',(2.86,0,2.4),(.34,1.72,.16),stone,.028,damage=True)
    box('Side stone sill',(2.86,0,.94),(.38,1.7,.14),stone,.026,damage=True)
    # Tall staggered chimney, soot-lined opening and weathered coping.
    cx,cy=1.55,.9
    box('Chimney core',(cx,cy,4.65),(.63,.69,3.4),mortar,.015)
    for row in range(13):
        for side in [-1,1]:
            for i in range(2):
                box('Chimney ashlar',(cx-.17+i*.34,cy+side*.37,3.13+row*.25),(.31,.18,.23),stone,.021,damage=True)
                box('Chimney side ashlar',(cx+side*.35,cy-.18+i*.36,3.13+row*.25),(.18,.33,.23),stone,.021,damage=True)
    for x,y,w,d in [(cx-.37,cy,.19,.96),(cx+.37,cy,.19,.96),(cx,cy-.37,.58,.19),(cx,cy+.37,.58,.19)]:box('Chimney coping',(x,y,6.38),(w,d,.18),stone,.035,damage=True)
    box('Soot opening',(cx,cy,6.28),(.51,.51,.018),black,.005)
    # Join high source. Keep it in a separate Blender collection for baking/rendering.
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();hi=bpy.context.object;hi.name='GothicCottage_HIGH'
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    low=hi.copy();low.data=hi.data.copy();bpy.context.collection.objects.link(low);low.name='GothicCottage_LOD0'
    hi.select_set(False);low.select_set(True);bpy.context.view_layer.objects.active=low
    initial=triangle_count(low)
    dec=low.modifiers.new('LOD0 surface simplification','DECIMATE');dec.ratio=min(1,34000/initial);bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.003,area_weight=.6);bpy.ops.object.mode_set(mode='OBJECT')
    print('GEOMETRY',initial,triangle_count(low),flush=True)
    hi.hide_render=True;hi.hide_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gothic-cottage-source-v01.blend'))

elif MODE=='bake':
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'gothic-cottage-source-v01.blend'))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.render.threads_mode='FIXED';scene.render.threads=2;scene.cycles.device='CPU';scene.cycles.samples=12
    hi=bpy.data.objects['GothicCottage_HIGH'];low=bpy.data.objects['GothicCottage_LOD0'];hi.hide_set(False);hi.hide_render=False
    baked=bpy.data.materials.new('GothicCottage baked PBR');baked.use_nodes=True;low.data.materials.clear();low.data.materials.append(baked)
    for poly in low.data.polygons:poly.material_index=0
    n=baked.node_tree.nodes;l=baked.node_tree.links;bs=n.get('Principled BSDF')
    scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.055;scene.render.bake.max_ray_distance=.12;scene.render.bake.margin=8;scene.render.bake.use_clear=True
    images={}
    for name,kind in [('base-color','DIFFUSE'),('normal','NORMAL'),('roughness','EMIT'),('ao','AO'),('metalness','EMIT')]:
        im=bpy.data.images.new('cottage-'+name,width=2048,height=2048,alpha=False);im.colorspace_settings.name='sRGB' if name=='base-color' else 'Non-Color'
        tex=n.new('ShaderNodeTexImage');tex.image=im;n.active=tex;tex.select=True
        changed=[]
        if kind=='EMIT':
            for mat in hi.data.materials:
                mn=mat.node_tree.nodes;ml=mat.node_tree.links;out=next(t for t in mn if t.type=='OUTPUT_MATERIAL');orig=out.inputs['Surface'].links[0].from_socket
                principal=next(t for t in mn if t.type=='BSDF_PRINCIPLED');inp=principal.inputs['Roughness' if name=='roughness' else 'Metallic'];em=mn.new('ShaderNodeEmission')
                if inp.is_linked:ml.new(inp.links[0].from_socket,em.inputs['Color'])
                else:em.inputs['Color'].default_value=(inp.default_value,)*3+(1,)
                ml.new(em.outputs[0],out.inputs['Surface']);changed.append((mat,out,orig,em))
        bpy.ops.object.select_all(action='DESELECT');hi.select_set(True);low.select_set(True);bpy.context.view_layer.objects.active=low
        print('BAKE START',name,flush=True)
        if kind=='DIFFUSE':bpy.ops.object.bake(type=kind,pass_filter={'COLOR'})
        else:bpy.ops.object.bake(type=kind)
        im.filepath_raw=str(OUT/(name+'-2k.png'));im.file_format='PNG';im.save();images[name]=im
        for mat,out,orig,em in changed:mat.node_tree.links.new(orig,out.inputs['Surface']);mat.node_tree.nodes.remove(em)
        print('BAKE DONE',name,flush=True)
    # Share one ORM image for AO, roughness and metallic in the runtime glTF.
    import numpy as np
    pixels={key:np.array(im.pixels[:],dtype=np.float32).reshape(-1,4) for key,im in images.items() if key in ['ao','roughness','metalness']}
    packed=np.ones((2048*2048,4),dtype=np.float32);packed[:,0]=pixels['ao'][:,0];packed[:,1]=pixels['roughness'][:,0];packed[:,2]=pixels['metalness'][:,0]
    orm=bpy.data.images.new('cottage-ORM',width=2048,height=2048,alpha=False);orm.colorspace_settings.name='Non-Color';orm.pixels.foreach_set(packed.ravel());orm.filepath_raw=str(OUT/'orm-2k.png');orm.file_format='PNG';orm.save()
    for node in list(n):
        if node.type=='TEX_IMAGE':n.remove(node)
    def img(image):node=n.new('ShaderNodeTexImage');node.image=image;return node
    base=img(images['base-color']);l.new(base.outputs['Color'],bs.inputs['Base Color'])
    norm=img(images['normal']);normal=n.new('ShaderNodeNormalMap');l.new(norm.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs[0],bs.inputs['Normal'])
    ormnode=img(orm);sep=n.new('ShaderNodeSeparateColor');l.new(ormnode.outputs['Color'],sep.inputs[0]);l.new(sep.outputs['Green'],bs.inputs['Roughness']);l.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat');gn=n.new('ShaderNodeGroup');gn.node_tree=group;l.new(sep.outputs['Red'],gn.inputs['Occlusion'])
    lod=low.copy();lod.data=low.data.copy();bpy.context.collection.objects.link(lod);lod.name='GothicCottage_LOD1';low.select_set(False);lod.select_set(True);bpy.context.view_layer.objects.active=lod
    dec=lod.modifiers.new('Distance LOD','DECIMATE');dec.ratio=.38;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
    hi.hide_render=True;hi.hide_set(True);low.select_set(True);lod.select_set(True)
    low['lod']=0;lod['lod']=1;low['source']='gothic-cottage-v01';lod['source']='gothic-cottage-v01'
    bpy.ops.export_scene.gltf(filepath=str(OUT/'gothic-cottage-v01.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_materials='EXPORT')
    stats={'version':'v01','lod0Triangles':triangle_count(low),'lod1Triangles':triangle_count(lod),'highTriangles':triangle_count(hi),'maps':[{'file':p.name,'bytes':p.stat().st_size} for p in OUT.glob('*.png')],'runtimeMaps':['base-color-2k.png','normal-2k.png','orm-2k.png'],'gpuRGBA8WithMipMiB':64,'threads':2,'doorHeight':2.4}
    (OUT/'metrics.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats),flush=True)
    lod.hide_render=True;lod.hide_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'gothic-cottage-baked-v01.blend'))

elif MODE=='render':
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'gothic-cottage-baked-v01.blend'))
    scene=bpy.context.scene;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=64;scene.cycles.use_denoising=True
    # Cycles render uses the actual in-game LOD0 and baked PBR, not the high source.
    bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Render ground';ground.data.materials.append(shader('Wet compacted ground',(.075,.085,.078),.66,scale=8))
    polemat=shader('Reference pole',(.4,.43,.4),.75)
    box('Human reference 2.65',(-3.8,-2.4,1.325),(.065,.065,2.65),polemat,.008)
    world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.45,.53,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
    for loc,energy,size,color in [((-5,-6,10),1800,8,(.8,.88,1)),((6,-1,7),1000,6,(.74,.81,.9)),((0,5,9),1700,7,(.63,.72,.86))]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.data.color=color;light.rotation_euler=(Vector((0,0,2))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(10,-13,8));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,2.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='PERSP';camera.data.lens=48;scene.camera=camera
    scene.render.resolution_x=1400;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'shots/props/gothic-cottage-v01-render.png')
    bpy.ops.render.render(write_still=True)
