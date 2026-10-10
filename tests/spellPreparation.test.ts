import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Stage } from '../src/render/stage';
import { WebGL2DRenderer } from '../src/game/gfx/WebGL2DRenderer';
it('uploads and compiles hidden spell materials before preparation completes', async () => {
 const scene=new THREE.Scene(), texture=new THREE.Texture();
 const spell=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({map:texture}));
 spell.visible=false; scene.add(spell);
 let complete!:()=>void;
 const renderer={initTexture:vi.fn(),compileAsync:vi.fn(()=>new Promise<void>(r=>complete=r))};
 const stage=Object.assign(Object.create(Stage.prototype),{scene,camera:new THREE.PerspectiveCamera(),renderer,parkHiddenLights:vi.fn(()=>[]),balanceLightCount:vi.fn(),restoreParkedLights:vi.fn()});
 let ready=false; const preparing=stage.prepareMaterials().then(()=>ready=true);
 expect(renderer.initTexture).toHaveBeenCalledWith(texture);
 expect(renderer.compileAsync).toHaveBeenCalledWith(scene,stage.camera);
 expect(ready).toBe(false); complete(); await preparing; expect(ready).toBe(true);
});
it('disposes overlay resources without destroying the reusable canvas context',()=>{
 const gl={deleteTexture:vi.fn(),deleteBuffer:vi.fn(),deleteProgram:vi.fn(),getExtension:vi.fn()};
 const renderer=Object.assign(Object.create(WebGL2DRenderer.prototype),{gl,textureCache:new Map([['art',{}]]),textTextureCache:new Map([['label',{tex:{}}]]),polyBuf:{},quadBuf:{},progFill:{},progTex:{},progTexLit:{}});
 renderer.dispose(); expect(gl.deleteTexture).toHaveBeenCalledTimes(2); expect(gl.deleteProgram).toHaveBeenCalledTimes(3); expect(gl.getExtension).not.toHaveBeenCalled();
});
