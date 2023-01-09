import { EM } from "../entity-manager.js";
import { comparisonSamplerPtr, CY, linearSamplerPtr, } from "../render/gpu-registry.js";
import { createCyStruct } from "../render/gpu-struct.js";
import { pointLightsPtr } from "../render/lights.js";
import { MAX_INDICES } from "../render/mesh-pool.js";
import { sceneBufPtr, litTexturePtr, surfacesTexturePtr, mainDepthTex, normalsTexturePtr, } from "../render/pipelines/std-scene.js";
import { shadowDepthTextures } from "../render/pipelines/std-shadow.js";
import { mat4, V, vec3 } from "../sprig-matrix.js";
import { assertDbg } from "../util.js";
import { computeTriangleNormal } from "../utils-3d.js";
import { GrassMapTexPtr } from "./grass-map.js";
const MAX_GRASS_VERTS = MAX_INDICES;
const MAX_GRASS_MESHES = 500;
// TODO(@darzu): change
export const GrassVertStruct = createCyStruct({
    position: "vec3<f32>",
    // color: "vec3<f32>",
    normal: "vec3<f32>",
    // tangent towards +u
    // tangent: "vec3<f32>",
    // uv: "vec2<f32>",
    surfaceId: "u32",
}, {
    isCompact: true,
    serializer: ({ position, normal, 
    //  color, normal, tangent, uv,
    surfaceId, }, _, offsets_32, views) => {
        views.f32.set(position, offsets_32[0]);
        // views.f32.set(color, offsets_32[1]);
        views.f32.set(normal, offsets_32[1]);
        // views.f32.set(tangent, offsets_32[3]);
        // views.f32.set(uv, offsets_32[4]);
        views.u32[offsets_32[2]] = surfaceId;
    },
});
export const GrassUniStruct = createCyStruct({
    transform: "mat4x4<f32>",
    // TODO(@darzu): what is this for?
    // aabbMin: "vec3<f32>",
    // aabbMax: "vec3<f32>",
    tint: "vec3<f32>",
    id: "u32",
    spawnDist: "f32",
}, {
    isUniform: true,
    serializer: (d, _, offsets_32, views) => {
        views.f32.set(d.transform, offsets_32[0]);
        // views.f32.set(d.aabbMin, offsets_32[1]);
        // views.f32.set(d.aabbMax, offsets_32[2]);
        views.f32.set(d.tint, offsets_32[1]);
        views.u32[offsets_32[2]] = d.id;
        views.f32[offsets_32[3]] = d.spawnDist;
    },
});
// const MAX_GERSTNER_WAVES = 8;
// export const GerstnerWaveStruct = createCyStruct(
//   {
//     D: "vec2<f32>",
//     Q: "f32",
//     A: "f32",
//     w: "f32",
//     phi: "f32",
//     // TODO: solve alignment issues--shouldn't need manual padding
//     padding1: "f32",
//     padding2: "f32",
//   },
//   {
//     isUniform: true,
//     hackArray: true,
//   }
// );
// export type GerstnerWaveTS = CyToTS<typeof GerstnerWaveStruct.desc>;
// export const gerstnerWavesPtr = CY.createArray("gerstnerWave", {
//   struct: GerstnerWaveStruct,
//   init: MAX_GERSTNER_WAVES,
//   forceUsage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
// });
export const grassVertsPtr = CY.createArray("grassVertsBuf", {
    struct: GrassVertStruct,
    init: MAX_GRASS_VERTS,
});
const grassTriIndsPtr = CY.createIdxBuf("grassTriIndsBuf", {
    init: () => MAX_GRASS_VERTS * 3,
});
const grassLineIndsPtr = CY.createIdxBuf("grassLineIndsBuf", {
    init: () => MAX_GRASS_VERTS * 2,
});
const grassUnisPtr = CY.createArray("grassUni", {
    struct: GrassUniStruct,
    init: MAX_GRASS_MESHES,
});
function createEmptyVertexTS() {
    return {
        position: vec3.create(),
        // color: vec3.create(),
        // tangent: m.tangents ? m.tangents[i] : [1.0, 0.0, 0.0],
        normal: vec3.create(),
        // uv: m.uvs ? m.uvs[i] : [0.0, 0.0],
        surfaceId: 0,
    };
}
const tempVertsData = [];
function computeGrassVertsData(m, startIdx, count) {
    assertDbg(0 <= startIdx && startIdx + count <= m.pos.length);
    while (tempVertsData.length < count)
        tempVertsData.push(createEmptyVertexTS());
    for (let vi = startIdx; vi < startIdx + count; vi++) {
        const dIdx = vi - startIdx;
        // NOTE: assignment is fine since this better not be used without being re-assigned
        tempVertsData[dIdx].position = m.pos[vi];
        // TODO(@darzu): UVs and other properties?
    }
    // NOTE: for per-face data (e.g. color and surface IDs), first all the quads then tris
    m.tri.forEach((triInd, i) => {
        // set provoking vertex data
        const provVi = triInd[0];
        // is triangle relevant to changed vertices?
        if (provVi < startIdx || startIdx + count <= provVi)
            return;
        const dIdx = provVi - startIdx;
        // TODO(@darzu): add support for writting to all three vertices (for non-provoking vertex setups)
        // TODO(@darzu): what to do about normals. If we're modifying verts, they need to recompute. But it might be in the mesh.
        const normal = computeTriangleNormal(m.pos[triInd[0]], m.pos[triInd[1]], m.pos[triInd[2]]);
        tempVertsData[dIdx].normal = normal;
        const faceIdx = i + m.quad.length; // quads first
        // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
        // tempVertsData[dIdx].color = m.colors[faceIdx];
        tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
    });
    m.quad.forEach((quadInd, i) => {
        // set provoking vertex data
        const provVi = quadInd[0];
        // is quad relevant to changed vertices?
        if (provVi < startIdx || startIdx + count <= provVi)
            return;
        const dIdx = provVi - startIdx;
        const normal = computeTriangleNormal(m.pos[quadInd[0]], m.pos[quadInd[1]], m.pos[quadInd[2]]);
        tempVertsData[dIdx].normal = normal;
        const faceIdx = i; // quads first
        // TODO(@darzu): QUAD DATA BEING FIRST BUT TRIANGLES INDICES BEING FIRST IS INCONSISTENT
        // tempVertsData[dIdx].color = m.colors[faceIdx];
        tempVertsData[dIdx].surfaceId = m.surfaceIds[faceIdx];
    });
    return tempVertsData;
}
export function computeGrassUniData(m) {
    // TODO(@darzu): change
    // const { min, max } = getAABBFromMesh(m);
    const uni = {
        transform: mat4.create(),
        // aabbMin: min,
        // aabbMax: max,
        spawnDist: 20.0,
        tint: vec3.create(),
        id: 0,
    };
    return uni;
}
export const grassPoolPtr = CY.createMeshPool("grassPool", {
    computeVertsData: computeGrassVertsData,
    // TODO(@darzu): per-mesh unis should maybe be optional? I don't think
    //     the grass needs them
    computeUniData: computeGrassUniData,
    vertsPtr: grassVertsPtr,
    unisPtr: grassUnisPtr,
    triIndsPtr: grassTriIndsPtr,
    lineIndsPtr: grassLineIndsPtr,
});
export const GrassCutTexPtr = CY.createTexture("grassCut", {
    size: [1024, 1024],
    // TODO(@darzu): we want the smaller format
    format: "r32float",
    // format: "r8unorm",
});
export const renderGrassPipe = CY.createRenderPipeline("grassRender", {
    globals: [
        sceneBufPtr,
        { ptr: linearSamplerPtr, alias: "samp" },
        ...shadowDepthTextures.map((tex, i) => ({
            ptr: tex,
            alias: `shadowMap${i}`,
        })),
        { ptr: comparisonSamplerPtr, alias: "shadowSampler" },
        // gerstnerWavesPtr,
        pointLightsPtr,
        GrassCutTexPtr,
        GrassMapTexPtr,
        // { ptr: grassJfa.sdfTex, alias: "sdf" },
    ],
    // TODO(@darzu): for perf, maybe do backface culling
    cullMode: "none",
    meshOpt: {
        pool: grassPoolPtr,
        stepMode: "per-mesh-handle",
    },
    shaderVertexEntry: "vert_main",
    shaderFragmentEntry: "frag_main",
    output: [
        {
            ptr: litTexturePtr,
            clear: "never",
        },
        {
            ptr: normalsTexturePtr,
            clear: "never",
            defaultColor: V(0, 0, 0, 0),
        },
        {
            ptr: surfacesTexturePtr,
            clear: "never",
        },
    ],
    depthStencil: mainDepthTex,
    shader: (shaderSet) => `
  ${shaderSet["std-rand"].code}
  ${shaderSet["xp-grass"].code}
  `,
});
export const RenderDataGrassDef = EM.defineComponent("renderDataGrass", (r) => r);
//# sourceMappingURL=xp-grass.js.map