import { V } from "../sprig-matrix.js";
import { PositionDef, } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AssetsDef } from "./assets.js";
import { ColorDef } from "../color-ecs.js";
const DBG_GRAPPLE = false;
export async function registerGrappleDbgSystems(em) {
    if (!DBG_GRAPPLE)
        return;
    const res = await em.whenResources(AssetsDef);
    const h = em.new();
    em.set(h, PositionDef, V(0, 0, 0));
    em.set(h, ColorDef, V(0.1, 0.1, 0.1));
    em.set(h, RenderableConstructDef, res.assets.grappleHook.proto);
    const g = em.new();
    em.set(g, PositionDef, V(0, 0, 0));
    em.set(g, ColorDef, V(0.1, 0.1, 0.1));
    em.set(g, RenderableConstructDef, res.assets.grappleGun.proto);
}
//# sourceMappingURL=grapple.js.map