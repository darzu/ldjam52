import { EM } from "../entity-manager.js";
import { vec2, vec3, V } from "../sprig-matrix.js";
import { AuthorityDef, MeDef } from "../net/components.js";
import { RenderableConstructDef, RenderableDef, } from "../render/renderer-ecs.js";
import { PhysicsParentDef, PositionDef, RotationDef, } from "../physics/transform.js";
import { AssetsDef, BARGE_AABBS } from "./assets.js";
import { ColliderDef, } from "../physics/collider.js";
import { copyAABB, createAABB } from "../physics/broadphase.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";
import { clamp, min } from "../math.js";
import { createCannon } from "./cannon.js";
import { AudioDef } from "../audio.js";
import { LocalPlayerDef, PlayerDef } from "./player.js";
import { CameraDef } from "../camera.js";
import { InputsDef } from "../inputs.js";
import { InRangeDef, InteractableDef } from "./interact.js";
import { endGame, GameState, GameStateDef, startGame } from "./gamestate.js";
import { createRef, defineNetEntityHelper } from "../em_helpers.js";
import { DetectedEventsDef, eventWizard } from "../net/events.js";
import { MotionSmoothingDef } from "../motion-smoothing.js";
import { DevConsoleDef } from "../console.js";
import { constructNetTurret, TurretDef } from "./turret.js";
import { YawPitchDef } from "../yawpitch.js";
import { UVPosDef, UVDirDef } from "./ocean.js";
import { PartyDef } from "./party.js";
import { ShipDef } from "./ship.js";
import { createMastNow, MastLocalDef, MastPropsDef } from "./sail.js";
import { makeOrrery } from "./orrery.js";
import { ColorDef } from "../color-ecs.js";
// TODO(@darzu): impl. occassionaly syncable components with auto-versioning
export const BOAT_COLOR = V(0.2, 0.1, 0.05);
export const ShipPartDef = EM.defineComponent("shipPart", (critical) => ({
    critical,
    damaged: false,
}));
export const { GemPropsDef, GemLocalDef, createGem } = defineNetEntityHelper(EM, {
    name: "gem",
    defaultProps: (shipId) => ({
        shipId: shipId ?? 0,
    }),
    serializeProps: (o, buf) => {
        buf.writeUint32(o.shipId);
    },
    deserializeProps: (o, buf) => {
        o.shipId = buf.readUint32();
    },
    defaultLocal: () => true,
    dynamicComponents: [],
    buildResources: [AssetsDef, MeDef],
    build: (gem, res) => {
        const em = EM;
        em.set(gem, PositionDef, V(0, 0, 10));
        em.set(gem, RenderableConstructDef, res.assets.spacerock.proto);
        em.set(gem, PhysicsParentDef, gem.gemProps.shipId);
        em.set(gem, ColorDef);
        // create seperate hitbox for interacting with the gem
        const interactBox = em.new();
        const interactAABB = copyAABB(createAABB(), res.assets.spacerock.aabb);
        em.set(interactBox, PhysicsParentDef, gem.id);
        em.set(interactBox, PositionDef, V(0, 0, 0));
        em.set(interactBox, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: interactAABB,
        });
        em.set(gem, InteractableDef, interactBox.id);
    },
});
export const { RudderPropsDef, RudderLocalDef, createRudderNow } = defineNetEntityHelper(EM, {
    name: "rudder",
    defaultProps: (shipId) => ({
        shipId: shipId ?? 0,
    }),
    serializeProps: (o, buf) => {
        buf.writeUint32(o.shipId);
    },
    deserializeProps: (o, buf) => {
        o.shipId = buf.readUint32();
    },
    defaultLocal: () => true,
    dynamicComponents: [RotationDef],
    buildResources: [AssetsDef, MeDef],
    build: (rudder, res) => {
        const em = EM;
        em.set(rudder, PositionDef, V(0, 0.5, -15));
        em.set(rudder, RenderableConstructDef, res.assets.rudder.mesh);
        em.set(rudder, PhysicsParentDef, rudder.rudderProps.shipId);
        em.set(rudder, ColorDef, BOAT_COLOR);
        vec3.scale(rudder.color, 0.5, rudder.color);
        // create seperate hitbox for interacting with the rudder
        const interactBox = em.new();
        em.set(interactBox, PhysicsParentDef, rudder.rudderProps.shipId);
        em.set(interactBox, PositionDef, V(0, 0, -12));
        em.set(interactBox, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: {
                min: V(-1, -2, -2),
                max: V(1, 2, 2.5),
            },
        });
        constructNetTurret(rudder, 0, 0, interactBox, Math.PI, -Math.PI / 8, 1.5, V(0, 20, 50));
        rudder.turret.maxPitch = 0;
        rudder.turret.minPitch = 0;
        rudder.turret.maxYaw = Math.PI / 6;
        rudder.turret.minYaw = -Math.PI / 6;
        rudder.turret.invertYaw = true;
        return rudder;
    },
});
export const { PlayerShipPropsDef, PlayerShipLocalDef, createPlayerShip } = defineNetEntityHelper(EM, {
    name: "playerShip",
    defaultProps: (uvPos) => ({
        uvPos: uvPos ?? vec2.fromValues(0.5, 0.5),
        gemId: 0,
        cannonLId: 0,
        cannonRId: 0,
        rudder: createRef(0, [RudderPropsDef, YawPitchDef]),
        mast: createRef(0, [MastPropsDef, MastLocalDef]),
    }),
    serializeProps: (c, buf) => {
        buf.writeVec2(c.uvPos);
        buf.writeUint32(c.gemId);
        buf.writeUint32(c.cannonLId);
        buf.writeUint32(c.cannonRId);
    },
    deserializeProps: (c, buf) => {
        buf.readVec2(c.uvPos);
        c.gemId = buf.readUint32();
        c.cannonLId = buf.readUint32();
        c.cannonRId = buf.readUint32();
    },
    defaultLocal: () => ({
        parts: [],
    }),
    dynamicComponents: [
        // TODO(@darzu): do we want to sync UV based stuff instead?
        UVPosDef,
        UVDirDef,
        // PositionDef,
        // RotationDef,
        // LinearVelocityDef,
        // AngularVelocityDef,
    ],
    buildResources: [MeDef, AssetsDef],
    build: async (s, res) => {
        const em = EM;
        if (s.authority.pid === res.me.pid) {
            // s.playerShipProps.loc = [0, -2, 0];
            // create gem
            const gem = createGem(s.id);
            s.playerShipProps.gemId = gem.id;
            // create rudder
            const r = createRudderNow(res, s.id);
            s.playerShipProps.rudder = createRef(r);
            const m = createMastNow(res, s.id);
            s.playerShipProps.mast = createRef(m);
            // create cannons
            const cannonPitch = Math.PI * +0.05;
            const cannonR = createCannon(V(-6, 3, 5), Math.PI * 0.5, cannonPitch, s.id);
            s.playerShipProps.cannonRId = cannonR.id;
            const cannonL = createCannon(V(6, 3, 5), Math.PI * 1.5, cannonPitch, s.id);
            s.playerShipProps.cannonLId = cannonL.id;
        }
        vec2.copy(s.uvPos, s.playerShipProps.uvPos);
        vec2.set(1, 0, s.uvDir);
        em.set(s, PositionDef);
        em.set(s, RotationDef);
        em.set(s, MotionSmoothingDef);
        em.set(s, ShipDef);
        s.ship.speed = 0;
        // s.playerShipLocal.speed = 0.005 * 3; // TODO(@darzu): DEBUG SPEED
        // em.ensureComponentOn(s, LinearVelocityDef, [0, 0, 0]);
        // em.ensureComponentOn(s, AngularVelocityDef);
        const mc = {
            shape: "Multi",
            solid: true,
            // TODO(@darzu): integrate these in the assets pipeline
            children: BARGE_AABBS.map((aabb) => ({
                shape: "AABB",
                solid: true,
                aabb,
            })),
        };
        em.set(s, ColliderDef, mc);
        // NOTE: since their is no network important state on the parts themselves
        //    they can be created locally
        const shipFloor = min(BARGE_AABBS.map((c) => c.max[1]));
        for (let i = 0; i < res.assets.ship_broken.length; i++) {
            const m = res.assets.ship_broken[i];
            const part = em.new();
            em.set(part, PhysicsParentDef, s.id);
            em.set(part, RenderableConstructDef, m.proto);
            em.set(part, ColorDef, BOAT_COLOR);
            em.set(part, PositionDef, V(0, 0, 0));
            const isCritical = criticalPartIdxes.includes(i);
            em.set(part, ShipPartDef, isCritical);
            em.set(part, ColliderDef, {
                shape: "AABB",
                solid: false,
                aabb: m.aabb,
            });
            part.collider.aabb.max[1] = shipFloor;
            s.playerShipLocal.parts.push(createRef(part.id, [ShipPartDef, RenderableDef]));
        }
        makeOrrery(em, s.id);
        // em.addComponent(em.newEntity().id, AmmunitionConstructDef, [-40, -11, -2], 3);
        // em.addComponent(em.newEntity().id, LinstockConstructDef, [-40, -11, 2]);
    },
});
const criticalPartIdxes = [0, 3, 5, 6];
// export function createNewShip(em: EntityManager) {
//   em.registerOneShotSystem(null, [AssetsDef], (_, res) => {
//     // create ship
//     const s = em.newEntity();
//     em.ensureComponentOn(s, ShipConstructDef);
//   });
// }
const START_TEXT = "";
// const START_TEXT = "hit the gem to begin";
export function registerShipSystems(em) {
    em.registerSystem([GemPropsDef, InRangeDef], [GameStateDef, PhysicsResultsDef, MeDef, InputsDef, LocalPlayerDef], (gems, res) => {
        for (let gem of gems) {
            if (DeletedDef.isOn(gem))
                continue;
            if (res.gameState.state !== GameState.LOBBY)
                continue;
            if (res.inputs.keyClicks["e"]) {
                let player = EM.findEntity(res.localPlayer.playerId, [PlayerDef]);
                startGame(player);
            }
        }
    }, "startGame");
    const raiseShipHit = eventWizard("ship-hit", [[PlayerShipLocalDef]], ([ship], partIdx) => {
        const music = em.getResource(AudioDef);
        const part = ship.playerShipLocal.parts[partIdx]();
        part.renderable.enabled = false;
        part.shipPart.damaged = true;
        music.playChords([2, 3], "minor", 0.2, 5.0, -2);
    }, {
        legalEvent: ([ship], partIdx) => !!ship.playerShipLocal.parts[partIdx](),
        serializeExtra: (buf, o) => buf.writeUint8(o),
        deserializeExtra: (buf) => buf.readUint8(),
    });
    em.registerSystem([PlayerShipPropsDef, PlayerShipLocalDef, PositionDef, AuthorityDef], [
        AudioDef,
        InputsDef,
        CameraDef,
        GameStateDef,
        MeDef,
        PhysicsResultsDef,
        DetectedEventsDef,
    ], (ships, res) => {
        if (res.gameState.state !== GameState.PLAYING)
            return;
        for (let ship of ships) {
            if (ship.authority.pid !== res.me.pid)
                continue;
            let numCriticalDamaged = 0;
            // TODO(@darzu): EVENT! Notify players of dmg
            for (let i = 0; i < ship.playerShipLocal.parts.length; i++) {
                const part = ship.playerShipLocal.parts[i]();
                if (part) {
                    if (part.shipPart.damaged) {
                        if (part.shipPart.critical)
                            numCriticalDamaged += 1;
                        continue;
                    }
                    const bullets = res.physicsResults.collidesWith
                        .get(part.id)
                        ?.map((h) => em.findEntity(h, [BulletDef]))
                        .filter((h) => h && h.bullet.team === 2);
                    if (bullets && bullets.length) {
                        for (let b of bullets)
                            if (b)
                                em.ensureComponent(b.id, DeletedDef);
                        raiseShipHit(ship, i);
                    }
                }
            }
            if (numCriticalDamaged === criticalPartIdxes.length ||
                res.inputs.keyClicks["backspace"]) {
                endGame(ship);
            }
        }
    }, "shipHealthCheck");
    em.registerSystem([
        ShipDef,
        PlayerShipLocalDef,
        PlayerShipPropsDef,
        // LinearVelocityDef,
        // AngularVelocityDef,
        AuthorityDef,
        // RotationDef,
        UVDirDef,
    ], [GameStateDef, MeDef, InputsDef, DevConsoleDef], (ships, res) => {
        if (res.gameState.state !== GameState.PLAYING) {
            return;
        }
        for (let s of ships) {
            if (s.authority.pid !== res.me.pid)
                return;
            // TODO(@darzu): handle UV heading !!
            // vec3.set(s.linearVelocity, 0, -0.01, s.playerShipLocal.speed);
            // vec3.transformQuat(s.linearVelocity, s.linearVelocity, s.rotation);
            // s.angularVelocity[1] = s.playerShipProps.rudder()!.yawpitch.yaw * 0.0005;
            // TODO(@darzu): dbg ship physics when turning
            // s.angularVelocity[1] = -0.0001;
            // SPEED
            if (res.inputs.keyDowns["z"])
                s.ship.speed += 0.00001;
            if (res.inputs.keyDowns["x"])
                s.ship.speed -= 0.00001;
            s.ship.speed = clamp(s.ship.speed, -0.001, 0.001);
            //s.ship.speed = Math.max(0, s.ship.speed);
            // STEERING
            let yaw = s.playerShipProps.rudder().yawpitch.yaw;
            vec2.rotate(s.uvDir, vec2.ZEROS, yaw * 0.02, s.uvDir);
        }
    }, "playerShipMove");
    em.registerSystem([PlayerShipLocalDef, PlayerShipPropsDef, PositionDef], [PartyDef], (ships, res) => {
        if (ships[0])
            vec3.copy(res.party.pos, ships[0].position);
    }, "shipUpdateParty");
    // If a rudder isn't being manned, smooth it back towards straight
    em.registerSystem([RudderPropsDef, TurretDef, YawPitchDef, AuthorityDef], [MeDef], (rudders, res) => {
        for (let r of rudders) {
            if (r.authority.pid !== res.me.pid)
                return;
            if (r.turret.mannedId !== 0)
                return;
            if (Math.abs(r.yawpitch.yaw) < 0.01)
                r.yawpitch.yaw = 0;
            r.yawpitch.yaw *= 0.9;
        }
    }, "easeRudder");
}
//# sourceMappingURL=player-ship.js.map