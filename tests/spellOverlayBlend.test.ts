import { expect, it, vi } from "vitest";
import { WebGL2DRenderer } from "../src/game/gfx/WebGL2DRenderer";
it("uses premultiplied color blending for the transparent spell canvas only", () => {
 const gl={ONE:1,SRC_ALPHA:2,ONE_MINUS_SRC_ALPHA:3,blendFunc:vi.fn()};
 const overlay=Object.assign(Object.create(WebGL2DRenderer.prototype),{gl,transparentOverlay:true,globalCompositeOperation:"lighter"});
 overlay.applyBlend(); expect(gl.blendFunc).toHaveBeenLastCalledWith(gl.ONE,gl.ONE);
 overlay.globalCompositeOperation="source-over"; overlay.applyBlend(); expect(gl.blendFunc).toHaveBeenLastCalledWith(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 overlay.transparentOverlay=false; overlay.applyBlend(); expect(gl.blendFunc).toHaveBeenLastCalledWith(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
});
