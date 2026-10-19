import type { CSSProperties } from "react";

export { cn } from "cn";
export type CSSVariables = CSSProperties & Record<`--${string}`, string | number>;
