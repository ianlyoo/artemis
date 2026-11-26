import{hosts as t}from"./names.js";export const hostId=s=>s==="windows"?t().main??s:s;let o={};export const useHostNames=s=>{s?.host_labels&&(o=s.host_labels)},hostName=s=>o[hostId(s)]??hostId(s);
