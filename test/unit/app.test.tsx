// @vitest-environment happy-dom
import { act } from "react";
import { webcrypto } from "node:crypto";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, LinkResult } from "../../src/app/App";
import { createFragment } from "../../src/crypto/fragment";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/internal/request/test-id");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "open" }))));
  vi.stubGlobal("crypto", webcrypto);
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
  it.each(["internal", "public"])("checks request status through the %s API", async (scope) => {
    window.history.replaceState(null, "", `/${scope}/request/test-id`);
    await act(async () => root.render(<App />));
    expect(fetch).toHaveBeenCalledWith(`/api/${scope}/requests/test-id/status`, expect.anything());
    expect(container.querySelector("h1")?.textContent).toBe("Send a secret");
  });

  it.each(["internal", "public"])("submits an encrypted file through the %s API", async (scope) => {
    window.history.replaceState(null, "", `/${scope}/request/test-id`);
    await act(async () => root.render(<App />));
    await act(async () => container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(["disposable test"], "test.txt")] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/${scope}/requests/test-id/submit`, expect.objectContaining({ method: "POST" })));
    });
    expect(container.querySelector("h1")?.textContent).toBe("Return this secure link");
  });

  it.each([
    ["internal", "share"], ["public", "share"], ["internal", "request"],
  ])("reveals a %s %s through its matching API", async (scope, mode) => {
    const fragment = createFragment(new Uint8Array(32), new Uint8Array(32));
    window.history.replaceState(null, "", `/${scope}/${mode}/test-id#${fragment}`);
    await act(async () => root.render(<App />));
    await act(async () => container.querySelector("button")!.click());
    expect(fetch).toHaveBeenCalledWith(`/api/${scope}/${mode}s/test-id/reveal`, expect.objectContaining({ method: "POST" }));
  });

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
