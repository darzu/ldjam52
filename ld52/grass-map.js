import { EM } from "../entity-manager.js";
import { CY } from "../render/gpu-registry.js";
import { RendererDef } from "../render/renderer-ecs.js";
import { assert } from "../util.js";
import { MapsDef } from "./map-loader.js";
import { ScoreDef } from "./score.js";
// yikes on bikes
const GREEN = 4278253824;
const PURPLE = 4287898003;
const RED = 4294911488;
const WIDTH = 1024;
const HEIGHT = 1024;
export const GrassMapTexPtr = CY.createTexture("grassMap", {
    size: [WIDTH, HEIGHT],
    format: "r32float",
});
export const GrassMapDef = EM.defineComponent("grassMap", (name, map) => ({
    name,
    map,
}));
export async function setMap(em, name) {
    const res = await em.whenResources(MapsDef, RendererDef, ScoreDef);
    let buf = res.maps[name].bytes;
    // yikes
    buf = buf.slice(0x8a);
    const view = new Uint32Array(buf);
    assert(view.length === WIDTH * HEIGHT, "map has bad size");
    const texBuf = new Float32Array(WIDTH * HEIGHT);
    let totalPurple = 0;
    view.reverse().forEach((v, i) => {
        if (i % WIDTH === 0 ||
            i % WIDTH === WIDTH - 1 ||
            i < WIDTH ||
            WIDTH * (HEIGHT - 1) < i) {
            texBuf[i] = 0.5;
            return;
        }
        switch (v) {
            case GREEN:
                texBuf[i] = 0.0;
                break;
            case PURPLE:
                texBuf[i] = 1.0;
                totalPurple++;
                break;
            case RED:
                texBuf[i] = 0.5;
                break;
            default:
                texBuf[i] = 0.0;
                break;
        }
    });
    const texResource = res.renderer.renderer.getCyResource(GrassMapTexPtr);
    texResource.queueUpdate(texBuf);
    const grassMap = em.ensureResource(GrassMapDef, name, texBuf);
    res.score.totalPurple = totalPurple;
    res.score.cutPurple = 0;
    grassMap.map = texBuf;
    grassMap.name = name;
}
//# sourceMappingURL=grass-map.js.map