import { CanvasDef } from "./canvas.js";
import { EM } from "./entity-manager.js";
import { ENABLE_AUDIO } from "./flags.js";
import { createIdxPool } from "./idx-pool.js";
import { assert, range } from "./util.js";
// NOTE: basically this whole file just tries to implement
//    what Andrew suggests as a good way to start making good sounding
//    music:
//    https://www.youtube.com/watch?v=rgaTLrZGlk0
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
// https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Audio_concepts
const MAX_VOLUME = 0.02;
// TODO(@darzu): i don't love the current string pool setup. Better if we could
//   it doesn't let us play sound on an existing string. But i don't know how
//   to do that b/c we can't undo scheduled audio node stuff.
const NUM_STRINGS = 300;
// create web audio api context
// TODO(@darzu): rename to .audio
export const AudioDef = EM.defineComponent("music", createAudioResource);
export function registerMusicSystems(em) {
    em.addResource(AudioDef);
    let once = true;
    em.registerSystem(null, [AudioDef, CanvasDef], (_, res) => {
        if (once && res.htmlCanvas.hasFirstInteraction) {
            // Init our audio
            // TODO(@darzu): maybe we shouldn't even create the resource until we
            //    have the audio context?
            if (window.AudioContext != null && ENABLE_AUDIO) {
                res.music.state = createAudioState();
            }
            // play opening music
            // const THEME_LENGTH = 100;
            // const randChordId = () => Math.floor(Math.random() * 6);
            // const theme = range(100).map((_) => randChordId());
            // // const theme = [0, 1, 2, 3, 4, 5];
            // console.log("playing music");
            // res.music.playChords(theme, "major", 2.0, 2.0, -2);
            once = false;
        }
        // update the string pool
        if (res.music.state)
            for (let i = 0; i < NUM_STRINGS; i++) {
                const s = res.music.state._strings[i];
                if (s.endTime < res.music.state.ctx.currentTime) {
                    res.music.state._stringPool.free(i, true);
                }
            }
    }, "musicStart");
}
function createAudioState() {
    assert(!!window.AudioContext, `Missing window.AudioContext`);
    const ctx = new window.AudioContext();
    const _strings = range(NUM_STRINGS).map(createString);
    const idxPool = createIdxPool(NUM_STRINGS);
    return {
        ctx,
        nextString,
        _strings,
        _stringPool: idxPool,
    };
    function nextString() {
        // console.log(`string!`);
        const idx = idxPool.next();
        if (idx)
            return _strings[idx];
        return undefined;
    }
    function createString() {
        const osci = ctx.createOscillator();
        const gain = ctx.createGain();
        osci.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0;
        osci.start();
        return {
            osci,
            gain,
            endTime: ctx.currentTime,
        };
    }
}
function createAudioResource() {
    let res = {
        state: undefined,
        playChords,
    };
    return res;
    function playFreq(freq, durSec, offset) {
        if (!res.state)
            return;
        const str = res.state.nextString();
        if (!str)
            return;
        const { gain, osci } = str;
        const startTime = offset;
        const stopTime = offset + durSec;
        // osci.stop();
        gain.gain.setValueAtTime(MAX_VOLUME, startTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, stopTime + 1.0);
        // "custom" | "sawtooth" | "sine" | "square" | "triangle";
        osci.type = "sine";
        // o.type = "sawtooth";
        osci.frequency.setValueAtTime(freq, startTime);
        // osci.detune.setValueAtTime(0, startTime);
        str.endTime = stopTime;
        // osci.start(startTime);
        // o.stop(stopTime + 0.1)
    }
    function playNote(n, durSec = 0.25, offset = null) {
        if (!res.state)
            return;
        if (!offset)
            offset = res.state.ctx.currentTime;
        const ROOT = 440;
        const f = ROOT * 2 ** (n / 12);
        playFreq(f, durSec, offset);
    }
    function mkMajorScale(root) {
        return {
            root,
            // major scale: whole whole half whole whole whole half
            offsets: [2, 2, 1, 2, 2, 2, 1].reduce((p, n) => [...p, p[p.length - 1] + n], [0]),
        };
    }
    function mkMinorScale(root) {
        return {
            root,
            // minor scale: whole half whole whole whole half whole
            offsets: [2, 1, 2, 2, 2, 1, 2].reduce((p, n) => [...p, p[p.length - 1] + n], [0]),
        };
    }
    function getNotesForScale(s) {
        const notes = s.offsets.map((o) => s.root + o);
        return notes;
    }
    // interface ChordProgression {
    //     chordIndices: number[],
    // }
    function isMinor(c, s) {
        // in minor, it's a gap of 3-4
        if (c.offsets.length !== 3)
            return false;
        const ns = getNotesForChord(c, s);
        return ns[1] - ns[0] === 3 && ns[2] - ns[1] === 4;
    }
    function isMajor(c, s) {
        // in major, it's a gap of 4-3
        if (c.offsets.length !== 3)
            return false;
        const ns = getNotesForChord(c, s);
        return ns[1] - ns[0] === 4 && ns[2] - ns[1] === 3;
    }
    function mkPentatonicScale(s) {
        throw `TODO`;
    }
    function mkStandardChords(s, octave) {
        const chords = [0, 1, 2, 3, 4, 5].map((i) => {
            const c = {
                octave,
                offsets: [0, 2, 4].map((n) => n + i),
            };
            return c;
        });
        return chords;
    }
    // function rotate<T>(ts: T[]): T[] {
    //     return [ts[ts.length - 1], ...ts.slice(0, ts.length - 1)]
    // }
    function rotate(ts, shift) {
        if (shift > 0)
            return [
                ...ts.slice(ts.length - shift, ts.length),
                ...ts.slice(0, ts.length - shift),
            ];
        else if (shift < 0)
            return [...ts.slice(-shift, ts.length), ...ts.slice(0, -shift)];
        else
            return [...ts];
        // test cases:
        // console.dir({ ts: [0, 1, 2, 3], ts2: rotate([0, 1, 2, 3], 2) });
        // console.dir({ ts: [0, 1, 2, 3], tsN2: rotate([0, 1, 2, 3], -2) });
        // console.dir({ ts: [0, 1, 2, 3], ts0: rotate([0, 1, 2, 3], 0) });
    }
    function rotateChord(c, s, shift) {
        // TODO(@darzu): this doesn't properly handle shifts larger than an octave
        if (shift > 0)
            return {
                ...c,
                offsets: rotate(c.offsets, -shift).map((o, i) => c.offsets.length - shift <= i ? o + s.offsets.length - 1 : o),
            };
        else if (shift < 0)
            return {
                ...c,
                offsets: rotate(c.offsets, -shift).map((o, i) => i < -shift ? o - s.offsets.length + 1 : o),
            };
        else
            return c;
    }
    function lowNote(c) {
        return { octave: c.octave - 1, offsets: [c.offsets[0]] };
    }
    function getNotesForChord(c, s) {
        const offsets = c.offsets.map((ci) => {
            let octaveShift = c.octave;
            // e.g. -1 goes to 6 but one octave down
            while (ci < 0) {
                ci += s.offsets.length;
                octaveShift -= 1;
            }
            // e.g. 8 goes to 2 but one octave up
            while (ci >= s.offsets.length) {
                ci -= s.offsets.length;
                octaveShift += 1;
            }
            return s.offsets[ci] + octaveShift * 12;
        });
        return getNotesForScale({
            root: s.root,
            offsets,
        });
    }
    function playFromScale(idx, scale, durSec = 0.25, offset = null) {
        const scaleNotes = getNotesForScale(scale); // TODO(@darzu): don't convert every time
        const note = scaleNotes[idx];
        playNote(note, durSec, offset);
    }
    function playChord(c, s, durSec = 0.25, offset = null) {
        const notes = getNotesForChord(c, s);
        // console.log(
        //   `playing: (${c.offsets.map((o) => (o % 7) + 1).join(",")}) [${notes.join(
        //     ","
        //   )}]`
        // );
        for (let n of notes)
            playNote(n, durSec, offset);
    }
    function playChords(chordIds, majorMinor, noteSpace = 0.3, noteLen = 0.7, octave = 0) {
        // TODO(@darzu): PERF. super inefficient stuff in here
        if (!res.state)
            return;
        // console.log("click!");
        // canvasRef.removeEventListener('click', doLockMouse)
        const start = res.state.ctx.currentTime;
        const scale = majorMinor === "major" ? mkMajorScale(0) : mkMinorScale(0);
        const stdChords = mkStandardChords(scale, octave);
        // const noteSpace = 0.3;
        // const noteLen = 0.7;
        const chords = chordIds.map((i) => stdChords[i]);
        for (let i = 0; i < chords.length; i++) {
            const c = chords[i];
            const notes = getNotesForChord(c, scale);
            const maxN = Math.max(...notes);
            const minN = Math.min(...notes);
            const c2 = rotateChord(chords[i], scale, -Math.floor(minN / 2));
            playChord(c2, scale, noteLen, start + noteSpace * i);
            playChord(lowNote(c2), scale, noteLen, start + noteSpace * i);
        }
    }
}
export function randChordId() {
    return Math.floor(Math.random() * 6);
}
//# sourceMappingURL=audio.js.map