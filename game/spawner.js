import { AnimateToDef } from "../animate-to.js";
import { createRef } from "../em_helpers.js";
import { EM } from "../entity-manager.js";
import { vec2, vec3, quat } from "../sprig-matrix.js";
import { onInit } from "../init.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { eventWizard } from "../net/events.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { spawnEnemyShip } from "./enemy-ship.js";
import { UVDirDef, UVPosDef } from "./ocean.js";
// TODO(@darzu): generalize for spawning non-enemy entities in the ocean
const ChildCS = [
    PositionDef,
    RotationDef,
    WorldFrameDef,
    PhysicsParentDef,
];
export const SpawnerDef = EM.defineComponent("spawner", function (s) {
    return {
        childrenToRelease: [],
        hasSpawned: false,
        ...s,
    };
});
export function createSpawner(uvPos, uvDir, animate) {
    const e = EM.new();
    EM.set(e, SpawnerDef);
    EM.set(e, UVPosDef, uvPos);
    EM.set(e, UVDirDef, uvDir);
    EM.set(e, PositionDef);
    EM.set(e, RotationDef);
    // TODO(@darzu): put AuthorityDef and sync stuff on spawner
    if (animate)
        EM.set(e, AnimateToDef, animate);
    return e;
}
onInit((em) => {
    em.registerSystem([SpawnerDef, UVPosDef, UVDirDef], [MeDef], (tiles, res) => {
        for (let t of tiles) {
            if (AuthorityDef.isOn(t) && t.authority.pid !== res.me.pid)
                continue;
            if (t.spawner.hasSpawned)
                continue;
            // TODO(@darzu): move to util, very useful
            // const angle = Math.atan2(
            //   t.spawner.towardsPlayerDir[2],
            //   -t.spawner.towardsPlayerDir[0]
            // );
            // TODO(@darzu): parameterize what is spawned
            const b = spawnEnemyShip(vec2.copy(vec2.create(), t.uvPos), t.id, vec2.copy(vec2.create(), t.uvDir));
            // console.log(`spawning ${b.id} from ${t.id} at ${performance.now()}`);
            t.spawner.childrenToRelease.push(createRef(b.id, [...ChildCS]));
            t.spawner.hasSpawned = true;
        }
    }, "spawnOnTile");
    // TODO(@darzu): this seems really general
    const runUnparent = eventWizard("unparent", [[PhysicsParentDef, PositionDef, RotationDef, WorldFrameDef]], ([c]) => {
        // TODO(@darzu): DBG
        // console.log(`unparent on: ${c.id}`);
        vec3.copy(c.position, c.world.position);
        quat.copy(c.rotation, c.world.rotation);
        c.physicsParent.id = 0;
    });
    // TODO(@darzu): can we make this more ground agnostic?
    em.registerSystem([SpawnerDef, RotationDef, PositionDef], [MeDef], (tiles, res) => {
        const toRemove = [];
        for (let t of tiles) {
            if (AuthorityDef.isOn(t) && t.authority.pid !== res.me.pid)
                continue;
            // TODO(@darzu): is spawner still relevant?
            // is the ground ready?
            // if (!t.groundLocal.readyForSpawn) continue;
            // TODO(@darzu): it'd be nice to have a non-network event system
            // are we still animating?
            if (AnimateToDef.isOn(t))
                continue;
            // unparent children
            // console.log(`childrenToRelease: ${t.spawner.childrenToRelease.length}`);
            for (let i = t.spawner.childrenToRelease.length - 1; i >= 0; i--) {
                const c = t.spawner.childrenToRelease[i]();
                if (c) {
                    // console.log(
                    //   `unparenting ${c.id} from ${t.id} at ${performance.now()}`
                    // );
                    // TODO(@darzu): we're doing duplicate work here. we do it so that at least
                    //  on the host there is less position flickering
                    vec3.copy(c.position, c.world.position);
                    quat.copy(c.rotation, c.world.rotation);
                    c.physicsParent.id = 0;
                    runUnparent(c);
                    t.spawner.childrenToRelease.splice(i);
                }
            }
            // do we still have children to release?
            if (!t.spawner.childrenToRelease.length) {
                toRemove.push(t.id); // if not, remove the spawner
            }
        }
        for (let id of toRemove) {
            EM.removeComponent(id, SpawnerDef);
        }
    }, "spawnFinishAnimIn");
});
//# sourceMappingURL=spawner.js.map