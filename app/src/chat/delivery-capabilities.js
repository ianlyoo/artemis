const studio = Object.freeze({ queue: false, timing: false, browserProvenance: false, trackedDelivery: false });
const chain = Object.freeze({ queue: true, timing: true, browserProvenance: true, trackedDelivery: true });
export const deliveryCapabilities = (role) => role === "studio" ? studio : chain;
