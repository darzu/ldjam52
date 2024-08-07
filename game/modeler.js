import { CanvasDef } from "../canvas.js";
import { EM } from "../entity-manager.js";
import { vec3, V } from "../sprig-matrix.js";
import { InputsDef } from "../inputs.js";
import { ColliderDef } from "../physics/collider.js";
import { PhysicsResultsDef, PhysicsStateDef, } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { vec3Dbg } from "../utils-3d.js";
import { AssetsDef } from "./assets.js";
import { ColorDef, TintsDef } from "../color-ecs.js";
import { drawLine, screenPosToRay } from "../utils-game.js";
import { CameraViewDef } from "../camera.js";
const ENABLED = true;
export const ModelerDef = EM.defineComponent("modeler", () => {
    return {
        clickerEnabled: false,
        currentBoxes: [],
        latestBoxId: -1,
        mode: "",
    };
});
export const ModelBoxDef = EM.defineComponent("modelBox", () => {
    return true;
});
function registerObjClicker(em) {
    // listen for modeler on/off
    em.registerSystem(null, [ModelerDef, InputsDef, CanvasDef], (_, res) => {
        if (ENABLED && res.inputs.keyClicks["m"]) {
            res.modeler.clickerEnabled = !res.modeler.clickerEnabled;
            if (res.modeler.clickerEnabled) {
                res.htmlCanvas.unlockMouse();
            }
            else {
                res.htmlCanvas.shouldLockMouseOnClick = true;
            }
        }
    }, "modelerOnOff");
    // look for object clicks
    em.registerSystem(null, [ModelerDef, CameraViewDef, InputsDef, PhysicsResultsDef], (_, res) => {
        if (!res.modeler.clickerEnabled)
            return;
        if (res.inputs.lclick) {
            const screenPos = res.inputs.mousePos;
            const r = screenPosToRay(screenPos, res.cameraView);
            // check for hits
            const hits = res.physicsResults.checkRay(r);
            // TODO(@darzu): this doesn't work
            // console.dir({ screenPos, hits });
            hits.sort((a, b) => a.dist - b.dist);
            const firstHit = hits[0];
            if (firstHit) {
                // TODO(@darzu): this seems pretty hacky and cross cutting
                // increase green
                const e = EM.findEntity(firstHit.id, [ColorDef]);
                if (e) {
                    EM.set(e, TintsDef);
                    e.tints.set("select", V(0, 0.2, 0));
                    // e.color[1] += 0.1;
                }
            }
            // draw our ray
            const rayDist = firstHit?.dist || 1000;
            const color = firstHit ? V(0, 1, 0) : V(1, 0, 0);
            const endPoint = vec3.add(r.org, vec3.scale(r.dir, rayDist), vec3.create());
            drawLine(r.org, endPoint, color);
        }
    }, "modelerClicks");
}
export function registerModeler(em) {
    // create our modeler
    em.addResource(ModelerDef);
    registerObjClicker(em);
    registerAABBBuilder(em);
}
export function aabbListToStr(aabbs) {
    let resStr = "";
    resStr += `const aabbs: AABB[] = [`;
    for (let aabb of aabbs) {
        resStr += `{min: ${vec3Dbg(aabb.min)}, max: ${vec3Dbg(aabb.max)}},`;
    }
    resStr += `];`;
    return resStr;
}
function registerAABBBuilder(em) {
    em.registerSystem(null, [InputsDef, ModelerDef, AssetsDef], (_, res) => {
        // create a new box
        if (res.inputs.keyClicks["b"]) {
            if (res.inputs.keyDowns["shift"]) {
                // export
                const bs = res.modeler.currentBoxes.map((id) => {
                    const b = em.findEntity(id, [
                        PhysicsStateDef,
                        ColliderDef,
                        ColorDef,
                    ]);
                    if (!b)
                        throw `Invalid modeler state`;
                    return b;
                });
                const aabbs = bs.map((b) => b._phys.colliders[0].aabb);
                console.log(aabbListToStr(aabbs));
                for (let b of bs) {
                    vec3.copy(b.color, [0.3, 0.1, 0.2]);
                    b.collider.solid = true;
                }
            }
            else {
                // create new box
                const b = em.new();
                const lastB = em.findEntity(res.modeler.latestBoxId, [
                    PositionDef,
                    ScaleDef,
                ]);
                em.set(b, ModelBoxDef);
                if (lastB) {
                    em.set(b, ScaleDef, vec3.copy(vec3.create(), lastB.scale));
                    em.set(b, PositionDef, vec3.copy(vec3.create(), lastB.position));
                }
                else {
                    em.set(b, ScaleDef, V(2, 1, 1));
                    em.set(b, PositionDef, V(0, 0, 0));
                }
                em.set(b, ColorDef, V(0.1, 0.3, 0.2));
                em.set(b, RenderableConstructDef, res.assets.cube.proto);
                em.set(b, ColliderDef, {
                    shape: "AABB",
                    solid: false,
                    aabb: res.assets.cube.aabb,
                });
                res.modeler.latestBoxId = b.id;
                res.modeler.currentBoxes.push(b.id);
            }
        }
        // check for mov / scale mode
        if (res.inputs.keyDowns["x"] ||
            res.inputs.keyDowns["z"] ||
            res.inputs.keyDowns["y"])
            if (res.inputs.keyDowns["shift"])
                res.modeler.mode = "scale";
            else
                res.modeler.mode = "move";
        else
            res.modeler.mode = "";
        if (res.modeler.mode === "move" || res.modeler.mode === "scale") {
            const delta = res.inputs.mouseMov[0];
            const dim = res.inputs.keyDowns["x"]
                ? 0
                : res.inputs.keyDowns["y"]
                    ? 1
                    : 2;
            // do move
            if (res.modeler.mode === "move") {
                const b = em.findEntity(res.modeler.latestBoxId, [PositionDef]);
                if (b) {
                    b.position[dim] += delta * 0.1;
                }
            }
            // do scale
            if (res.modeler.mode === "scale") {
                const b = em.findEntity(res.modeler.latestBoxId, [ScaleDef]);
                if (b) {
                    const currentSize = b.scale[dim] * 2;
                    const newSize = currentSize + delta * 0.1;
                    const newScale = newSize / 2;
                    b.scale[dim] = newScale;
                }
            }
        }
    }, "aabbBuilder");
}
//# sourceMappingURL=modeler.js.map