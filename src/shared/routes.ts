import type { Audience, Mode } from "./contracts";

export function routeScope(audience: Audience): "public" | "internal" {
  return audience === "external" ? "public" : "internal";
}

export function secretPath(audience: Audience, mode: Mode, id: string): string {
  return `/${routeScope(audience)}/${mode}/${id}`;
}
