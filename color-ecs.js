import { EM } from "./entity-manager.js";
import { vec3 } from "./sprig-matrix.js";
export const ColorDef = EM.defineComponent("color", (c) => vec3.clone(c ?? vec3.ZEROS));
EM.registerSerializerPair(ColorDef, (o, writer) => {
    writer.writeVec3(o);
}, (o, reader) => {
    reader.readVec3(o);
});
export const TintsDef = EM.defineComponent("tints", () => new Map());
export function applyTints(tints, tint) {
    tints.forEach((c) => vec3.add(tint, c, tint));
}
export function setTint(tints, name, tint) {
    let current = tints.get(name);
    if (!current) {
        current = vec3.create();
        tints.set(name, current);
    }
    vec3.copy(current, tint);
}
export function clearTint(tints, name) {
    let current = tints.get(name);
    if (current) {
        vec3.set(0, 0, 0, current);
    }
}
export const AlphaDef = EM.defineComponent("alpha", (c) => c ?? 1.0);
//# sourceMappingURL=color-ecs.js.map