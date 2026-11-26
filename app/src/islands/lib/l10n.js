export const l10n = (ko, en) => globalThis.document?.documentElement?.getAttribute?.("lang") === "en" ? en : ko;
