import { EM } from "../entity-manager.js";
import { onInit } from "../init.js";
import { assert } from "../util.js";
const DEFAULT_MAP_PATH = "maps/";
export const MapPaths = [
    "map1",
    "map2",
    "map3",
    "map4",
    "map_maze",
    "map_narrow",
];
const MapLoaderDef = EM.defineComponent("mapLoader", () => {
    return {
        promise: null,
    };
});
export const MapsDef = EM.defineComponent("maps", (maps) => maps);
async function loadMaps() {
    const mapPromises = MapPaths.map(async (name) => {
        const path = `${DEFAULT_MAP_PATH}${name}.png`;
        // return getBytes(path);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = path;
            img.onload = function (e) {
                // TODO(@darzu): move to webget.ts
                // create in-memory canvas to grab the image data (wierd)
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0);
                const imgData = context.getImageData(0, 0, img.width, img.height);
                resolve(imgData.data);
            };
        });
    });
    const maps = await Promise.all(mapPromises);
    const set = {};
    for (let i = 0; i < MapPaths.length; i++) {
        set[MapPaths[i]] = {
            bytes: maps[i],
        };
    }
    return set;
}
onInit(async (em) => {
    em.addResource(MapLoaderDef);
    // start loading of maps
    const { mapLoader } = await em.whenResources(MapLoaderDef);
    assert(!mapLoader.promise, "somehow we're double loading maps");
    const mapsPromise = loadMaps();
    mapLoader.promise = mapsPromise;
    mapsPromise.then((result) => {
        em.addResource(MapsDef, result);
    }, (failureReason) => {
        // TODO(@darzu): fail more gracefully
        throw `Failed to load maps: ${failureReason}`;
    });
});
//# sourceMappingURL=map-loader.js.map