import { EM } from "../entity-manager.js";
import { V } from "../sprig-matrix.js";
export const LinearVelocityDef = EM.defineComponent("linearVelocity", (v) => v || V(0, 0, 0));
EM.registerSerializerPair(LinearVelocityDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
export const AngularVelocityDef = EM.defineComponent("angularVelocity", (v) => v || V(0, 0, 0));
EM.registerSerializerPair(AngularVelocityDef, (o, buf) => buf.writeVec3(o), (o, buf) => buf.readVec3(o));
//# sourceMappingURL=motion.js.map