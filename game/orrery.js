import { ColorDef } from "../color-ecs.js";
import { createRef } from "../em_helpers.js";
import { EM } from "../entity-manager.js";
import { vec3, mat4, V } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, ScaleDef, } from "../physics/transform.js";
import { RenderableConstructDef } from "../render/renderer-ecs.js";
import { AssetsDef } from "./assets.js";
import { DarkStarPropsDef } from "./darkstar.js";
import { BOAT_COLOR, } from "./player-ship.js";
const ORRERY_SCALE = 0.001;
export async function makeOrrery(em, parentId) {
    const res = await em.whenResources(AssetsDef);
    const orrery = em.new();
    em.set(orrery, OrreryDef);
    em.set(orrery, PhysicsParentDef, parentId);
    em.set(orrery, PositionDef, V(0, 4, 4));
    // put a ship model at the center of it
    const shipModel = em.new();
    em.set(shipModel, PhysicsParentDef, orrery.id);
    em.set(shipModel, PositionDef, V(0, 0, 0));
    em.set(shipModel, RenderableConstructDef, res.assets.ship.proto);
    em.set(shipModel, ScaleDef, V(ORRERY_SCALE * 40, ORRERY_SCALE * 40, ORRERY_SCALE * 40));
    em.set(shipModel, ColorDef, BOAT_COLOR);
}
export const OrreryDef = EM.defineComponent("orrery", () => ({
    orreryStars: [],
}));
onInit((em) => {
    em.registerSystem([OrreryDef, WorldFrameDef], [AssetsDef], (es, res) => {
        const stars = em.filterEntities([
            DarkStarPropsDef,
            WorldFrameDef,
            ColorDef,
        ]);
        for (let orrery of es) {
            while (orrery.orrery.orreryStars.length < stars.length) {
                const orreryStar = em.new();
                em.set(orreryStar, PositionDef);
                em.set(orreryStar, PhysicsParentDef, orrery.id);
                em.set(orreryStar, ColorDef);
                em.set(orreryStar, RenderableConstructDef, res.assets.ball.proto);
                em.set(orreryStar, ScaleDef, V(0.25, 0.25, 0.25));
                orrery.orrery.orreryStars.push(createRef(orreryStar));
            }
            const intoOrrerySpace = mat4.invert(orrery.world.transform);
            stars.forEach((star, i) => {
                const orreryStar = orrery.orrery.orreryStars[i]();
                vec3.copy(orreryStar.color, star.color);
                vec3.copy(orreryStar.position, star.world.position);
                vec3.transformMat4(orreryStar.position, intoOrrerySpace, orreryStar.position);
                vec3.scale(orreryStar.position, ORRERY_SCALE, orreryStar.position);
            });
        }
    }, "orreryMotion");
});
//# sourceMappingURL=orrery.js.map