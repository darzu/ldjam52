import { createDag } from "./util-dag.js";
import { never } from "./util.js";
function isRequireLabel(c) {
    return c.length === 2 && c[0] === "requires";
}
function isResourceRequiresLabel(c) {
    return c.length === 3 && c[1] === "requires";
}
function isLabelBeforeLabel(c) {
    return c.length === 3 && c[1] === "before";
}
function isLabelAfterLabel(c) {
    return c.length === 3 && c[1] === "after";
}
// DAG solver
// TODO(@darzu): generalize this for any DAG solving
export function createLabelSolver() {
    const solver = {
        addResource,
        addConstraint,
        getPlan,
        getVersion,
    };
    // DAG for our dependencies
    const dag = createDag();
    // TODO(@darzu): we might need an existance (cyclic) dependency graph in addition to the normal DAG
    //    for example, saying "foo before physics" means that if foo and physics runs, it should run before
    //    physics, but it doesn't mean that physics needs foo in order to run nor does foo need physics in order
    //    to run.
    // TODO(@darzu): we should probably come up with wordage that disambiguates all of these constraint subtlties
    // label<->idx bookkeeping for the dag
    let nextLblIdx = 1;
    const lblToIdx = new Map();
    const idxToLbl = new Map();
    let lastVersion = -1;
    let lastPlan = [];
    // TODO(@darzu): rm
    // const req = new Set<Label>(); // top-level
    // const dep = new Map<Label, Set<Label>>(); // key depends on values
    // NOTE: since resources can come later than labels that depend on them
    //   we need some tracking for those
    const resources = new Set(); // present resources
    const labelsWaitingOnResource = new Map();
    return solver;
    function getVersion() {
        return dag.version;
    }
    function getIdx(l) {
        let idx = lblToIdx.get(l);
        if (!idx) {
            idx = nextLblIdx;
            nextLblIdx += 1;
            lblToIdx.set(l, idx);
            idxToLbl.set(idx, l);
        }
        return idx;
    }
    function addResource(r) {
        resources.add(r.name);
        const lbls = labelsWaitingOnResource.get(r.name);
        if (lbls) {
            labelsWaitingOnResource.delete(r.name);
            for (let l of lbls)
                dag.addRoot(getIdx(l));
        }
    }
    function addConstraint(con) {
        if (isRequireLabel(con)) {
            const [_, label] = con;
            dag.addRoot(getIdx(label));
        }
        else if (isResourceRequiresLabel(con)) {
            const [resource, _, label] = con;
            if (resources.has(resource.name)) {
                dag.addRoot(getIdx(label));
            }
            else {
                // await the resource
                if (labelsWaitingOnResource.has(resource.name))
                    labelsWaitingOnResource.get(resource.name).push(label);
                else
                    labelsWaitingOnResource.set(resource.name, [label]);
            }
        }
        else if (isLabelAfterLabel(con)) {
            const [dependant, _, dependee] = con;
            dag.addEdge(getIdx(dependant), getIdx(dependee));
        }
        else if (isLabelBeforeLabel(con)) {
            const [dependee, _, dependant] = con;
            dag.addEdge(getIdx(dependant), getIdx(dependee));
        }
        else {
            never(con);
        }
    }
    function getPlan() {
        if (lastVersion < dag.version) {
            const dagWalk = dag.getWalk();
            // console.log("dagWalk");
            // console.dir(dagWalk);
            lastPlan = dagWalk.map((idx) => idxToLbl.get(idx));
            lastVersion = dag.version;
        }
        return lastPlan;
    }
}
//# sourceMappingURL=em-labels.js.map