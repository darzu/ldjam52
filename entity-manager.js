import { createLabelSolver } from "./em-labels.js";
import { DBG_ASSERT, DBG_INIT_DEPS, DBG_TRYCALLSYSTEM } from "./flags.js";
import { assert, assertDbg, hashCode } from "./util.js";
function nameToId(name) {
    return hashCode(name);
}
// TODO(@darzu): Instead of having one big EM class,
//    we should seperate out all seperable concerns,
//    and then just | them together as the top-level
//    thing. Maybe even use the "$" symbol?! (probs not)
export class EntityManager {
    constructor() {
        this.entities = new Map();
        this.systems = new Map();
        this.systemsById = new Map();
        this.entityPromises = new Map();
        this.components = new Map();
        this.serializers = new Map();
        this.ranges = {};
        this.defaultRange = "";
        this.sysStats = {};
        this.globalStats = {
            // time spent maintaining the query caches
            queryCacheTime: 0, // TODO(@darzu): IMPL
        };
        // TODO(@darzu): move elsewhere
        this.dbgLoops = 0;
        // TODO(@darzu): PERF. maybe the entities list should be maintained sorted. That
        //    would make certain scan operations (like updating them on component add/remove)
        //    cheaper. And perhaps better gameplay code too.
        this._systemsToEntities = new Map();
        // NOTE: _entitiesToSystems is only needed because of DeadDef
        this._entitiesToSystems = new Map();
        this._systemsToComponents = new Map();
        this._componentToSystems = new Map();
        this.labelSolver = createLabelSolver();
        this._dbgLastVersion = -1;
        // initFns: InitFNReg<any>[] = [];
        this.initFnsByResource = new Map();
        this.initFnHasStarted = new Set();
        // TODO(@darzu): IMPL?
        // pendingResources: Map<string, Promise<ComponentDef<any>>> = new Map();
        this._nextInitFnId = 1;
        this._nextSystemId = 1;
        // TODO(@darzu): use version numbers instead of dirty flag?
        this._changedEntities = new Set();
        this.ent0 = { id: 0 };
        this.entities.set(0, this.ent0);
        // TODO(@darzu): maintain _entitiesToSystems for ent 0?
    }
    defineComponent(name, construct) {
        const id = nameToId(name);
        if (this.components.has(id)) {
            throw `Component with name ${name} already defined--hash collision?`;
        }
        const component = {
            name,
            construct,
            id,
            isOn: (e) => name in e,
        };
        this.components.set(id, component);
        return component;
    }
    checkComponent(def) {
        if (!this.components.has(def.id))
            throw `Component ${def.name} (id ${def.id}) not found`;
        if (this.components.get(def.id).name !== def.name)
            throw `Component id ${def.id} has name ${this.components.get(def.id).name}, not ${def.name}`;
    }
    registerSerializerPair(def, serialize, deserialize) {
        this.serializers.set(def.id, { serialize, deserialize });
    }
    serialize(id, componentId, buf) {
        const def = this.components.get(componentId);
        if (!def)
            throw `Trying to serialize unknown component id ${componentId}`;
        const entity = this.findEntity(id, [def]);
        if (!entity)
            throw `Trying to serialize component ${def.name} on entity ${id}, which doesn't have it`;
        const serializerPair = this.serializers.get(componentId);
        if (!serializerPair)
            throw `No serializer for component ${def.name} (for entity ${id})`;
        serializerPair.serialize(entity[def.name], buf);
    }
    deserialize(id, componentId, buf) {
        const def = this.components.get(componentId);
        if (!def)
            throw `Trying to deserialize unknown component id ${componentId}`;
        if (!this.hasEntity(id)) {
            throw `Trying to deserialize component ${def.name} of unknown entity ${id}`;
        }
        let entity = this.findEntity(id, [def]);
        let component;
        // TODO: because of this usage of dummy, deserializers don't
        // actually need to read buf.dummy
        if (buf.dummy) {
            component = {};
        }
        else if (!entity) {
            component = this.addComponent(id, def);
        }
        else {
            component = entity[def.name];
        }
        const serializerPair = this.serializers.get(componentId);
        if (!serializerPair)
            throw `No deserializer for component ${def.name} (for entity ${id})`;
        serializerPair.deserialize(component, buf);
    }
    setDefaultRange(rangeName) {
        this.defaultRange = rangeName;
    }
    setIdRange(rangeName, nextId, maxId) {
        this.ranges[rangeName] = { nextId, maxId };
    }
    // TODO(@darzu): dont return the entity!
    new(rangeName) {
        if (rangeName === undefined)
            rangeName = this.defaultRange;
        const range = this.ranges[rangeName];
        if (!range) {
            throw `Entity manager has no ID range (range specifier is ${rangeName})`;
        }
        if (range.nextId >= range.maxId)
            throw `EntityManager has exceeded its id range!`;
        const e = { id: range.nextId++ };
        if (e.id > 2 ** 15)
            console.warn(`We're halfway through our local entity ID space! Physics assumes IDs are < 2^16`);
        this.entities.set(e.id, e);
        this._entitiesToSystems.set(e.id, []);
        return e;
    }
    registerEntity(id) {
        assert(!this.entities.has(id), `EntityManager already has id ${id}!`);
        /* TODO: should we do the check below but for all ranges?
        if (this.nextId <= id && id < this.maxId)
        throw `EntityManager cannot register foreign ids inside its local range; ${this.nextId} <= ${id} && ${id} < ${this.maxId}!`;
        */
        const e = { id: id };
        this.entities.set(e.id, e);
        this._entitiesToSystems.set(e.id, []);
        return e;
    }
    // TODO(@darzu): hacky, special components
    isDeletedE(e) {
        return "deleted" in e;
    }
    isDeadE(e) {
        return "dead" in e;
    }
    isDeadC(e) {
        return "dead" === e.name;
    }
    addComponent(id, def, ...args) {
        this.checkComponent(def);
        if (id === 0)
            throw `hey, use addResource!`;
        const c = def.construct(...args);
        const e = this.entities.get(id);
        // TODO: this is hacky--EM shouldn't know about "deleted"
        if (DBG_ASSERT && this.isDeletedE(e)) {
            console.error(`Trying to add component ${def.name} to deleted entity ${id}`);
        }
        if (def.name in e)
            throw `double defining component ${def.name} on ${e.id}!`;
        e[def.name] = c;
        // update query caches
        // TODO(@darzu): PERF. need to measure time spent maintaining these caches.
        const eSystems = this._entitiesToSystems.get(e.id);
        if (this.isDeadC(def)) {
            // remove from every current system
            eSystems.forEach((s) => {
                const es = this._systemsToEntities.get(s);
                // TODO(@darzu): perf. sorted removal
                const indx = es.findIndex((v) => v.id === id);
                if (indx >= 0)
                    es.splice(indx, 1);
            });
            eSystems.length = 0;
        }
        const systems = this._componentToSystems.get(def.name);
        for (let sysId of systems ?? []) {
            const allNeededCs = this._systemsToComponents.get(sysId);
            if (allNeededCs?.every((n) => n in e)) {
                // TODO(@darzu): perf. sorted insert
                this._systemsToEntities.get(sysId).push(e);
                eSystems.push(sysId);
            }
        }
        // track changes for entity promises
        // TODO(@darzu): PERF. maybe move all the system query update stuff to use this too?
        this._changedEntities.add(e.id);
        return c;
    }
    addComponentByName(id, name, ...args) {
        console.log("addComponentByName called, should only be called for debugging");
        let component = this.components.get(nameToId(name));
        if (!component) {
            throw `no component named ${name}`;
        }
        return this.addComponent(id, component, ...args);
    }
    ensureComponent(id, def, ...args) {
        this.checkComponent(def);
        const e = this.entities.get(id);
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            return this.addComponent(id, def, ...args);
        }
        else {
            return e[def.name];
        }
    }
    // TODO(@darzu): do we want to make this the standard way we do ensureComponent and addComponent ?
    // TODO(@darzu): rename to "set" and have "maybeSet" w/ a thunk as a way to short circuit unnecessary init?
    //      and maybe "strictSet" as the version that throws if it exists (renamed from "addComponent")
    set(e, def, ...args) {
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            this.addComponent(e.id, def, ...args);
        }
    }
    addResource(def, ...args) {
        this.checkComponent(def);
        const c = def.construct(...args);
        const e = this.ent0;
        if (def.name in e)
            throw `double defining singleton component ${def.name} on ${e.id}!`;
        e[def.name] = c;
        this._changedEntities.add(0); // TODO(@darzu): seperate Resources from Entities
        this.labelSolver.addResource(def);
        return c;
    }
    ensureResource(def, ...args) {
        this.checkComponent(def);
        const e = this.ent0;
        const alreadyHas = def.name in e;
        if (!alreadyHas) {
            return this.addResource(def, ...args);
        }
        else {
            return e[def.name];
        }
    }
    removeResource(def) {
        const e = this.ent0;
        if (def.name in e) {
            delete e[def.name];
        }
        else {
            throw `Tried to remove absent singleton component ${def.name}`;
        }
    }
    // TODO(@darzu): should this be public??
    // TODO(@darzu): rename to findResource
    getResource(c) {
        const e = this.ent0;
        if (c.name in e) {
            return e[c.name];
        }
        return undefined;
    }
    getResources(rs) {
        const e = this.ent0;
        if (rs.every((r) => r.name in e))
            return e;
        return undefined;
    }
    // TODO(@darzu): rename these to "requireSystem" or somethingE
    // _dbgOldPlan: string[] = []; // TODO(@darzu): REMOVE
    // TODO(@darzu): this makes no sense so what should this represent?
    maybeRequireSystem(name) {
        this.addConstraint(["requires", name]);
        // this._dbgOldPlan.push(name); // TODO(@darzu): DBG
        return true;
    }
    requireSystem(name) {
        this.addConstraint(["requires", name]);
        // this._dbgOldPlan.push(name); // TODO(@darzu): DBG
    }
    // TODO(@darzu): legacy thing; gotta replace with labels/phases
    requireGameplaySystem(name) {
        this.addConstraint(["requires", name]);
    }
    addConstraint(con) {
        this.labelSolver.addConstraint(con);
    }
    callSystems() {
        // TODO(@darzu):
        // console.log("OLD PLAN:");
        // console.log(this._tempPlan);
        if (DBG_INIT_DEPS)
            if (this._dbgLastVersion !== this.labelSolver.getVersion()) {
                this._dbgLastVersion = this.labelSolver.getVersion();
                console.log("NEW PLAN:");
                console.log(this.labelSolver.getPlan());
            }
        const plan = this.labelSolver.getPlan();
        // const plan = this._tempPlan;
        for (let s of plan) {
            this._tryCallSystem(s);
        }
        // this._dbgOldPlan.length = 0;
        // if (this.dbgLoops > 100) throw "STOP";
    }
    hasEntity(id) {
        return this.entities.has(id);
    }
    removeComponent(id, def) {
        if (!this.tryRemoveComponent(id, def))
            throw `Tried to remove absent component ${def.name} from entity ${id}`;
    }
    tryRemoveComponent(id, def) {
        const e = this.entities.get(id);
        if (def.name in e) {
            delete e[def.name];
        }
        else {
            return false;
        }
        // update query cache
        const systems = this._componentToSystems.get(def.name);
        for (let name of systems ?? []) {
            const es = this._systemsToEntities.get(name);
            if (es) {
                // TODO(@darzu): perf. sorted removal
                const indx = es.findIndex((v) => v.id === id);
                if (indx >= 0) {
                    es.splice(indx, 1);
                }
            }
        }
        if (this.isDeadC(def)) {
            const eSystems = this._entitiesToSystems.get(id);
            eSystems.length = 0;
            for (let sysId of this.systemsById.keys()) {
                const allNeededCs = this._systemsToComponents.get(sysId);
                if (allNeededCs?.every((n) => n in e)) {
                    // TODO(@darzu): perf. sorted insert
                    this._systemsToEntities.get(sysId).push(e);
                    eSystems.push(sysId);
                }
            }
        }
        return true;
    }
    keepOnlyComponents(id, cs) {
        let ent = this.entities.get(id);
        if (!ent)
            throw `Tried to delete non-existent entity ${id}`;
        for (let component of this.components.values()) {
            if (!cs.includes(component) && ent[component.name]) {
                this.removeComponent(id, component);
            }
        }
    }
    hasComponents(e, cs) {
        return cs.every((c) => c.name in e);
    }
    findEntity(id, cs) {
        const e = this.entities.get(id);
        if (!e || !cs.every((c) => c.name in e)) {
            return undefined;
        }
        return e;
    }
    findEntitySet(es) {
        const res = [];
        for (let [id, ...cs] of es) {
            res.push(this.findEntity(id, cs));
        }
        return res;
    }
    // TODO(@darzu): PERF. cache these responses like we do systems?
    // TODO(@darzu): PERF. evaluate all per-frame uses of this
    filterEntities(cs) {
        const res = [];
        if (cs === null)
            return res;
        const inclDead = cs.some((c) => this.isDeadC(c)); // TODO(@darzu): HACK? for DeadDef
        for (let e of this.entities.values()) {
            if (!inclDead && this.isDeadE(e))
                continue;
            if (e.id === 0)
                continue; // TODO(@darzu): Remove ent 0, make first-class Resources
            if (cs.every((c) => c.name in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    dbgFilterEntitiesByKey(cs) {
        // TODO(@darzu): respect "DeadDef" comp ?
        console.log("filterEntitiesByKey called--should only be called from console");
        const res = [];
        if (typeof cs === "string")
            cs = [cs];
        for (let e of this.entities.values()) {
            if (cs.every((c) => c in e)) {
                res.push(e);
            }
            else {
                // TODO(@darzu): easier way to help identify these errors?
                // console.log(
                //   `${e.id} is missing ${cs
                //     .filter((c) => !(c.name in e))
                //     .map((c) => c.name)
                //     .join(".")}`
                // );
            }
        }
        return res;
    }
    // TODO(@darzu): instead of "name", system should havel "labelConstraints"
    registerInit(reg) {
        // TODO(@darzu):
        // throw "TODO";
        if (DBG_INIT_DEPS)
            console.log(`registerInit: ${reg.provideRs.map((p) => p.name).join(",")}`);
        // console.dir(opts);
        const regWId = {
            ...reg,
            id: this._nextInitFnId++,
        };
        // this.initFns.push(reg);
        for (let p of reg.provideRs) {
            assert(!this.initFnsByResource.has(p.name), `Resource: '${p.name}' already has an init fn!`);
            this.initFnsByResource.set(p.name, regWId);
        }
    }
    registerSystem(cs, rs, callback, name) {
        name = name || callback.name;
        if (name === "") {
            throw new Error(`To define a system with an anonymous function, pass an explicit name`);
        }
        if (this.systems.has(name))
            throw `System named ${name} already defined. Try explicitly passing a name`;
        const id = this._nextSystemId;
        this._nextSystemId += 1;
        const sys = {
            cs,
            rs,
            callback,
            name,
            id,
        };
        this.systems.set(name, sys);
        this.systemsById.set(id, sys);
        this.sysStats[name] = {
            calls: 0,
            queries: 0,
            callTime: 0,
            maxCallTime: 0,
            queryTime: 0,
        };
        // update query cache:
        //  pre-compute entities for this system for quicker queries; these caches will be maintained
        //  by add/remove/ensure component calls
        // TODO(@darzu): ability to toggle this optimization on/off for better debugging
        const es = this.filterEntities(cs);
        this._systemsToEntities.set(id, [...es]);
        if (cs) {
            for (let c of cs) {
                if (!this._componentToSystems.has(c.name))
                    this._componentToSystems.set(c.name, [id]);
                else
                    this._componentToSystems.get(c.name).push(id);
            }
            this._systemsToComponents.set(id, cs.map((c) => c.name));
        }
        for (let e of es) {
            const ss = this._entitiesToSystems.get(e.id);
            assertDbg(ss);
            ss.push(id);
        }
    }
    whenResources(...rs) {
        return this.whenEntityHas(this.ent0, ...rs);
    }
    hasSystem(name) {
        return this.systems.has(name);
    }
    _tryCallSystem(name) {
        // TODO(@darzu):
        // if (name.endsWith("Build")) console.log(`calling ${name}`);
        // if (name == "groundPropsBuild") console.log("calling groundPropsBuild");
        const s = this.systems.get(name);
        if (!s) {
            if (DBG_TRYCALLSYSTEM)
                console.warn(`Can't (yet) find system with name: ${name}`);
            return false;
        }
        let start = performance.now();
        // try looking up in the query cache
        let es;
        if (s.cs) {
            assertDbg(this._systemsToEntities.has(s.id), `System ${s.name} doesn't have a query cache!`);
            es = this._systemsToEntities.get(s.id);
        }
        else {
            es = [];
        }
        // TODO(@darzu): uncomment to debug query cache issues
        // es = this.filterEntities(s.cs);
        const rs = this.getResources(s.rs); // TODO(@darzu): remove allocs here
        let afterQuery = performance.now();
        this.sysStats[s.name].queries++;
        this.sysStats[s.name].queryTime += afterQuery - start;
        if (rs) {
            // we have the resources
            s.callback(es, rs);
            let afterCall = performance.now();
            this.sysStats[s.name].calls++;
            const thisCallTime = afterCall - afterQuery;
            this.sysStats[s.name].callTime += thisCallTime;
            this.sysStats[s.name].maxCallTime = Math.max(this.sysStats[s.name].maxCallTime, thisCallTime);
        }
        else {
            // we don't yet have the resources, check if we can init any
            this.startInitFnsFor(s.rs);
        }
        return true;
    }
    _callSystem(name) {
        if (!this.maybeRequireSystem(name))
            throw `No system named ${name}`;
    }
    // _dbgFirstXFrames = 10;
    // dbgStrEntityPromises() {
    //   let res = "";
    //   res += `changed ents: ${[...this._changedEntities.values()].join(",")}\n`;
    //   this.entityPromises.forEach((promises, id) => {
    //     for (let s of promises) {
    //       const unmet = s.cs.filter((c) => !c.isOn(s.e)).map((c) => c.name);
    //       res += `#${id} is waiting for ${unmet.join(",")}\n`;
    //     }
    //   });
    //   return res;
    // }
    startInitFnsFor(cs) {
        for (let c of cs) {
            if (!c.isOn(this.ent0) && this.initFnsByResource.has(c.name)) {
                // bookkeeping
                const initFn = this.initFnsByResource.get(c.name);
                this.initFnsByResource.delete(c.name);
                if (this.initFnHasStarted.has(initFn.id))
                    continue;
                this.initFnHasStarted.add(initFn.id);
                // enqueue init fn
                if (DBG_INIT_DEPS)
                    console.log(`enqueuing init fn for: ${c.name}`);
                this.whenResources(...initFn.requireRs).then(async (res) => {
                    await initFn.fn(res);
                    // check that the init fn fullfilled its contract
                    assert(c.isOn(this.ent0), `Init fn failed to provide: ${c.name}`);
                });
            }
        }
    }
    checkEntityPromises() {
        // console.dir(this.entityPromises);
        // console.log(this.dbgStrEntityPromises());
        // this._dbgFirstXFrames--;
        // if (this._dbgFirstXFrames <= 0) throw "STOP";
        const beforeOneShots = performance.now();
        // for resources, check init fns
        // TODO(@darzu): also check and call init functions for systems!!
        const resourcePromises = this.entityPromises.get(0);
        if (resourcePromises) {
            for (let p of resourcePromises)
                this.startInitFnsFor(p.cs);
        }
        let finishedEntities = new Set();
        this.entityPromises.forEach((promises, id) => {
            // no change
            if (!this._changedEntities.has(id)) {
                // console.log(`no change on: ${id}`);
                return;
            }
            // check each promise (reverse so we can remove)
            for (let idx = promises.length - 1; idx >= 0; idx--) {
                const s = promises[idx];
                // promise full filled?
                if (!s.cs.every((c) => c.name in s.e)) {
                    // console.log(`still doesn't match: ${id}`);
                    continue;
                }
                // call callback
                const afterOneShotQuery = performance.now();
                const stats = this.sysStats["__oneShots"];
                stats.queries += 1;
                stats.queryTime += afterOneShotQuery - beforeOneShots;
                promises.splice(idx, 1);
                // TODO(@darzu): how to handle async callbacks and their timing?
                s.callback(s.e);
                const afterOneShotCall = performance.now();
                stats.calls += 1;
                const thisCallTime = afterOneShotCall - afterOneShotQuery;
                stats.callTime += thisCallTime;
                stats.maxCallTime = Math.max(stats.maxCallTime, thisCallTime);
            }
            // clean up
            if (promises.length === 0)
                finishedEntities.add(id);
        });
        // clean up
        for (let id of finishedEntities) {
            this.entityPromises.delete(id);
        }
        this._changedEntities.clear();
    }
    // TODO(@darzu): good or terrible name?
    // TODO(@darzu): another version for checking entity promises?
    whyIsntSystemBeingCalled(name) {
        // TODO(@darzu): more features like check against a specific set of entities
        const sys = this.systems.get(name);
        if (!sys) {
            console.warn(`No systems found with name: '${name}'`);
            return;
        }
        let haveAllResources = true;
        for (let _r of sys.rs) {
            let r = _r;
            if (!this.getResource(r)) {
                console.warn(`System '${name}' missing resource: ${r.name}`);
                haveAllResources = false;
            }
        }
        const es = this.filterEntities(sys.cs);
        console.warn(`System '${name}' matches ${es.length} entities and has all resources: ${haveAllResources}.`);
    }
    // TODO(@darzu): Rethink naming here
    // NOTE: if you're gonna change the types, change registerSystem first and just copy
    //  them down to here
    whenEntityHas(e, ...cs) {
        // short circuit if we already have the components
        if (cs.every((c) => c.name in e))
            return Promise.resolve(e);
        // TODO(@darzu): this is too copy-pasted from registerSystem
        // TODO(@darzu): need unified query maybe?
        // let _name = "oneShot" + this.++;
        // if (this.entityPromises.has(_name))
        //   throw `One-shot single system named ${_name} already defined.`;
        // use one bucket for all one shots. Change this if we want more granularity
        this.sysStats["__oneShots"] = this.sysStats["__oneShots"] ?? {
            calls: 0,
            queries: 0,
            callTime: 0,
            maxCallTime: 0,
            queryTime: 0,
        };
        return new Promise((resolve, reject) => {
            const sys = {
                e,
                cs,
                callback: resolve,
                // name: _name,
            };
            if (this.entityPromises.has(e.id))
                this.entityPromises.get(e.id).push(sys);
            else
                this.entityPromises.set(e.id, [sys]);
        });
    }
}
// TODO(@darzu): where to put this?
export const EM = new EntityManager();
//# sourceMappingURL=entity-manager.js.map