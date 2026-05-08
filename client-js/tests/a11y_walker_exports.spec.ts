/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { afterEach, describe, expect, it, jest } from "@jest/globals";

const originalWeakRef = globalThis.WeakRef;

describe("a11y walker public exports", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "WeakRef", {
      configurable: true,
      value: originalWeakRef,
      writable: true,
    });
    jest.resetModules();
    document.body.innerHTML = "";
  });

  it("does not export the test-only reset helper from the public entrypoint", async () => {
    const publicApi = await import("../index");

    expect("__resetRefsForTesting" in publicApi).toBe(false);
  });

  it("resolves refs when WeakRef is unavailable", async () => {
    Object.defineProperty(globalThis, "WeakRef", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    jest.resetModules();
    const { findElementByRef, snapshotDocument } = await import(
      "../rtvi/a11y_walker"
    );

    document.body.innerHTML = "<button>Go</button>";
    const button = document.querySelector("button")!;
    const snapshot = snapshotDocument();
    const ref = snapshot.root.children?.[0]?.ref;

    expect(ref).toBeDefined();
    expect(findElementByRef(ref!)).toBe(button);

    button.remove();
    expect(findElementByRef(ref!)).toBeNull();
  });
});
