import { hosts } from "./names.js";
export const hostId = (host) => host === "windows" ? hosts().main ?? host : host;
let names = {};
export const useHostNames = (d) => {
  if (d?.host_labels) names = d.host_labels;
};
export const hostName = (host) => names[hostId(host)] ?? hostId(host);
