import { EM } from "../entity-manager.js";
import { vec2, vec3, V } from "../sprig-matrix.js";
import { PositionDef } from "../physics/transform.js";
import { SyncDef, AuthorityDef, MeDef } from "../net/components.js";
import { FinishedDef } from "../build.js";
import { AssetsDef } from "./assets.js";
import { SpringType, SpringGridDef, ForceDef } from "./spring.js";
import { onInit } from "../init.js";
import { normalizeMesh, unshareProvokingVerticesWithMap, } from "../render/mesh.js";
import { RenderableConstructDef, RenderableDef, } from "../render/renderer-ecs.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { ColorDef } from "../color-ecs.js";
export const ClothConstructDef = EM.defineComponent("clothConstruct", (c) => ({
    location: c.location ?? V(0, 0, 0),
    color: c.color ?? V(0, 0, 0),
    rows: c.rows ?? 2,
    columns: c.columns ?? 2,
    distance: c.distance ?? 1,
}));
export const ClothLocalDef = EM.defineComponent("clothLocal", (posMap) => ({
    posMap: posMap ?? new Map(),
}));
EM.registerSerializerPair(ClothConstructDef, (clothConstruct, buf) => {
    buf.writeVec3(clothConstruct.location);
    buf.writeVec3(clothConstruct.color);
    buf.writeUint16(clothConstruct.rows);
    buf.writeUint16(clothConstruct.columns);
    buf.writeFloat32(clothConstruct.distance);
}, (clothConstruct, buf) => {
    buf.readVec3(clothConstruct.location);
    buf.readVec3(clothConstruct.color);
    clothConstruct.rows = buf.readUint16();
    clothConstruct.columns = buf.readUint16();
    clothConstruct.distance = buf.readFloat32();
});
function clothMesh(cloth) {
    let x = 0;
    let y = 0;
    let i = 0;
    const pos = [];
    const tri = [];
    const colors = [];
    const lines = [];
    const uvs = [];
    while (y < cloth.rows) {
        if (x == cloth.columns) {
            x = 0;
            y = y + 1;
            continue;
        }
        pos.push(V(x * cloth.distance, y * cloth.distance, 0));
        uvs.push(vec2.clone([x / (cloth.columns - 1), y / (cloth.rows - 1)]));
        // add triangles
        if (y > 0) {
            if (x > 0) {
                // front
                tri.push(V(i, i - 1, i - cloth.columns));
                colors.push(V(0, 0, 0));
                // back
                tri.push(V(i - cloth.columns, i - 1, i));
                colors.push(V(0, 0, 0));
            }
            if (x < cloth.columns - 1) {
                // front
                tri.push(V(i, i - cloth.columns, i - cloth.columns + 1));
                colors.push(V(0, 0, 0));
                // back
                tri.push(V(i - cloth.columns + 1, i - cloth.columns, i));
                colors.push(V(0, 0, 0));
            }
        }
        // add lines
        if (x > 0) {
            lines.push(vec2.clone([i - 1, i]));
        }
        if (y > 0) {
            lines.push(vec2.clone([i - cloth.columns, i]));
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
    return { mesh: normalizeMesh(mesh), posMap };
}
onInit((em) => {
    em.registerSystem([ClothConstructDef], [MeDef, AssetsDef], (cloths, res) => {
        for (let cloth of cloths) {
            if (FinishedDef.isOn(cloth))
                continue;
            em.set(cloth, PositionDef, cloth.clothConstruct.location);
            em.set(cloth, ColorDef, cloth.clothConstruct.color);
            const { mesh, posMap } = clothMesh(cloth.clothConstruct);
            em.set(cloth, ClothLocalDef, posMap);
            em.set(cloth, RenderableConstructDef, mesh);
            em.set(cloth, SpringGridDef, SpringType.SimpleDistance, cloth.clothConstruct.rows, cloth.clothConstruct.columns, [
                0,
                cloth.clothConstruct.columns - 1,
                cloth.clothConstruct.rows * (cloth.clothConstruct.columns - 1),
                cloth.clothConstruct.rows * cloth.clothConstruct.columns - 1,
            ], cloth.clothConstruct.distance);
            em.set(cloth, ForceDef);
            em.set(cloth, AuthorityDef, res.me.pid);
            em.set(cloth, SyncDef);
            cloth.sync.dynamicComponents = [ClothConstructDef.id];
            cloth.sync.fullComponents = [PositionDef.id, ForceDef.id];
            em.set(cloth, FinishedDef);
        }
    }, "buildCloths");
    em.registerSystem([ClothConstructDef, ClothLocalDef, SpringGridDef, RenderableDef], [RendererDef], (cloths, { renderer }) => {
        for (let cloth of cloths) {
            // NOTE: this cast is only safe so long as we're sure this mesh isn't being shared
            const m = cloth.renderable.meshHandle.mesh;
            m.pos.forEach((p, i) => {
                const originalIndex = cloth.clothLocal.posMap.get(i);
                return vec3.copy(p, cloth.springGrid.positions[originalIndex]);
            });
            renderer.renderer.stdPool.updateMeshVertices(cloth.renderable.meshHandle, m);
        }
    }, "updateClothMesh");
});
//# sourceMappingURL=cloth.js.map