import { EM } from "../entity-manager.js";
import { vec3 } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { TimeDef } from "../time.js";
export const GravityDef = EM.defineComponent("gravity", (gravity) => {
    return gravity ?? vec3.create();
});
onInit((em) => {
    em.registerSystem([GravityDef, LinearVelocityDef], [TimeDef], (objs, res) => {
        const t = vec3.tmp();
        for (let b of objs) {
            vec3.scale(b.gravity, 0.00001 * res.time.dt, t);
            vec3.add(b.linearVelocity, t, b.linearVelocity);
        }
    }, "applyGravity");
});
//# sourceMappingURL=gravity.js.map