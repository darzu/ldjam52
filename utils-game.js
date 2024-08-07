import { ColorDef } from "./color-ecs.js";
import { EM } from "./entity-manager.js";
import { AssetsDef } from "./game/assets.js";
import { vec3, vec4, V } from "./sprig-matrix.js";
import { mathMap } from "./math.js";
import { getLineEnd } from "./physics/broadphase.js";
import { PositionDef, ScaleDef } from "./physics/transform.js";
import { RenderableConstructDef, RenderableDef, RendererDef, } from "./render/renderer-ecs.js";
import { tempVec3 } from "./temp-pool.js";
import { randNormalPosVec3 } from "./utils-3d.js";
// TODO(@darzu): move this helper elsewhere?
// TODO(@darzu): would be dope to support thickness;
//    probably needs some shader work + a post pass
// TODO(@darzu): this whole line pool thing needs a hard rethink; it might be okay but it's pretty hacky rn
const _linePool = [];
const _linePoolLimit = 100;
let _linePoolNext = 0;
export async function drawLine2(line, color) {
    const end = getLineEnd(tempVec3(), line);
    return drawLine(line.ray.org, end, color);
}
export async function drawLine(start, end, color) {
    start = vec3.clone(start);
    const start2 = vec3.add(start, [0.2, 0.2, 0.2], vec3.create());
    end = vec3.clone(end);
    const end2 = vec3.add(end, [0.1, 0.1, 0.1], vec3.create());
    const pos = [start, start2, end2, end];
    if (_linePool.length >= _linePoolLimit) {
        const e = _linePool[_linePoolNext];
        _linePoolNext++;
        if (_linePoolNext >= _linePool.length)
            _linePoolNext = 0;
        const m = e.renderable.meshHandle.mesh;
        m.pos = pos;
        m.colors = [color, color];
        const res = await EM.whenResources(RendererDef);
        res.renderer.renderer.stdPool.updateMeshVertices(e.renderable.meshHandle, m);
        return e;
    }
    else {
        const e = createLine(start, end, color);
        const e2 = await EM.whenEntityHas(e, RenderableDef);
        _linePool.push(e2);
        return e2;
    }
}
export function createLine(start, end, color) {
    start = vec3.clone(start);
    const start2 = vec3.add(start, [0.2, 0.2, 0.2], vec3.create());
    end = vec3.clone(end);
    const end2 = vec3.add(end, [0.1, 0.1, 0.1], vec3.create());
    const pos = [start, start2, end2, end];
    const e = EM.new();
    EM.set(e, ColorDef, color);
    const m = {
        pos,
        tri: [],
        // TODO(@darzu): HACK
        quad: [vec4.clone([0, 1, 2, 3]), vec4.clone([3, 2, 1, 0])],
        colors: [color, color],
        // TODO(@darzu): use line rendering!
        // lines: [[0, 1]],
        surfaceIds: [1, 2],
        usesProvoking: true,
    };
    EM.set(e, RenderableConstructDef, m);
    EM.set(e, PositionDef);
    return e;
}
export async function drawBall(pos, size, color) {
    let res = await EM.whenResources(AssetsDef);
    const e = EM.new();
    EM.set(e, ColorDef, color);
    EM.set(e, RenderableConstructDef, res.assets.ball.proto);
    EM.set(e, PositionDef, pos);
    EM.set(e, ScaleDef, V(size, size, size));
    return e;
}
export async function randomizeMeshColors(e) {
    const res = await EM.whenResources(RendererDef);
    const e2 = await EM.whenEntityHas(e, RenderableDef);
    const meshH = e2.renderable.meshHandle;
    const mesh = meshH.mesh;
    for (let c of mesh.colors)
        vec3.set(Math.random(), Math.random(), Math.random(), c);
    res.renderer.renderer.stdPool.updateMeshVertices(meshH, mesh);
}
export function screenPosToWorldPos(out, screenPos, cameraView, screenDepth = 0) {
    const invViewProj = cameraView.invViewProjMat;
    const viewX = mathMap(screenPos[0], 0, cameraView.width, -1, 1);
    const viewY = mathMap(screenPos[1], 0, cameraView.height, 1, -1);
    const viewPos3 = vec3.set(viewX, viewY, screenDepth);
    return vec3.transformMat4(viewPos3, invViewProj, out);
}
export function screenPosToRay(screenPos, cameraView) {
    const origin = screenPosToWorldPos(vec3.create(), screenPos, cameraView, -1);
    const target = screenPosToWorldPos(tempVec3(), screenPos, cameraView, 0);
    const dir = vec3.sub(target, origin, vec3.create());
    vec3.normalize(dir, dir);
    const r = {
        org: origin,
        dir,
    };
    return r;
}
export function randColor(v) {
    return randNormalPosVec3(v);
}
//# sourceMappingURL=utils-game.js.map