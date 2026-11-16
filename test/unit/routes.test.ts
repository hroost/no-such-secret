import { describe, expect, it } from "vitest";
import { secretPath } from "../../src/shared/routes";

describe("recipient links", () => {
  it("uses public routes for external shares and requests", () => {
    expect(secretPath("external", "share", "id")).toBe("/public/share/id");
    expect(secretPath("external", "request", "id")).toBe("/public/request/id");
  });

  it("uses internal routes for company shares and requests", () => {
    expect(secretPath("internal", "share", "id")).toBe("/internal/share/id");
    expect(secretPath("internal", "request", "id")).toBe("/internal/request/id");
  });
});
