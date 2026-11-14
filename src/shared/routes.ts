import type { Audience, Mode } from "./contracts";

export function secretPath(audience: Audience, mode: Mode, id: string): string {
  const scope = audience === "external" ? "public" : "internal";
  return `/${scope}/${mode}/${id}`;
}
