import { EM } from "../entity-manager.js";
import { onInit } from "../init.js";
import { assert } from "../util.js";
import { getBytes } from "../webget.js";
const DEFAULT_MAP_PATH = "maps/";
export const MapPaths = ["map1", "map2"];
const MapLoaderDef = EM.defineComponent("mapLoader", () => {
    return {
        promise: null,
    };
});
export const MapsDef = EM.defineComponent("maps", (maps) => maps);
async function loadMaps() {
    const mapPromises = MapPaths.map((name) => getBytes(`${DEFAULT_MAP_PATH}${name}.bmp`));
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