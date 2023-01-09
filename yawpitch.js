import { defineSerializableComponent } from "./em_helpers.js";
import { EM } from "./entity-manager.js";
import { quat } from "./sprig-matrix.js";
export const YawPitchDef = defineSerializableComponent(EM, "yawpitch", (yaw, pitch) => {
    return {
        yaw: yaw ?? 0,
        pitch: pitch ?? 0,
    };
}, (o, buf) => {
    buf.writeFloat32(o.yaw);
    buf.writeFloat32(o.pitch);
}, (o, buf) => {
    o.yaw = buf.readFloat32();
    o.pitch = buf.readFloat32();
});
export function yawpitchToQuat(out, yp) {
    quat.copy(out, quat.IDENTITY);
    quat.rotateY(out, yp.yaw, out);
    quat.rotateX(out, yp.pitch, out);
    return out;
}
//# sourceMappingURL=yawpitch.js.map