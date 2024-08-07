import { CameraFollowDef } from "./camera.js";
import { EM } from "./entity-manager.js";
import { PositionDef, RotationDef } from "./physics/transform.js";
import { vec3Dbg, vec4Dbg } from "./utils-3d.js";
// meshHandle,time,netTimer,physicsTimer,inputs,collider,motion,inWorld,finished,sync,
// peer,host,authority,deleted,me,inbox,outbox,netStats,eventsFromNetwork,
// eventsToNetwork,networkReady,join,bullet,bulletConstruct,cubeConstruct,player,
// playerProps,camera,transform,motionSmoothing,parent,renderable,cameraView,
// physicsResults,_phys,enemyShip,enemyShipConstruct,detectedEvents,requestedEvents,events,
// groundConstruct,shipConstruct,hatConstruct,color,hat
const dbgEnts = new Map();
let dbgEntSingleton = { id: 0, _cmps: () => [] };
const dbgCmpsAllById = new Map();
const dbgCmpsAllByName = new Map();
let dbgCmpsAllByAbv = new Map();
const dbgCmps = new Map();
const dbgCmpsSingleton = new Map();
function mkDbgCmp(id) {
    // if (dbgCmpsAllById.has(id)) return dbgCmpsAllById.get(id)!;
    const c = EM.components.get(id);
    if (!c)
        throw `No component by id ${id}`;
    const dc = Object.assign(c, { abv: c.name });
    // dbgCmpsAllById.set(id, dc);
    // dbgCmps.set(dc.name, dc);
    return dc;
}
function mkDbgEnt(id) {
    // if (dbgEnts.has(id)) return dbgEnts.get(id)!;
    const e = EM.entities.get(id);
    if (!e)
        throw `No entity by id ${id}`;
    const _cmps = () => {
        const res = [];
        for (let p of Object.keys(e)) {
            const c = (id === 0 ? dbgCmpsSingleton : dbgCmps).get(p);
            if (c)
                res.push(c);
        }
        return res;
    };
    const _addSync = (nickname) => {
        if ("sync" in e) {
            const c = cmpByName(nickname);
            if (c)
                e.sync.dynamicComponents.push(c.id);
        }
    };
    const de = Object.assign(e, { _cmps, _addSync });
    // if (id === 0) dbgEntSingleton = de;
    // else dbgEnts.set(id, de);
    return de;
}
function sortByName(ls, n) {
    ls.sort((a, b) => {
        const aNm = a[n].toUpperCase();
        const bNm = b[n].toUpperCase();
        if (aNm < bNm)
            return -1;
        if (aNm > bNm)
            return 1;
        return 0;
    });
}
function createAbvs(named) {
    // sort first for more stable output
    sortByName(named, "name");
    // split names into parts
    const allParts = named.map((s) => wordParts(s.name));
    const firstParts = allParts.map((ps) => ps[0]).filter((p) => !!p);
    const latterParts = allParts
        .map((ps) => ps.slice(1))
        .filter((p) => !!p && p.length)
        .reduce((p, n) => [...p, ...n], []);
    // for each part, find an abv
    const strToAbv = new Map();
    const abvToStr = new Map();
    firstParts.forEach((s) => findNewAbv(s, 3));
    latterParts.forEach((s) => findNewAbv(s, 1));
    // build map from abv to N
    const res = new Map();
    named.forEach((n, i) => {
        const ps = allParts[i];
        const abvs = ps.map((p) => strToAbv.get(p));
        const abv = abvs.join("");
        res.set(abv, n);
    });
    return res;
    function findNewAbv(s, preferedLen) {
        if (strToAbv.has(s))
            return; // already have one
        if (s.length <= preferedLen) {
            // we're as short as we can get
            abvToStr.set(s, s);
            strToAbv.set(s, s);
            return;
        }
        const abv = s.substr(0, preferedLen);
        if (!abvToStr.has(abv)) {
            // not taken
            abvToStr.set(abv, s);
            strToAbv.set(s, abv);
        }
        else {
            // abreviation taken
            const other = abvToStr.get(abv);
            // undo other
            abvToStr.delete(abv);
            strToAbv.delete(other);
            // find a new for other
            findNewAbv(other, preferedLen + 1);
            // find a new abv for this
            findNewAbv(s, preferedLen + 1);
        }
    }
    function wordParts(s) {
        // assume camel case
        const parts = [];
        let next = "";
        for (let i = 0; i < s.length; i++) {
            const c = s.charAt(i);
            if (isUpper(c)) {
                // new part
                parts.push(next);
                next = "";
            }
            next += c;
        }
        parts.push(next);
        return parts.filter((p) => !!p);
    }
    function isUpper(s) {
        return "A" <= s && s <= "Z";
    }
}
function updateCmps() {
    dbgEntSingleton = mkDbgEnt(0);
    if (EM.components.size !== dbgCmpsAllById.size) {
        dbgCmpsAllById.clear();
        dbgCmps.clear();
        dbgCmpsSingleton.clear();
        for (let id of EM.components.keys()) {
            const dc = mkDbgCmp(id);
            dbgCmpsAllById.set(id, dc);
            dbgCmpsAllByName.set(dc.name, dc);
            if (dc.name in dbgEntSingleton)
                dbgCmpsSingleton.set(dc.name, dc);
            else
                dbgCmps.set(dc.name, dc);
        }
        dbgCmpsAllByAbv = createAbvs([...dbgCmpsAllById.values()]);
        for (let [abv, c] of dbgCmpsAllByAbv)
            c.abv = abv;
    }
}
function updateEnts() {
    dbgEntSingleton = mkDbgEnt(0);
    if (dbgEnts.size + 1 !== EM.entities.size) {
        dbgEnts.clear();
        for (let id of EM.entities.keys()) {
            if (id === 0)
                continue;
            dbgEnts.set(id, mkDbgEnt(id));
        }
    }
}
function filterEnts(...cmpNames) {
    return EM.dbgFilterEntitiesByKey(cmpNames);
}
function cmpByName(name) {
    let res = dbgCmps.get(name) ?? dbgCmpsAllByAbv.get(name);
    if (!res)
        updateCmps();
    res = dbgCmps.get(name) ?? dbgCmpsAllByAbv.get(name);
    if (!res)
        // TODO(@darzu): fuzzy match?
        return null;
    return res;
}
export const dbg = {
    saveCamera: () => {
        const targets = EM.filterEntities([
            CameraFollowDef,
            RotationDef,
            PositionDef,
        ]);
        const target = targets.reduce((p, n) => (n.cameraFollow.priority > p.cameraFollow.priority ? n : p), targets[0]);
        if (!target) {
            console.error(`no target!`);
            return;
        }
        console.log(`
vec3.copy(g.position, ${vec3Dbg(target.position)});
quat.copy(g.rotation, ${vec4Dbg(target.rotation)});
vec3.copy(g.cameraFollow.positionOffset, ${vec3Dbg(target.cameraFollow.positionOffset)});
g.cameraFollow.yawOffset = ${target.cameraFollow.yawOffset.toFixed(3)};
g.cameraFollow.pitchOffset = ${target.cameraFollow.pitchOffset.toFixed(3)};
    `);
    },
    listCmps: () => {
        updateCmps();
        const cmps = [...dbgCmps.values(), ...dbgCmpsSingleton.values()];
        sortByName(cmps, "name");
        const cStr = cmps.map((c) => `${c.name}\t(${c.abv}, ${c.id})`).join("\n");
        console.table(cStr);
    },
    listEnts: (...cs) => {
        updateEnts();
        updateCmps();
        const es = [...dbgEnts.values()].filter((e) => cs.every((c) => c in e || (dbgCmpsAllByAbv.get(c)?.name ?? "INVALID") in e));
        const eTable = es.map((e) => {
            const res = { id: e.id };
            for (let c of e._cmps()) {
                res[c.abv] = e[c.name];
            }
            return res;
        });
        // console.log(eStr);
        console.table(eTable);
        return es;
    },
    ent0: () => {
        updateEnts();
        return dbgEntSingleton;
    },
    ent: (id) => {
        return mkDbgEnt(id);
    },
    cmp: (name) => {
        return cmpByName(name);
    },
    summarizeStats: () => {
        let stats = EM.sysStats;
        let totalQueryTime = Object.values(stats)
            .map((s) => s.queryTime)
            .reduce((x, y) => x + y);
        let totalCallTime = Object.values(stats)
            .map((s) => s.callTime)
            .reduce((x, y) => x + y);
        let totalTime = totalQueryTime + totalCallTime;
        let callTimes = [];
        for (let s of Object.keys(stats)) {
            callTimes.push({ s, t: stats[s].callTime, m: stats[s].maxCallTime });
        }
        callTimes.push({ s: "ALL QUERIES", t: totalQueryTime, m: -1 });
        callTimes.sort((x, y) => y.t - x.t);
        let out = "";
        for (let { s, t, m } of callTimes) {
            out +=
                s +
                    ": " +
                    ((t * 100) / totalTime).toFixed(1) +
                    "%" +
                    " (" +
                    (t / EM.dbgLoops).toFixed(2) +
                    "ms, max:" +
                    m.toFixed(1) +
                    "ms)" +
                    "\n";
        }
        out += "\n";
        out += "time per frame: " + (totalTime / EM.dbgLoops).toFixed(3) + "ms";
        console.log(out);
    },
};
//# sourceMappingURL=debugger.js.map