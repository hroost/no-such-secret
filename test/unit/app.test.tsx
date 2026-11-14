// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, LinkResult } from "../../src/app/App";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/internal/request/test-id");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "open" }))));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("recipient navigation", () => {
  it("switches from request submission to reveal when only the URL fragment changes", async () => {
    await act(async () => root.render(<App />));
    expect(container.querySelector("h1")?.textContent).toBe("Send a secret");

    await act(async () => {
      window.location.hash = "v1.invalid.invalid";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(container.querySelector("h1")?.textContent).toBe("Reveal secret");
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("completion instructions", () => {
  it.each([
    ["share", "Send this secure link", "recipient"],
    ["request", "Send this request link", "one encrypted submission"],
    ["submission", "Return this secure link", "person who requested"],
  ] as const)("explains what to do after a %s", async (kind, heading, instruction) => {
    await act(async () => root.render(<LinkResult link="https://example.test/test" kind={kind} />));
    expect(container.querySelector("h1")?.textContent).toBe(heading);
    expect(container.textContent).toContain(instruction);
    if (kind === "share") expect(container.textContent).not.toContain("submission link");
  });
});
