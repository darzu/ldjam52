import { DetectedEventsDef, eventWizard, } from "../net/events.js";
import { EM, } from "../entity-manager.js";
import { PlayerDef } from "./player.js";
import { PhysicsResultsDef } from "../physics/nonintersection.js";
import { AuthorityDef } from "../net/components.js";
import { BulletDef } from "./bullet.js";
import { DeletedDef } from "../delete.js";
import { AssetsDef } from "./assets.js";
import { AudioDef } from "../audio.js";
import { PositionDef, RotationDef } from "../physics/transform.js";
import { breakEnemyShip, EnemyShipLocalDef } from "./enemy-ship.js";
const ENABLE_BULLETBULLET = false;
export function registerBulletCollisionSystem(em) {
    // TODO(@darzu):
    em.registerSystem([BulletDef, AuthorityDef], [PhysicsResultsDef, DetectedEventsDef], (bullets, resources) => {
        const { collidesWith } = resources.physicsResults;
        for (let o of bullets) {
            if (collidesWith.has(o.id)) {
                let otherIds = collidesWith.get(o.id);
                // find other bullets this bullet is colliding with. only want to find each collision once
                let otherBullets = otherIds.map((id) => id > o.id && em.findEntity(id, [BulletDef]));
                for (let otherBullet of otherBullets) {
                    if (otherBullet) {
                        // TODO(@darzu): HACK. bullet-bullet disabled for LD51
                        if (ENABLE_BULLETBULLET)
                            raiseBulletBullet(o, otherBullet);
                    }
                }
                // find players this bullet is colliding with, other than the player who shot the bullet
                let otherPlayers = otherIds
                    .map((id) => em.findEntity(id, [PlayerDef, AuthorityDef]))
                    .filter((p) => p !== undefined);
                for (let otherPlayer of otherPlayers) {
                    if (otherPlayer.authority.pid !== o.authority.pid)
                        raiseBulletPlayer(o, otherPlayer);
                }
            }
        }
    }, "bulletCollision");
}
export const raiseBulletBullet = eventWizard("bullet-bullet", [[BulletDef], [BulletDef]], ([b1, b2]) => {
    // assert(false, `raiseBulletBullet doesnt work on ld51`); // TODO(@darzu): ld51
    // This bullet might have already been deleted via the sync system
    EM.set(b1, DeletedDef);
    EM.set(b2, DeletedDef);
}, {
    // The authority entity is the one with the lowest id
    eventAuthorityEntity: (entities) => Math.min(...entities),
});
export const raiseBulletPlayer = eventWizard("bullet-player", () => [[BulletDef], [PlayerDef]], ([bullet, player]) => {
    // assert(false, `raiseBulletPlayer doesnt work on ld51`); // TODO(@darzu): ld51
    EM.ensureComponent(bullet.id, DeletedDef);
});
export const raiseBulletEnemyShip = eventWizard("bullet-enemyShip", () => [[BulletDef], [EnemyShipLocalDef, PositionDef, RotationDef]], ([bullet, enemyShip]) => {
    // assert(false, `raiseBulletEnemyShip doesnt work on ld51`); // TODO(@darzu): ld51
    EM.set(bullet, DeletedDef);
    const res = EM.getResources([AssetsDef, AudioDef]);
    breakEnemyShip(EM, enemyShip, res.assets.boat_broken, res.music);
});
//# sourceMappingURL=bullet-collision.js.map