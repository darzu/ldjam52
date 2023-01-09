import { EM } from "../entity-manager.js";
/*
UI needed:
text, button, check box, radio, sliders, text input?

In-engine text rendering:
  As 3D models?
  As SDF-based font?

[ ] As 2D triangles, can be extruded to 3D
[ ] Pick a font
[ ] Triangulate to 2D
[ ] Render to texture, JFA
[ ] Extrude to 3D
[ ] Expand letters to triangles on GPU?
[ ] Sensible first step: render font texture to plane, alpha clipping

[ ] font editor: scrible brush for rough shape
[ ] font editor: triangle editor to triangulate
[ ] font editor: html reference fonts overlay
*/
export const TextDef = EM.defineComponent("text", (upperDiv, debugDiv, lowerDiv) => {
    return {
        upperText: "",
        lowerText: "",
        debugText: "",
        upperDiv,
        debugDiv,
        lowerDiv,
    };
});
export function registerUISystems(em) {
    const upperDiv = document.getElementById("title-div");
    const debugDiv = document.getElementById("debug-div");
    const lowerDiv = document.getElementById("lower-div");
    em.addResource(TextDef, upperDiv, debugDiv, lowerDiv);
    em.registerSystem(null, [TextDef], (_, res) => {
        // PERF NOTE: using ".innerText =" creates a new DOM element each frame, whereas
        //    using ".firstChild.nodeValue =" reuses the DOM element. Unfortunately this
        //    means we'll need to do more work to get line breaks.
        if (res.text.upperText)
            upperDiv.firstChild.nodeValue = res.text.upperText;
        if (res.text.debugText)
            debugDiv.firstChild.nodeValue = res.text.debugText;
        if (res.text.lowerText)
            lowerDiv.firstChild.nodeValue = res.text.lowerText;
    }, "uiText");
}
//# sourceMappingURL=ui.js.map