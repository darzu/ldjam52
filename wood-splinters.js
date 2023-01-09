// TODO(@darzu): hacky file split
import { ColorDef } from "./color-ecs.js";
import { EM } from "./entity-manager.js";
import { BLACK } from "./game/assets.js";
import { GravityDef } from "./game/gravity.js";
import { vec3, mat4 } from "./sprig-matrix.js";
import { jitter } from "./math.js";
import { LinearVelocityDef, AngularVelocityDef } from "./physics/motion.js";
import { PositionDef, RotationDef } from "./physics/transform.js";
import { normalizeMesh } from "./render/mesh.js";
import { RenderableConstructDef } from "./render/renderer-ecs.js";
import { vec3Reverse, vec4Reverse } from "./utils-3d.js";
import { createEmptyMesh, createTimberBuilder, SplinterParticleDef, } from "./wood.js";
export function createSplinterPool(width, depth, length, color, numInPool) {
    const em = EM;
    const pool = [];
    let nextIdx = 0;
    function getNext() {
        if (nextIdx >= pool.length)
            nextIdx = 0;
        return pool[nextIdx++];
    }
    // const { assets } = await em.whenResources(AssetsDef);
    for (let i = 0; i < numInPool; i++) {
        // create flying splinter
        const topW = 0.6 + jitter(0.4);
        const botW = 0.6 + jitter(0.4);
        const _splinterMesh = mkTimberSplinterFree(topW, botW, length, width, depth);
        const splinterMesh = normalizeMesh(_splinterMesh);
        const splinter = em.new();
        em.set(splinter, RenderableConstructDef, splinterMesh);
        em.set(splinter, ColorDef, color);
        em.set(splinter, PositionDef);
        em.set(splinter, RotationDef);
        em.set(splinter, AngularVelocityDef);
        em.set(splinter, LinearVelocityDef);
        em.set(splinter, GravityDef);
        em.set(splinter, SplinterParticleDef);
        pool.push(splinter);
    }
    return {
        width,
        depth,
        length,
        color,
        numInPool,
        getNext,
    };
}
export const mkTimberSplinterFree = (topWidth, botWidth, height, width, depth) => {
    // const b = createTimberBuilder(.5, .2);
    const b = createTimberBuilder(createEmptyMesh("splinter"));
    b.width = width;
    b.depth = depth;
    // mat4.rotateY(b.cursor, b.cursor, Math.PI * -0.5); // TODO(@darzu): DBG
    // const Wtop = 1 + jitter(0.9);
    // const Wbot = 1 + jitter(0.9);
    const Wtop = topWidth;
    const Wbot = botWidth;
    // const W = 0.75 + jitter(0.25);
    const H = height;
    const topJags = Math.round(10 * width * Wtop);
    const botJags = Math.round(10 * width * Wbot);
    mat4.translate(b.cursor, [0, -H * 0.5, 0], b.cursor);
    mat4.scale(b.cursor, [Wbot, 1, 1], b.cursor);
    b.addLoopVerts();
    const loopBotEndIdx = b.mesh.pos.length;
    mat4.translate(b.cursor, [0, +H, 0], b.cursor);
    mat4.scale(b.cursor, [(1 / Wbot) * Wtop, 1, 1], b.cursor);
    b.addLoopVerts();
    const loopTopEndIdx = b.mesh.pos.length;
    b.addSideQuads();
    // top splinters
    b.addSplinteredEnd(loopTopEndIdx, topJags);
    // mat4.translate(b.cursor, b.cursor, [0, -0.2, 0]);
    {
        mat4.scale(b.cursor, [(1 / Wtop) * Wbot, 1, 1], b.cursor);
        mat4.translate(b.cursor, [0, -H, 0], b.cursor);
        mat4.scale(b.cursor, [1, -1, 1], b.cursor);
        const tIdx = b.mesh.tri.length;
        const qIdx = b.mesh.quad.length;
        b.addSplinteredEnd(loopBotEndIdx, botJags);
        for (let ti = tIdx; ti < b.mesh.tri.length; ti++)
            vec3Reverse(b.mesh.tri[ti]);
        for (let ti = qIdx; ti < b.mesh.quad.length; ti++)
            vec4Reverse(b.mesh.quad[ti]);
    }
    // b.addEndQuad(false);
    // TODO(@darzu): triangle vs quad coloring doesn't work
    b.mesh.quad.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
    b.mesh.tri.forEach((_) => b.mesh.colors.push(vec3.clone(BLACK)));
    // console.dir(b.mesh);
    return b.mesh;
};
//# sourceMappingURL=wood-splinters.js.map