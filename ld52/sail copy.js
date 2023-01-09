import { EM, } from "../entity-manager.js";
import { vec2, vec3, V } from "../sprig-matrix.js";
import { PhysicsParentDef, PositionDef, RotationDef, ScaleDef, } from "../physics/transform.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { normalizeMesh, unshareProvokingVerticesWithMap, } from "../render/mesh.js";
import { RenderableConstructDef, RenderableDef, } from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { ColorDef } from "../color-ecs.js";
import { AssetsDef } from "../game/assets.js";
import { createRef } from "../em_helpers.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { WindDef } from "./wind.js";
const SAIL_TURN_SPEED = 5;
export const SAIL_FURL_RATE = 0.02;
const BILLOW_FACTOR = 0.2;
export const SailDef = EM.defineComponent("sail", () => ({
    width: 1,
    height: 1,
    unfurledAmount: 0.1,
    minFurl: 0.1,
    billowAmount: 0.0,
    force: 0.0,
    posMap: new Map(),
}));
function sailMesh(sail) {
    let x = 0;
    let y = 0;
    let i = 0;
    const pos = [];
    const tri = [];
    const colors = [];
    const lines = [];
    const uvs = [];
    while (y <= sail.height) {
        if (x > sail.width) {
            x = 0;
            y = y + 1;
            continue;
        }
        pos.push(V(x, -y, 0));
        uvs.push(V(x / sail.width, y / sail.height));
        // add triangles
        if (y > 0) {
            if (x > 0) {
                // front
                tri.push(V(i, i - 1, i - sail.width - 1));
                colors.push(V(0, 0, 0));
                // back
                tri.push(V(i - sail.width - 1, i - 1, i));
                colors.push(V(0, 0, 0));
            }
            if (x < sail.width) {
                // front
                tri.push(V(i, i - sail.width - 1, i - sail.width));
                colors.push(V(0, 0, 0));
                // back
                tri.push(V(i - sail.width, i - sail.width - 1, i));
                colors.push(V(0, 0, 0));
            }
        }
        // add lines
        if (x > 0) {
            lines.push(vec2.clone([i - 1, i]));
        }
        if (y > 0) {
            lines.push(vec2.clone([i - sail.width - 1, i]));
        }
        x = x + 1;
        i = i + 1;
    }
    const { mesh, posMap } = unshareProvokingVerticesWithMap({
        pos,
        tri,
        quad: [],
        colors,
        lines,
        uvs,
    });
    sail.posMap = posMap;
    return normalizeMesh(mesh);
}
export function createSail(em, width, height, scale) {
    const ent = em.new();
    em.set(ent, SailDef);
    ent.sail.width = width;
    ent.sail.height = height;
    const mesh = sailMesh(ent.sail);
    em.set(ent, RenderableConstructDef, mesh);
    em.set(ent, ScaleDef, V(scale, scale, scale));
    em.set(ent, PositionDef);
    em.set(ent, RotationDef);
    em.set(ent, ColorDef, V(0.9, 0.9, 0.9));
    return ent;
}
const AHEAD_DIR = V(0, 0, 1);
EM.registerSystem([SailDef, WorldFrameDef], [WindDef], (es, res) => {
    for (let e of es) {
        const normal = vec3.transformQuat(AHEAD_DIR, e.world.rotation);
        e.sail.billowAmount = vec3.dot(normal, res.wind.dir);
        if (e.sail.billowAmount < 0)
            e.sail.billowAmount = 0;
        if (e.sail.unfurledAmount > e.sail.minFurl) {
            e.sail.force = e.sail.billowAmount * e.sail.unfurledAmount;
        }
        else {
            e.sail.force = 0;
        }
    }
}, "applyWindToSail");
EM.registerSystem([SailDef, RenderableDef], [RendererDef], (es, { renderer }) => {
    for (let e of es) {
        // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
        const m = e.renderable.meshHandle.mesh;
        m.pos.forEach((p, i) => {
            const originalIndex = e.sail.posMap.get(i);
            let y = Math.floor(originalIndex / (e.sail.width + 1));
            let parabY;
            if (e.sail.height % 2 == 0) {
                parabY = y - e.sail.height / 2;
            }
            else {
                if (y < e.sail.height / 2) {
                    parabY = y - Math.ceil(e.sail.height / 2);
                }
                else {
                    parabY = y - Math.floor(e.sail.height / 2);
                }
            }
            p[2] = -(e.sail.billowAmount *
                BILLOW_FACTOR *
                e.sail.unfurledAmount *
                (parabY ** 2 - Math.ceil(e.sail.height / 2) ** 2));
            p[1] = -y * e.sail.unfurledAmount;
        });
        // TODO: perf: detect when we actually need to update this
        renderer.renderer.stdPool.updateMeshVertices(e.renderable.meshHandle, m);
    }
}, "billow");
EM.addConstraint(["billow", "after", "applyWindToSail"]);
export const MastDef = EM.defineComponent("mast", () => ({
    sail: createRef(0, [SailDef]),
    force: 0.0,
}));
export async function createMast(em) {
    const res = await em.whenResources(AssetsDef, MeDef);
    let ent = em.new();
    em.set(ent, MastDef);
    em.set(ent, RenderableConstructDef, res.assets.mast.proto);
    em.set(ent, PositionDef);
    em.set(ent, RotationDef);
    em.set(ent, ColorDef, V(0.8, 0.7, 0.3));
    em.set(ent, AuthorityDef, res.me.pid);
    // EM.set(ent, YawPitchDef);
    // const interactBox = em.new();
    // em.set(interactBox, PhysicsParentDef, ent.id);
    // em.set(interactBox, PositionDef, V(0, 0, 0));
    // em.set(interactBox, ColliderDef, {
    //   shape: "AABB",
    //   solid: false,
    //   aabb: {
    //     // HACK: put out of reach
    //     min: V(-1, 10, -1),
    //     max: V(1, 20, 1),
    //     // min: V(-1, -1, -1),
    //     // max: V(1, 1, 1),
    //   },
    // });
    // // TODO: setting the yawFactor to -1 is kind of hacky
    // constructNetTurret(
    //   ent,
    //   0,
    //   0,
    //   interactBox,
    //   Math.PI,
    //   -Math.PI / 8,
    //   -1,
    //   V(0, 20, 50),
    //   true,
    //   SAIL_TURN_SPEED
    // );
    // ent.turret.maxPitch = 0;
    // ent.turret.minPitch = 0;
    // ent.turret.maxYaw = Math.PI / 2;
    // ent.turret.minYaw = -Math.PI / 2;
    const sail = createSail(em, 8, 8, 2);
    em.set(sail, PhysicsParentDef, ent.id);
    sail.position[0] = -8;
    sail.position[1] = 38;
    sail.position[2] = 0.51;
    ent.mast.sail = createRef(sail);
    return ent;
}
// EM.registerSystem(
//   [MastDef, TurretDef],
//   [InputsDef, LocalPlayerDef],
//   (es, res) => {
//     const player = EM.findEntity(res.localPlayer.playerId, [PlayerDef])!;
//     if (!player) return;
//     for (let e of es) {
//       if (DeletedDef.isOn(e)) continue;
//       if (e.turret.mannedId !== player.id) continue;
//       const sail = e.mast.sail()!.sail;
//       if (res.inputs.keyDowns["s"]) sail.unfurledAmount += SAIL_FURL_RATE;
//       if (res.inputs.keyDowns["w"]) sail.unfurledAmount -= SAIL_FURL_RATE;
//       sail.unfurledAmount = clamp(sail.unfurledAmount, sail.minFurl, 1.0);
//     }
//   },
//   "furlSail"
// );
EM.addConstraint(["furlSail", "before", "applyWindToSail"]);
EM.registerSystem([MastDef, RotationDef], [], (es) => {
    for (let e of es) {
        const sail = e.mast.sail().sail;
        const normal = vec3.transformQuat(AHEAD_DIR, e.rotation);
        e.mast.force = sail.force * vec3.dot(AHEAD_DIR, normal);
    }
}, "mastForce");
EM.addConstraint(["mastForce", "after", "applyWindToSail"]);
EM.addConstraint(["mastForce", "after", "billow"]);
//# sourceMappingURL=sail%20copy.js.map