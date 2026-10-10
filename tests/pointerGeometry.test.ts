import { expect, it } from "vitest";
import * as THREE from "three";
import { DioramaView } from "../src/editor/ember/dioramaView";
it("keeps both pointer edges planar across a shoreline height discontinuity", () => {
 const view = Object.create(DioramaView.prototype) as any;
 Object.assign(view,{gridKey:"",gridGroup:new THREE.Group(),gridMats:new Map(),stage:{scene:new THREE.Scene()},board:{layout:{cols:1,rows:1},cell:()=>({x:0,z:0,water:false})},groundAt:(x:number)=>x>0.2?-3:2});
 view.setGrid([{x:0,y:0,color:"rgba(220,226,235,1)",rOut:0.94,rIn:0.88,flat:true}]);
 const mesh=view.gridGroup.children[0] as THREE.Mesh;
 const positions=mesh.geometry.getAttribute("position");
 const heights=Array.from({length:positions.count},(_,i)=>positions.getY(i));
 expect(Math.max(...heights)-Math.min(...heights)).toBe(0);
 expect(heights[0]).toBeCloseTo(2.05);
 // Movement borders must also stay planar instead of stretching across the cliff.
 view.setGrid([{x:0,y:0,color:"rgba(220,226,235,1)",rOut:0.94,rIn:0.88}]);
 const draped=view.gridGroup.children[0].geometry.getAttribute("position");
 const terrainHeights=Array.from({length:draped.count},(_,i)=>draped.getY(i));
 expect(Math.max(...terrainHeights)-Math.min(...terrainHeights)).toBe(0);
});
