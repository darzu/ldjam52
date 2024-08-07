import { EM } from "../entity-manager.js";
import { LocalPlayerDef } from "./player.js";
import { V } from "../sprig-matrix.js";
import { MeDef } from "../net/components.js";
import { PhysicsResultsDef, WorldFrameDef, } from "../physics/nonintersection.js";
import { clearTint, setTint, TintsDef } from "../color-ecs.js";
import { DeletedDef } from "../delete.js";
export const InteractableDef = EM.defineComponent("interaction", (colliderId) => ({
    // TODO(@darzu): components having pointers to entities should be
    //  handled better
    // TODO(@darzu): use Ref system
    colliderId: colliderId || 0,
}));
export const InRangeDef = EM.defineComponent("inRange", () => true);
const INTERACTION_TINT = V(0.1, 0.2, 0.1);
const INTERACTION_TINT_NAME = "interaction";
export function registerInteractionSystem(em) {
    em.registerSystem([InteractableDef, WorldFrameDef], [LocalPlayerDef, MeDef, PhysicsResultsDef], (interactables, resources) => {
        const player = em.findEntity(resources.localPlayer.playerId, []);
        if (!player)
            return;
        const interactablesMap = interactables.reduce((map, i) => {
            map.set(i.interaction.colliderId, i);
            return map;
        }, new Map());
        for (let interactable of interactables) {
            if (DeletedDef.isOn(interactable))
                // TODO(@darzu): HACK this shouldn't be needed
                continue;
            if (InRangeDef.isOn(interactable)) {
                em.removeComponent(interactable.id, InRangeDef);
            }
            em.set(interactable, TintsDef);
            clearTint(interactable.tints, INTERACTION_TINT_NAME);
        }
        // find an interactable within range of the player
        const interactableColliderId = (resources.physicsResults.collidesWith.get(player.id) ?? []).find((id) => interactablesMap.has(id));
        if (interactableColliderId) {
            const interactable = interactablesMap.get(interactableColliderId);
            if (!DeletedDef.isOn(interactable)) {
                em.set(interactable, InRangeDef);
                em.set(interactable, TintsDef);
                setTint(interactable.tints, INTERACTION_TINT_NAME, INTERACTION_TINT);
            }
        }
    }, "interaction");
}
//# sourceMappingURL=interact.js.map