import { test } from "./test.js";
import { setupObjImportExporter } from "./download.js";
import { EM } from "./entity-manager.js";
import { tick } from "./time.js";
import { registerInputsSystem } from "./inputs.js";
import { MeDef, JoinDef, HostDef, PeerNameDef } from "./net/components.js";
import { addEventComponents } from "./net/events.js";
import { dbg } from "./debugger.js";
import { DevConsoleDef } from "./console.js";
import { initReboundSandbox } from "./game/game-rebound.js";
// import { callClothSystems } from "./game/cloth.js";
import { registerCommonSystems } from "./game/game-init.js";
import { setSimulationAlpha } from "./render/renderer-ecs.js";
import { never } from "./util.js";
// import { initHyperspaceGame } from "./game/game-hyperspace.js";
import { DBG_ASSERT, VERBOSE_LOG } from "./flags.js";
import { initRogueGame } from "./game/game-rogue.js";
import { initFontEditor } from "./game/game-font.js";
import { initGJKSandbox } from "./game/game-gjk.js";
import { initHyperspaceGame } from "./game/game-hyperspace.js";
import { initClothSandbox } from "./game/game-cloth.js";
import { initCubeGame } from "./game/xp-cube.js";
import { resetTempMatrixBuffer } from "./sprig-matrix.js";
import { initLD52 } from "./ld52/game-ld52.js";
export const FORCE_WEBGL = false;
export const MAX_MESHES = 20000;
export const MAX_VERTICES = 21844;
const ENABLE_NET = false;
const AUTOSTART = true;
const ALL_GAMES = [
    "gjk",
    "rebound",
    "ld51",
    "ld52",
    "font",
    "hyperspace",
    "cloth",
    "cube",
];
const GAME = "ld52";
// Run simulation with a fixed timestep @ 60hz
const TIMESTEP = 1000 / 60;
// Don't run more than 5 simulation steps--if we do, reset accumulated time
const MAX_SIM_LOOPS = 1;
// TODO(@darzu): PERF ISSUES WITH LD51
// const MAX_SIM_LOOPS = 3;
export let gameStarted = false;
function legacyRequireAllTheSystems() {
    // TODO(@darzu): calling systems still needs more massaging.
    //    - uncalled systems maybe should give a warning? Or at least a one-time read out.
    //    - Lets use types for this. String matching the name is brittle and unnessessary
    EM.requireSystem("inputs");
    EM.requireSystem("mouseDrag");
    //EM.requireSystem("getStatsFromNet");
    //EM.requireSystem("getEventsFromNet");
    //EM.requireSystem("sendEventsToNet");
    EM.requireSystem("canvas");
    EM.requireSystem("uiText");
    EM.requireSystem("devConsoleToggle");
    EM.requireSystem("devConsole");
    if (GAME === "hyperspace") {
        EM.requireSystem("restartTimer");
    }
    // EM.callSystem("updateScore");
    EM.requireSystem("renderInit");
    EM.requireSystem("musicStart");
    //EM.requireSystem("handleNetworkEvents");
    //EM.requireSystem("recordPreviousLocations");
    //EM.requireSystem("clearRemoteUpdatesMarker");
    //EM.requireSystem("netUpdate");
    //EM.requireSystem("predict");
    //EM.requireSystem("connectToServer");
    //EM.requireSystem("handleJoin");
    //EM.requireSystem("handleJoinResponse");
    EM.requireSystem("buildBullets");
    EM.requireSystem("buildCursor");
    EM.requireSystem("placeCursorAtScreenCenter");
    if (GAME === "hyperspace") {
        EM.requireSystem("stepEnemyShips");
        EM.requireSystem("enemyShipsFire");
        EM.requireSystem("breakEnemyShips");
    }
    EM.requireSystem("controllableInput");
    EM.requireSystem("controllableCameraFollow");
    EM.requireSystem("buildPlayers");
    EM.requireSystem("playerFacingDir");
    EM.requireSystem("stepPlayers");
    if (GAME === "hyperspace") {
        EM.requireSystem("playerLookingForShip");
    }
    if (GAME === "rebound") {
        EM.maybeRequireSystem("sandboxSpawnBoxes");
    }
    if (GAME === "cloth") {
        EM.maybeRequireSystem("clothSandbox");
    }
    if (GAME === "hyperspace") {
        EM.requireSystem("startGame");
        EM.requireSystem("shipHealthCheck");
        EM.requireSystem("easeRudder");
        EM.requireSystem("shipMove");
        EM.requireSystem("playerShipMove");
        EM.requireSystem("shipUpdateParty");
        // EM.callSystem("shipScore");
        EM.requireSystem("enemyShipPropsBuild");
        EM.requireSystem("cannonPropsBuild");
        EM.requireSystem("gemPropsBuild");
        EM.requireSystem("rudderPropsBuild");
        EM.requireSystem("mastPropsBuild");
        EM.requireSystem("playerShipPropsBuild");
        EM.requireSystem("darkStarPropsBuild");
        EM.requireSystem("darkStarOrbit");
        EM.requireSystem("hyperspaceGame");
        // EM.callSystem("runOcean");
        EM.requireSystem("oceanUVtoPos");
        EM.requireSystem("oceanUVDirToRot");
        EM.requireSystem("debugLoop");
        // EM.callSystem("initWooden");
        EM.requireSystem("runWooden");
    }
    if (GAME === "ld51") {
        // EM.callSystem("initWooden");
        EM.requireSystem("runWooden");
        EM.requireSystem("woodHealth");
    }
    EM.requireSystem("updateBullets");
    EM.requireSystem("applyGravity");
    if (GAME === "hyperspace") {
        // TODO(@darzu): noodles broken?
        EM.requireSystem("updateNoodles");
    }
    EM.requireSystem("updateLifetimes");
    EM.requireSystem("interaction");
    EM.requireSystem("turretAim");
    EM.requireSystem("turretYawPitch");
    EM.requireSystem("turretManUnman");
    if (GAME === "hyperspace") {
        EM.requireSystem("updateMastBoom");
        EM.requireSystem("sail");
        EM.requireSystem("orreryMotion");
    }
    EM.requireSystem("reloadCannon");
    EM.requireSystem("playerControlCannon");
    EM.requireSystem("playerManCanon");
    if (GAME === "hyperspace") {
        EM.requireSystem("spawnOnTile");
        EM.requireSystem("spawnFinishAnimIn");
    }
    EM.requireSystem("ensureFillOutLocalFrame");
    EM.requireSystem("ensureWorldFrame");
    // EM.callSystem("physicsDeadStuff");
    EM.requireSystem("physicsInit");
    EM.requireSystem("clampVelocityByContact");
    EM.requireSystem("registerPhysicsClampVelocityBySize");
    EM.requireSystem("registerPhysicsApplyLinearVelocity");
    EM.requireSystem("physicsApplyAngularVelocity");
    if (GAME === "gjk") {
        // TODO(@darzu): Doug, we should talk about this. It is only registered after a one-shot
        EM.maybeRequireSystem("checkGJK");
    }
    // TODO(@darzu): HACK. we need to think better how to let different areas, like a sandbox game, register systems
    //    to be called in a less cumbersome way than adding text and guards in here.
    // for (let sys of gameplaySystems) EM.requireSystem(sys);
    EM.requireSystem("updateLocalFromPosRotScale");
    EM.requireSystem("updateWorldFromLocalAndParent");
    EM.requireSystem("registerUpdateWorldAABBs");
    EM.requireSystem("updatePhysInContact");
    EM.requireSystem("physicsStepContact");
    EM.requireSystem("updateWorldFromLocalAndParent2");
    EM.requireSystem("colliderMeshes");
    EM.requireSystem("debugMeshes");
    EM.requireSystem("debugMeshTransform");
    EM.requireSystem("bulletCollision");
    EM.requireSystem("spring");
    EM.requireSystem("buildCloths");
    EM.requireSystem("updateClothMesh");
    EM.requireSystem("modelerOnOff");
    EM.requireSystem("modelerClicks");
    EM.requireSystem("aabbBuilder");
    if (GAME === "hyperspace") {
        EM.requireSystem("toolPickup");
        EM.requireSystem("toolDrop");
    }
    EM.requireSystem("animateTo");
    //EM.requireSystem("netDebugSystem");
    //EM.requireSystem("netAck");
    //EM.requireSystem("netSync");
    //EM.requireSystem("sendOutboxes");
    EM.requireSystem("detectedEventsToHost");
    EM.requireSystem("handleEventRequests");
    EM.requireSystem("handleEventRequestAcks");
    EM.requireSystem("detectedEventsToRequestedEvents");
    EM.requireSystem("requestedEventsToEvents");
    EM.requireSystem("sendEvents");
    EM.requireSystem("handleEvents");
    EM.requireSystem("handleEventAcks");
    EM.requireSystem("runEvents");
    EM.requireSystem("delete");
    EM.requireSystem("smoothMotion");
    EM.requireSystem("updateMotionSmoothing");
    EM.requireSystem("updateSmoothedWorldFrames");
    EM.requireSystem("smoothCamera");
    EM.requireSystem("cameraFollowTarget");
    EM.requireSystem("retargetCamera");
    EM.requireSystem("renderView");
    EM.requireSystem("constructRenderables");
    if (DBG_ASSERT)
        EM.requireSystem("deadCleanupWarning"); // SHOULD BE LAST(-ish); warns if cleanup is missing
}
function callFixedTimestepSystems() {
    EM.callSystems();
    EM.checkEntityPromises();
    EM.dbgLoops++;
}
async function startGame(localPeerName, host) {
    if (gameStarted)
        return;
    gameStarted = true;
    let hosting = host === null;
    let start_of_time = performance.now();
    EM.setDefaultRange("local");
    EM.setIdRange("local", 1, 10000);
    // TODO(@darzu): ECS stuff
    // init ECS
    EM.addResource(PeerNameDef, localPeerName);
    if (hosting) {
        // TODO(@darzu): ECS
        EM.setDefaultRange("net");
        EM.setIdRange("net", 10001, 20000);
        EM.addResource(MeDef, 0, true);
        EM.addResource(HostDef);
    }
    else {
        EM.addResource(JoinDef, host);
    }
    registerCommonSystems(EM);
    addEventComponents(EM);
    registerInputsSystem(EM);
    if (GAME === "gjk")
        initGJKSandbox(EM, hosting);
    else if (GAME === "rebound")
        initReboundSandbox(EM, hosting);
    else if (GAME === "cloth")
        initClothSandbox(EM, hosting);
    else if (GAME === "hyperspace")
        initHyperspaceGame(EM);
    else if (GAME === "cube")
        initCubeGame(EM);
    else if (GAME === "ld51")
        initRogueGame(EM, hosting);
    else if (GAME === "font")
        initFontEditor(EM);
    else if (GAME === "ld52")
        initLD52(EM, hosting);
    else
        never(GAME, "TODO game");
    legacyRequireAllTheSystems();
    let previous_frame_time = start_of_time;
    let accumulator = 0;
    let frame = (frame_time) => {
        // console.log(`requestAnimationFrame: ${frame_time}`);
        let before_frame = performance.now();
        accumulator += frame_time - previous_frame_time;
        let loops = 0;
        while (accumulator > TIMESTEP) {
            if (loops >= MAX_SIM_LOOPS) {
                if (VERBOSE_LOG)
                    console.log("too many sim loops, resetting accumulator");
                accumulator = 0;
                break;
            }
            accumulator -= TIMESTEP;
            tick(EM, TIMESTEP);
            resetTempMatrixBuffer();
            callFixedTimestepSystems();
            loops++;
        }
        setSimulationAlpha(accumulator / TIMESTEP);
        EM.requireSystem("updateRendererWorldFrames");
        EM.requireSystem("updateCameraView");
        {
            // NOTE: these 3 must stay together in this order. See NOTE above renderListDeadHidden
            EM.requireSystem("renderListDeadHidden");
            EM.requireSystem("renderList");
            EM.requireSystem("stepRenderer");
        }
        let jsTime = performance.now() - before_frame;
        let frameTime = frame_time - previous_frame_time;
        previous_frame_time = frame_time;
        const devStats = EM.getResource(DevConsoleDef);
        if (devStats) {
            devStats.updateAvgs(jsTime, frameTime, jsTime);
        }
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}
function getPeerName(queryString) {
    const user = queryString["user"] || "default";
    let peerName = localStorage.getItem("peerName-" + user);
    if (!peerName) {
        // TODO: better random peer name generation, or get peer name from server
        const rand = crypto.getRandomValues(new Uint8Array(16));
        peerName = rand.join("");
        localStorage.setItem("peerName-" + user, peerName);
    }
    return peerName;
}
async function main() {
    const queryString = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    const urlServerId = queryString["server"] ?? null;
    // const peerName = getPeerName(queryString);
    const peerName = "myPeerName";
    let controls = document.getElementById("server-controls");
    let serverStartButton = document.getElementById("server-start");
    let connectButton = document.getElementById("connect");
    let serverIdInput = document.getElementById("server-id");
    if (ENABLE_NET && !AUTOSTART && !urlServerId) {
        serverStartButton.onclick = () => {
            startGame(peerName, null);
            controls.hidden = true;
        };
        connectButton.onclick = () => {
            startGame(peerName, serverIdInput.value);
            controls.hidden = true;
        };
    }
    else {
        startGame(peerName, urlServerId);
        controls.hidden = true;
    }
}
test();
// dom dependant stuff
window.onload = () => {
    setupObjImportExporter();
};
(async () => {
    // TODO(@darzu): work around for lack of top-level await in Safari
    try {
        await main();
    }
    catch (e) {
        console.error(e);
    }
})();
// for debugging
window.dbg = dbg;
window.EM = EM;
//# sourceMappingURL=main.js.map