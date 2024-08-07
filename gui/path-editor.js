import { ColorDef } from "../color-ecs.js";
import { EM } from "../entity-manager.js";
import { AssetsDef, gameMeshFromMesh } from "../game/assets.js";
import { vec2, vec3, vec4, quat, V } from "../sprig-matrix.js";
import { createIdxPool } from "../idx-pool.js";
import { rayVsRay } from "../physics/broadphase.js";
import { ColliderDef } from "../physics/collider.js";
import { WorldFrameDef } from "../physics/nonintersection.js";
import { PositionDef, ScaleDef, RotationDef } from "../physics/transform.js";
import { RenderableConstructDef, RendererDef, RenderableDef, } from "../render/renderer-ecs.js";
import { assert } from "../util.js";
import { randNormalPosVec3 } from "../utils-3d.js";
import { ButtonsStateDef, ButtonDef } from "./button.js";
import { WidgetDef, WidgetLayerDef } from "./widgets.js";
const HLineDef = EM.defineComponent("hline", (hl) => ({
    hl,
}));
export const PathEditorDef = EM.defineComponent("pathEditor", (pe) => pe);
// TODO(@darzu): this might be over engineered
const MAX_GLYPHS = 100;
const glyphPool = [];
const glyphPoolIdx = createIdxPool(MAX_GLYPHS);
async function createPathEditor() {
    let glyphs = new Map();
    // TODO(@darzu): lnMesh
    const res = {
        // interaction
        glyphs,
        // truth
        lnMesh: undefined,
        lns: undefined,
        // visual
        outMesh: undefined,
        outEnt: undefined,
        // swap truth
        setLineMesh,
        reset,
        // truth mutation
        positionVert,
    };
    const { renderer, assets } = await EM.whenResources(RendererDef, AssetsDef);
    return res;
    function reset() {
        for (let g of glyphs.values())
            hideGlyph(g);
        glyphs.clear();
        glyphPoolIdx.reset();
        res.lnMesh = undefined;
        res.lns = undefined;
        if (res.outEnt)
            res.outEnt.renderable.hidden = true;
    }
    function _generateOutMesh() {
        // TODO(@darzu):
        throw "todo";
    }
    async function setLineMesh(newLnMesh) {
        reset();
        const lns = linesAsList([], meshToHLines(newLnMesh));
        res.lns = lns;
        res.lnMesh = newLnMesh;
        const newOutMesh = _generateOutMesh();
        assert(!!res.outMesh === !!res.outEnt);
        if (!res.outEnt || !res.outMesh) {
            res.outMesh = newOutMesh;
            const reserve = {
                maxVertNum: 100,
                maxTriNum: 100,
                maxLineNum: 0,
            };
            const hpEnt_ = EM.new();
            EM.set(hpEnt_, RenderableConstructDef, res.outMesh, true, undefined, undefined, "std", false, reserve);
            EM.set(hpEnt_, PositionDef, V(0, 0.1, 0));
            // TODO(@darzu): make scale configurable
            // EM.ensureComponentOn(hpEnt_, ScaleDef, [5, 5, 5]);
            const hpEnt = await EM.whenEntityHas(hpEnt_, RenderableDef, WorldFrameDef);
            res.outEnt = hpEnt;
        }
        else {
            res.outEnt.renderable.hidden = false;
            // renderer.renderer.stdPool.updateMeshInstance(
            //   res.outEnt.renderable.meshHandle,
            //   handle
            // );
            // TODO(@darzu): IMPL copyMesh!!
            // copyMesh(res.outMesh, newOutMesh);
            // TODO(@darzu): move elsewhere
            renderer.renderer.stdPool.updateMeshQuads(res.outEnt.renderable.meshHandle, res.outMesh);
            renderer.renderer.stdPool.updateMeshTriangles(res.outEnt.renderable.meshHandle, res.outMesh);
            renderer.renderer.stdPool.updateMeshSize(res.outEnt.renderable.meshHandle, res.outMesh);
            renderer.renderer.stdPool.updateMeshVertices(res.outEnt.renderable.meshHandle, res.outMesh);
        }
        // vert glyphs
        for (let ln of res.lns) {
            nextGlyph(ln);
        }
    }
    function hideGlyph(g) {
        g.renderable.hidden = true;
        glyphs.delete(g.hline.hl.vi);
        // g.hvert.hv = undefined; // TODO(@darzu): FIX
        g.button.data = undefined;
    }
    function _createGlyph(gm) {
        // TODO(@darzu): de-duplicate
        const glyph_ = EM.new();
        EM.set(glyph_, RenderableConstructDef, gm.proto, false);
        EM.set(glyph_, ColorDef);
        EM.set(glyph_, PositionDef);
        EM.set(glyph_, RotationDef, quat.create());
        EM.set(glyph_, WidgetDef);
        EM.set(glyph_, ColliderDef, {
            shape: "AABB",
            solid: false,
            aabb: gm.aabb,
        });
        return glyph_;
    }
    async function nextGlyph(hl) {
        // TODO(@darzu): de-dupe
        const idx = glyphPoolIdx.next();
        assert(idx !== undefined, `out of glyphs`);
        if (!glyphPool[idx]) {
            // create if missing
            const glyph_ = _createGlyph(assets.he_octo);
            EM.set(glyph_, HLineDef, hl);
            EM.set(glyph_, ButtonDef, "glyph-vert");
            const glyph = await EM.whenEntityHas(glyph_, HLineDef, WidgetDef, ColorDef, PositionDef, RotationDef, RenderableDef, ButtonDef);
            // vertGlpyhs.set(v.vi, glyph);
            glyphPool[idx] = glyph;
        }
        const g = glyphPool[idx];
        // init once from pool
        g.renderable.enabled = true;
        g.renderable.hidden = false;
        g.hline.hl = hl;
        g.button.data = hl.vi;
        glyphs.set(hl.vi, g);
        // initial position
        // TODO(@darzu): need to think about how we position verts
        // console.dir(res);
        assert(res.lnMesh);
        const pos = vec3.copy(g.position, res.lnMesh.pos[hl.vi]);
        // TODO(@darzu): support world transforms
        // vec3.transformMat4(pos, pos, res.outEnt.world.transform);
        pos[1] = 0.2; // TODO(@darzu): this z-layering stuff is wierd
        return g;
    }
    function positionVert(hl) {
        // TODO(@darzu): fix IMPL!
        const glyph = glyphs.get(hl.vi);
        assert(glyph);
        assert(res.lnMesh);
        const vertPos = res.lnMesh.pos[hl.vi];
        // TODO(@darzu): PERF, expensive inverse
        // TODO(@darzu): doesn't account for parent translation
        // TODO(@darzu): should be done via parenting
        // const invTrans4 = mat4.invert(tempMat4(), res.outEnt.world.transform);
        // const invTrans3 = mat3.fromMat4(tempMat3(), invTrans4);
        // const posE = vec3.transformMat3(tempVec3(), glyph.position, invTrans3);
        const posE = glyph.position;
        vertPos[0] = posE[0];
        vertPos[2] = posE[2];
    }
}
export async function initPathEditor() {
    // TODO(@darzu):  only call if mesh editor hasn't initted widgets!
    // initWidgets();
    {
        const me = await createPathEditor();
        EM.addResource(PathEditorDef, me);
    }
    // TODO(@darzu): DBG only
    // pathEditor.setMesh(startMesh);
    // TODO(@darzu): undo-stack
    EM.registerSystem(null, [PathEditorDef, RendererDef, ButtonsStateDef, WidgetLayerDef], (_, { pathEditor: e, renderer, buttonsState, widgets }) => {
        let didUpdateMesh = false;
        let didEnlargeMesh = false;
        // const hedgesToMove = new Set<number>();
        if (!e.outEnt || !e.outMesh)
            return;
        // move verts
        for (let wi of widgets.moved) {
            const w = EM.findEntity(wi, [WidgetDef, HLineDef]);
            if (w) {
                e.positionVert(w.hline.hl);
                didUpdateMesh = true;
            }
        }
        // TODO(@darzu): impl for path ends
        // // click to extrude
        // // TODO(@darzu): move elsewhere?
        // const clickedHi = buttonsState.clickByKey["glyph-hedge"];
        // if (clickedHi !== undefined) {
        //   // console.log("hedge click!");
        //   const he = e.hedgeGlyphs.get(clickedHi);
        //   assert(he, `invalid click data: ${clickedHi}`);
        //   // quad extrude
        //   e.extrudeHEdge(he.hedge.he);
        //   didEnlargeMesh = true;
        // }
        // update mesh
        const handle = e.outEnt.renderable.meshHandle;
        if (didEnlargeMesh) {
            renderer.renderer.stdPool.updateMeshSize(handle, handle.mesh);
            if (handle.mesh.quad.length)
                renderer.renderer.stdPool.updateMeshQuads(handle, handle.mesh);
            if (handle.mesh.tri.length)
                renderer.renderer.stdPool.updateMeshTriangles(handle, handle.mesh);
        }
        if (didUpdateMesh || didEnlargeMesh) {
            renderer.renderer.stdPool.updateMeshVertices(handle, handle.mesh);
        }
    }, "editHPoly");
    EM.requireGameplaySystem("editHPoly");
}
function meshToHLines(m) {
    assert(m.lines.length);
    const linesByVi = new Map();
    m.lines.forEach(([v0, v1]) => {
        if (!linesByVi.has(v0))
            linesByVi.set(v0, { vi: v0 });
        if (!linesByVi.has(v1))
            linesByVi.set(v1, { vi: v1 });
    });
    m.lines.forEach(([v0, v1]) => {
        const ln0 = linesByVi.get(v0);
        const ln1 = linesByVi.get(v1);
        if (ln0)
            ln0.next = ln1;
        if (ln1)
            ln1.prev = ln0;
    });
    let first = linesByVi.get(m.lines[0][0]);
    while (first.prev)
        first = first.prev;
    return first;
}
// TODO(@darzu): rename
export async function lineStuff() {
    const lnMesh = {
        pos: [V(1, 0, 1), V(2, 0, 2), V(4, 0, 3), V(8, 0, 3), V(8, 0, 6)],
        tri: [],
        quad: [],
        lines: [
            vec2.clone([0, 1]),
            vec2.clone([3, 4]),
            vec2.clone([2, 3]),
            vec2.clone([1, 2]),
        ],
        colors: [],
    };
    const hline = meshToHLines(lnMesh);
    const lns = linesAsList([], hline);
    // console.log(lns);
    const width = 2.0;
    const pts = lns.map((ln) => getControlPoints(ln, width));
    // console.dir(pts);
    const extMesh = {
        pos: [],
        tri: [],
        quad: [],
        lines: [],
        colors: [],
        surfaceIds: [],
        usesProvoking: true,
    };
    pts.forEach(([a1, a2]) => {
        extMesh.pos.push(a1);
        extMesh.pos.push(a2);
    });
    for (let i = 1; i < pts.length; i++) {
        const pi = i * 2;
        const pA1 = pi - 2;
        const pA2 = pi - 1;
        const A1 = pi + 0;
        const A2 = pi + 1;
        extMesh.quad.push(vec4.clone([A1, pA1, pA2, A2]));
        extMesh.surfaceIds.push(i);
        extMesh.colors.push(randNormalPosVec3(vec3.create()));
    }
    const { renderer, assets } = await EM.whenResources(RendererDef, AssetsDef);
    const gmesh = gameMeshFromMesh(extMesh, renderer.renderer);
    const extEnt = EM.new();
    EM.set(extEnt, RenderableConstructDef, gmesh.proto);
    EM.set(extEnt, PositionDef, V(0, 0.5, 0));
    for (let ln of lns) {
        const vertGlyph = EM.new();
        EM.set(vertGlyph, RenderableConstructDef, assets.cube.proto);
        EM.set(vertGlyph, PositionDef, vec3.clone(lnMesh.pos[ln.vi]));
        EM.set(vertGlyph, ColorDef, V(0.1, 0.2 + ln.vi * 0.1, 0.1));
        EM.set(vertGlyph, ScaleDef, V(0.2, 0.2, 0.2));
        vertGlyph.position[1] = 0.5;
    }
    function getControlPoints(ln, width) {
        const A = lnMesh.pos[ln.vi];
        if (!ln.next || !ln.prev) {
            // end cap
            const A1 = vec3.create();
            const A2 = vec3.create();
            const Oln = ln.next ?? ln.prev;
            const O = Oln ? lnMesh.pos[Oln.vi] : vec3.add(A, [1, 0, 0]);
            const dir = vec3.sub(O, A);
            if (!ln.next && ln.prev)
                vec3.negate(dir, dir);
            vec3.normalize(dir, dir);
            const perp = vec3.cross(dir, [0, 1, 0]);
            // TODO(@darzu): this is right for end caps, not the mids!!
            // TODO(@darzu): this is right for end caps, not the mids!!
            vec3.sub(A, vec3.scale(perp, width), A1);
            vec3.add(A, vec3.scale(perp, width), A2);
            return [A1, A2];
        }
        else {
            // mid point
            const P = lnMesh.pos[ln.prev.vi];
            const PAdir = vec3.sub(A, P);
            vec3.normalize(PAdir, PAdir);
            const PAperp = vec3.cross(PAdir, [0, 1, 0]);
            const P1 = vec3.sub(A, vec3.scale(PAperp, width));
            vec3.sub(P1, vec3.scale(PAdir, width * 3), P1);
            const P2 = vec3.add(A, vec3.scale(PAperp, width));
            vec3.sub(P2, vec3.scale(PAdir, width * 3), P2);
            const N = lnMesh.pos[ln.next.vi];
            const NAdir = vec3.sub(A, N);
            vec3.normalize(NAdir, NAdir);
            const NAperp = vec3.cross(NAdir, [0, 1, 0]);
            const N1 = vec3.sub(A, vec3.scale(NAperp, width));
            vec3.sub(N1, vec3.scale(NAdir, width * 3), N1);
            const N2 = vec3.add(A, vec3.scale(NAperp, width));
            vec3.sub(N2, vec3.scale(NAdir, width * 3), N2);
            const A1 = rayVsRay({
                org: P1,
                dir: PAdir,
            }, {
                org: N2,
                dir: NAdir,
            });
            assert(A1, `P1 vs N2 failed`);
            const A2 = rayVsRay({
                org: P2,
                dir: PAdir,
            }, {
                org: N1,
                dir: NAdir,
            });
            assert(A2, `P2 vs N1 failed`);
            return [A1, A2];
        }
    }
    // const points: vec2[] = [];
    // let prevA1: vec2;
    // let prevA2: vec2;
    // for (let i = -1; i < points.length; i++) {
    //   const A = points[i];
    //   const B = points[i + 1];
    //   if (!A && B) {
    //     // start cap
    //     // const A1 =
    //   } else if (A && B) {
    //     // mid section
    //   } else if (A && !B) {
    //     // end cap
    //   } else {
    //     assert(false, "should be unreachable");
    //   }
    // }
}
function linesAsList(acc, curr) {
    if (!curr)
        return acc;
    if (!acc.length && curr.prev)
        return linesAsList(acc, curr.prev);
    acc.push(curr);
    return linesAsList(acc, curr.next);
}
//# sourceMappingURL=path-editor.js.map