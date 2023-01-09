import { CameraDef, CameraFollowDef, } from "../camera.js";
import { ColorDef } from "../color-ecs.js";
import { EM } from "../entity-manager.js";
import { AssetsDef } from "../game/assets.js";
import { ControllableDef } from "../game/controllable.js";
import { LocalPlayerDef, PlayerDef } from "../game/player.js";
import { createGrassTile, createGrassTileset, } from "../grass.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { ColliderDef } from "../physics/collider.js";
import { LinearVelocityDef } from "../physics/motion.js";
import { PhysicsStateDef, WorldFrameDef } from "../physics/nonintersection.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { PointLightDef } from "../render/lights.js";
import { cloneMesh, transformMesh } from "../render/mesh.js";
import { stdRenderPipeline } from "../render/pipelines/std-mesh.js";
import { outlineRender } from "../render/pipelines/std-outline.js";
import { postProcess } from "../render/pipelines/std-post.js";
import { shadowPipelines } from "../render/pipelines/std-shadow.js";
import { RenderableConstructDef, RendererDef } from "../render/renderer-ecs.js";
import { mat3, mat4, quat, V, vec3 } from "../sprig-matrix.js";
import { SAIL_FURL_RATE } from "./sail.js";
import { quatFromUpForward } from "../utils-3d.js";
import { randColor } from "../utils-game.js";
import { GrassCutTexPtr, renderGrassPipe } from "./xp-grass.js";
import { WindDef } from "./wind.js";
import { DevConsoleDef } from "../console.js";
import { clamp, sum } from "../math.js";
import { createShip, ShipDef } from "./ship.js";
import { assert } from "../util.js";
import { texTypeToBytes } from "../render/gpu-struct.js";
import { PartyDef } from "../game/party.js";
import { GrassMapDef, setMap } from "./grass-map.js";
import { InputsDef } from "../inputs.js";
import { ScoreDef } from "./score.js";
import { raiseManTurret } from "../game/turret.js";
/*
TODO:
[ ] PERF. Disable backface culling ONLY on grass

NOTES:
- Cut grass by updating a texture that has cut/not cut or maybe cut-height
*/
const DBG_PLAYER = true;
const WORLD_SIZE = 1024;
const RED_DAMAGE_CUTTING = 5;
const RED_DAMAGE_NOT_CUTTING = 1;
const GREEN_HEALING = 1;
// const WORLD_HEIGHT = 1024;
export async function initLD52(em, hosting) {
    const res = await em.whenResources(AssetsDef, 
    // WoodAssetsDef,
    // GlobalCursor3dDef,
    RendererDef, CameraDef);
    res.camera.fov = Math.PI * 0.5;
    // renderer
    res.renderer.pipelines = [
        ...shadowPipelines,
        stdRenderPipeline,
        renderGrassPipe,
        outlineRender,
        postProcess,
    ];
    // Sun
    const sunlight = em.new();
    em.set(sunlight, PointLightDef);
    // sunlight.pointLight.constant = 1.0;
    sunlight.pointLight.constant = 1.0;
    vec3.copy(sunlight.pointLight.ambient, [0.4, 0.4, 0.4]);
    // vec3.scale(sunlight.pointLight.ambient, sunlight.pointLight.ambient, 0.2);
    vec3.copy(sunlight.pointLight.diffuse, [0.5, 0.5, 0.5]);
    em.set(sunlight, PositionDef, V(50, 100, 10));
    em.set(sunlight, RenderableConstructDef, res.assets.ball.proto);
    // score
    const score = em.addResource(ScoreDef);
    em.requireSystem("updateScoreDisplay");
    em.requireSystem("detectGameEnd");
    // map
    setMap(em, "map1");
    // ground
    const ground = em.new();
    const groundMesh = cloneMesh(res.assets.unitCube.mesh);
    transformMesh(groundMesh, mat4.fromScaling(V(WORLD_SIZE, 1.0, WORLD_SIZE)));
    em.set(ground, RenderableConstructDef, groundMesh);
    em.set(ground, ColorDef, V(0.1, 0.5, 0.1));
    // em.set(ground, ColorDef, ENDESGA16.darkGreen);
    // em.ensureComponentOn(p, ColorDef, [0.2, 0.3, 0.2]);
    em.set(ground, PositionDef, V(-WORLD_SIZE * 0.5, -1.1, -WORLD_SIZE * 0.5));
    // em.ensureComponentOn(plane, PositionDef, [0, -5, 0]);
    // grass
    const lod1 = {
        bladeW: 0.2,
        // bladeH: 3,
        // bladeH: 1.6,
        // bladeH: 1.5,
        // bladeH: 1.8,
        bladeH: 4.2,
        // bladeH: 1.8,
        // TODO(@darzu): debugging
        // spacing: 1,
        // tileSize: 4,
        // spacing: 0.5,
        spacing: 0.5,
        // spacing: 0.3,
        tileSize: 16,
        // tileSize: 10,
        tilesPerSide: 5,
    };
    const lod2 = {
        ...lod1,
        bladeH: lod1.bladeH * 1.4,
        spacing: lod1.spacing * 2,
        tileSize: lod1.tileSize * 2,
    };
    const lod3 = {
        ...lod1,
        bladeH: lod1.bladeH * 1.6,
        spacing: lod1.spacing * 4,
        tileSize: lod1.tileSize * 4,
    };
    const lod4 = {
        ...lod1,
        tilesPerSide: 8,
        bladeH: lod1.bladeH * 1.8,
        spacing: lod1.spacing * 8,
        tileSize: lod1.tileSize * 8,
    };
    const lod5 = {
        ...lod1,
        tilesPerSide: 8,
        bladeW: lod1.bladeW * 2,
        bladeH: lod1.bladeH * 2,
        spacing: lod1.spacing * 32,
        tileSize: lod1.tileSize * 32,
    };
    const maxBladeDraw = ((lod1.tilesPerSide - 1) / 2) * lod1.tileSize;
    const tileOpts = {
        ...lod1,
        maxBladeDraw,
    };
    const grMesh = createGrassTile(tileOpts);
    const gr = em.new();
    em.set(gr, RenderableConstructDef, grMesh, undefined, undefined, undefined, "grass");
    em.set(gr, ColorDef, randColor());
    em.set(gr, PositionDef);
    // set
    const ts = await Promise.all([
        createGrassTileset(lod1),
        createGrassTileset(lod2),
        createGrassTileset(lod3),
        createGrassTileset(lod4),
        createGrassTileset(lod5),
    ]);
    console.log(`num grass tris: ${sum(ts.map((t) => t.numTris))}`);
    em.addResource(WindDef);
    em.requireSystem("changeWind");
    em.requireSystem("smoothWind");
    const ship = await createShip(em);
    em.requireSystem("sailShip");
    em.requireSystem("shipParty");
    // player
    const player = await createPlayer();
    player.physicsParent.id = ship.id;
    // vec3.set(0, 3, -1, player.position);
    const rudder = ship.ld52ship.rudder();
    vec3.copy(player.position, rudder.position);
    player.position[1] = 1.45;
    assert(CameraFollowDef.isOn(rudder));
    raiseManTurret(player, rudder);
    // update grass
    EM.registerSystem(null, [LocalPlayerDef], (_, res) => {
        const player = EM.findEntity(res.localPlayer.playerId, [WorldFrameDef]);
        if (player)
            for (let t of ts)
                t.update(player.world.position);
    }, "updateGrass");
    EM.requireSystem("updateGrass");
    const { renderer } = await EM.whenResources(RendererDef);
    const grassCutTex = renderer.renderer.getCyResource(GrassCutTexPtr);
    assert(grassCutTex);
    const bytesPerVal = texTypeToBytes[GrassCutTexPtr.format];
    // grass cutting
    // cutGrassAt(100, 100, 100, 100);
    function getArrayForBox(w, h) {
        let size = w * h * bytesPerVal;
        // TODO(@darzu): PERF. Cache these!
        const data = new Float32Array(size);
        return data;
    }
    // debug stuff
    const { dev } = await EM.whenResources(DevConsoleDef);
    // dev.showConsole = true;
    // player.controllable.modes.canFly = true;
    EM.registerSystem([], [InputsDef], (_, res) => {
        // TODO(@darzu):
        if (res.inputs.keyClicks[" "]) {
            ship.ld52ship.cuttingEnabled = !ship.ld52ship.cuttingEnabled;
        }
    }, "cuttingOnOff");
    EM.requireSystem("cuttingOnOff");
    // TODO(@darzu): PERF. bad mem usage everywhere..
    let worldCutData = new Float32Array(grassCutTex.size[0] * grassCutTex.size[1]);
    assert(WORLD_SIZE === grassCutTex.size[0] && WORLD_SIZE === grassCutTex.size[1]);
    const worldToTex = (x) => Math.floor(x + WORLD_SIZE / 2);
    // const worldToTexZ = (z: number) => Math.floor(z + WORLD_HEIGHT / 2);
    const texToWorld = (x) => x - WORLD_SIZE / 2 + 0.5;
    score.onLevelEnd.push(() => {
        worldCutData.fill(0.0);
        grassCutTex.queueUpdate(worldCutData);
        vec3.set(0, 0, 0, ship.position);
        quat.identity(ship.rotation);
        vec3.set(0, 0, 0, ship.linearVelocity);
        const sail = ship.ld52ship.mast().mast.sail().sail;
        sail.unfurledAmount = sail.minFurl;
        ship.ld52ship.cuttingEnabled = true;
        ship.ld52ship.rudder().yawpitch.yaw = 0;
    });
    EM.registerSystem([ShipDef, PositionDef, WorldFrameDef, PhysicsStateDef], [PartyDef, GrassMapDef, ScoreDef], (es, res) => {
        if (!es.length)
            return;
        const ship = es[0];
        // if (!ship.ld52ship.cuttingEnabled) return;
        assert(ship._phys.colliders.length >= 1);
        const worldAABB = ship._phys.colliders[0].aabb;
        const selfAABB = ship._phys.colliders[0].selfAABB;
        // window texture
        const winXi = worldToTex(worldAABB.min[0]);
        const winYi = worldToTex(worldAABB.min[2]);
        const winWi = Math.ceil(worldAABB.max[0] - worldAABB.min[0]);
        const winHi = Math.ceil(worldAABB.max[2] - worldAABB.min[2]);
        if (winXi < 0 ||
            grassCutTex.size[0] <= winXi + winWi ||
            winYi < 0 ||
            grassCutTex.size[1] <= winYi + winHi) {
            res.score.shipHealth -= 320;
            return;
        }
        const windowData = getArrayForBox(winWi, winHi);
        const shipW = selfAABB.max[0] - selfAABB.min[0];
        const shipH = selfAABB.max[2] - selfAABB.min[2];
        let healthChanges = 0;
        let cutPurple = 0;
        // update world texture data
        for (let xi = winXi; xi < winXi + winWi; xi++) {
            for (let yi = winYi; yi < winYi + winHi; yi++) {
                const x = texToWorld(xi);
                const z = texToWorld(yi);
                let toParty = vec3.sub(V(x, 0, z), res.party.pos);
                let zDist = vec3.dot(toParty, res.party.dir);
                let partyX = vec3.cross(res.party.dir, V(0, 1, 0));
                let xDist = vec3.dot(toParty, partyX);
                if (Math.abs(xDist) < shipW * 0.5 && Math.abs(zDist) < shipH * 0.5) {
                    const idx = xi + yi * WORLD_SIZE;
                    const color = res.grassMap.map[idx];
                    if (ship.ld52ship.cuttingEnabled) {
                        if (worldCutData[idx] != 1) {
                            // we are cutting this grass for the first time
                            if (color < 0.1) {
                                // green
                                healthChanges += GREEN_HEALING;
                            }
                            else if (color < 0.6) {
                                // red
                                healthChanges -= RED_DAMAGE_CUTTING;
                            }
                            else {
                                // purple
                                cutPurple += 1;
                            }
                        }
                        worldCutData[idx] = 1;
                    }
                    else {
                        if (0.1 < color && color < 0.6) {
                            // red
                            healthChanges -= RED_DAMAGE_NOT_CUTTING;
                        }
                    }
                }
            }
        }
        res.score.shipHealth = Math.min(res.score.shipHealth + healthChanges, 10000);
        res.score.cutPurple += cutPurple;
        // copy from world texture data to update window
        for (let xi = winXi; xi < winXi + winWi; xi++) {
            for (let yi = winYi; yi < winYi + winHi; yi++) {
                const worldIdx = xi + yi * WORLD_SIZE;
                const val = worldCutData[worldIdx];
                const winIdx = xi - winXi + (yi - winYi) * winWi;
                windowData[winIdx] = val;
            }
        }
        // console.dir(data);
        grassCutTex.queueUpdate(windowData, winXi, winYi, winWi, winHi);
        // rasterizeTri
    }, "cutGrassUnderShip");
    EM.requireSystem("cutGrassUnderShip");
    EM.addConstraint(["detectGameEnd", "after", "cutGrassUnderShip"]);
    EM.registerSystem([], [InputsDef], (_, res) => {
        const mast = ship.ld52ship.mast();
        const rudder = ship.ld52ship.rudder();
        // furl/unfurl
        if (rudder.turret.mannedId) {
            const sail = mast.mast.sail().sail;
            if (res.inputs.keyDowns["w"])
                sail.unfurledAmount += SAIL_FURL_RATE;
            if (res.inputs.keyDowns["s"])
                sail.unfurledAmount -= SAIL_FURL_RATE;
            sail.unfurledAmount = clamp(sail.unfurledAmount, sail.minFurl, 1.0);
        }
    }, "furlUnfurl");
    EM.requireSystem("furlUnfurl");
    const shipWorld = await EM.whenEntityHas(ship, WorldFrameDef);
    EM.registerSystem([], [InputsDef, WindDef], (_, res) => {
        const mast = ship.ld52ship.mast();
        // const rudder = ship.ld52ship.rudder()!;
        // const shipDir = vec3.transformQuat(V(0, 0, 1), shipWorld.world.rotation);
        const invShip = mat3.invert(mat3.fromMat4(shipWorld.world.transform));
        const windLocalDir = vec3.transformMat3(res.wind.dir, invShip);
        const shipLocalDir = V(0, 0, 1);
        const optimalSailLocalDir = vec3.normalize(vec3.add(windLocalDir, shipLocalDir));
        // console.log(`ship to wind: ${vec3.dot(windLocalDir, shipLocalDir)}`);
        // const normal = vec3.transformQuat(AHEAD_DIR, e.world.rotation);
        // e.sail.billowAmount = vec3.dot(normal, res.wind.dir);
        // sail.force * vec3.dot(AHEAD_DIR, normal);
        // const currSailForce =
        // need to maximize: dot(wind, sail) * dot(sail, ship)
        // TODO(@darzu): ANIMATE SAIL TOWARD WIND
        if (vec3.dot(optimalSailLocalDir, shipLocalDir) > 0.01)
            quatFromUpForward(mast.rotation, V(0, 1, 0), optimalSailLocalDir);
    }, "turnMast");
    EM.requireSystem("turnMast");
}
async function createPlayer() {
    const { assets, me } = await EM.whenResources(AssetsDef, MeDef);
    const p = EM.new();
    EM.set(p, ControllableDef);
    p.controllable.modes.canFall = false;
    p.controllable.modes.canJump = false;
    // g.controllable.modes.canYaw = true;
    // g.controllable.modes.canPitch = true;
    EM.set(p, CameraFollowDef, 1);
    // setCameraFollowPosition(p, "firstPerson");
    // setCameraFollowPosition(p, "thirdPerson");
    EM.set(p, PositionDef);
    EM.set(p, RotationDef);
    // quat.rotateY(g.rotation, quat.IDENTITY, (-5 * Math.PI) / 8);
    // quat.rotateX(g.cameraFollow.rotationOffset, quat.IDENTITY, -Math.PI / 8);
    EM.set(p, LinearVelocityDef);
    vec3.copy(p.position, [0, 1, -1.2]);
    quat.setAxisAngle([0.0, -1.0, 0.0], 1.62, p.rotation);
    p.cameraFollow.positionOffset = V(0, 0, 5);
    p.controllable.speed *= 0.5;
    p.controllable.sprintMul = 10;
    const sphereMesh = cloneMesh(assets.ball.mesh);
    const visible = true;
    EM.set(p, RenderableConstructDef, sphereMesh, visible);
    EM.set(p, ColorDef, V(0.1, 0.1, 0.1));
    EM.set(p, PositionDef, V(0, 0, 0));
    // em.ensureComponentOn(b2, PositionDef, [0, 0, -1.2]);
    EM.set(p, WorldFrameDef);
    // em.ensureComponentOn(b2, PhysicsParentDef, g.id);
    EM.set(p, ColliderDef, {
        shape: "AABB",
        solid: true,
        aabb: assets.ball.aabb,
    });
    vec3.copy(p.position, [-28.11, 26.0, -28.39]);
    quat.copy(p.rotation, [0.0, -0.94, 0.0, 0.34]);
    vec3.copy(p.cameraFollow.positionOffset, [0.0, 2.0, 5.0]);
    p.cameraFollow.yawOffset = 0.0;
    p.cameraFollow.pitchOffset = -0.593;
    EM.ensureResource(LocalPlayerDef, p.id);
    EM.set(p, PlayerDef);
    EM.set(p, AuthorityDef, me.pid);
    EM.set(p, PhysicsParentDef);
    return p;
}
// const wCorners = getAABBCornersTemp(selfAABB);
// wCorners.forEach((p) => vec3.transformMat4(p, ship.world.transform, p));
// wCorners.sort((a, b) => a[1] - b[1]); // sort by y, ascending
// const quad = wCorners.slice(0, 4);
// // assumes quad[0] and quad[3] are opposite corners
// const tri1 = [quad[0], quad[3], quad[1]];
// const tri2 = [quad[0], quad[3], quad[2]];
// if (
//   texX < 0 ||
//   grassCutTex.size[0] <= texX + w ||
//   texY < 0 ||
//   grassCutTex.size[1] <= texY + h
// ) {
//   console.warn("out of bounds grass cut");
//   return;
// }
// // data.fill(1);
// const write = (wx: number, wy: number) => {
//   // const xi = clamp(wx - orgX, 0, w - 1);
//   // const yi = clamp(wy - orgZ, 0, h - 1);
//   const xi = wx + WORLD_WIDTH / 2;
//   const yi = wy + WORLD_HEIGHT / 2;
//   const idx = Math.floor(xi + yi * WORLD_WIDTH);
//   // const idx = xi + yi * w;
//   // assert(
//   //   0 <= idx && idx < data.length,
//   //   `idx out of bounds: (${xi},${yi})=>${idx}`
//   // );
//   // console.log(idx);
//   worldCut[idx] = 1.0;
//   numCut++;
// };
// let numCut = 0;
// // TODO(@darzu): make sure we're not unsetting stuff that's been set to 1 from prev frames!
// // rasterizeTri(
// //   [tri1[0][0], tri1[0][2]],
// //   [tri1[1][0], tri1[1][2]],
// //   [tri1[2][0], tri1[2][2]],
// //   write
// // );
// rasterizeTri(
//   [tri2[0][0], tri2[0][2]],
//   [tri2[1][0], tri2[1][2]],
//   [tri2[2][0], tri2[2][2]],
//   write
// );
// // console.log(`numCut: ${numCut}`);
// // console.dir({
// //   texX,
// //   texY,
// //   w,
// //   h,
// //   orgX,
// //   orgZ,
// //   WORLD_WIDTH,
// //   tri1,
// //   tri2,
// // });
// // throw `stop`;
// // update data
// for (let wxi = texX; wxi < texX + w; wxi++) {
//   for (let wyi = texY; wyi < texY + h; wyi++) {
//     const wIdx = Math.floor(wxi + wyi * WORLD_WIDTH);
//     // console.log(wIdx);
//     const v = worldCut[wIdx];
//     const dIdx = Math.floor(wxi - texX + (wyi - texY) * w);
//     // assert(0 <= dIdx && dIdx < data.length, `idx out of bounds: ${dIdx}`);
//     // data[dIdx] = 1.0;
//     // if (v > 0.1) console.log(dIdx);
//     // console.log(dIdx);
//     data[dIdx] = v;
//   }
// }
//# sourceMappingURL=game-ld52.js.map