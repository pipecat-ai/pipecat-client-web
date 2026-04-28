/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import { A11ySnapshotStreamer } from "../client/a11y-streamer";
import type { UIAgentClient } from "../client/ui-agent-client";
import type { A11ySnapshot } from "../rtvi/ui";

type Emission = { name: string; payload: unknown };

function makeStubClient(emissions: Emission[]): UIAgentClient {
  // Only the ``sendEvent`` method is exercised by the streamer.
  const stub = {
    sendEvent: jest.fn((name: string, payload: unknown) => {
      emissions.push({ name, payload });
    }),
  } as unknown as UIAgentClient;
  return stub;
}

describe("A11ySnapshotStreamer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "<main><button>Go</button></main>";
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("primes an initial snapshot after start()", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer(makeStubClient(emissions), {
      debounceMs: 100,
    });

    streamer.start();
    expect(emissions).toHaveLength(0);

    jest.advanceTimersByTime(100);

    expect(emissions).toHaveLength(1);
    expect(emissions[0].name).toBe("__ui_snapshot");
    const snap = emissions[0].payload as A11ySnapshot;
    expect(snap.root).toBeDefined();
    expect(snap.captured_at).toBeGreaterThan(0);
    streamer.stop();
  });

  it("coalesces rapid mutations into one debounced emission", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer(makeStubClient(emissions), {
      debounceMs: 200,
    });
    streamer.start();

    // Flush the initial prime.
    jest.advanceTimersByTime(200);
    expect(emissions).toHaveLength(1);

    const main = document.querySelector("main")!;
    for (let i = 0; i < 5; i++) {
      main.appendChild(document.createElement("button"));
    }

    // MutationObserver is async; let microtasks run first.
    return Promise.resolve().then(() => {
      jest.advanceTimersByTime(200);
      expect(emissions).toHaveLength(2);
      streamer.stop();
    });
  });

  it("emits on scrollend, resize, and visibilitychange-to-visible", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer(makeStubClient(emissions), {
      debounceMs: 100,
    });
    streamer.start();
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(1);

    window.dispatchEvent(new Event("scrollend"));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(2);

    window.dispatchEvent(new Event("resize"));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(3);

    // Hidden→visible fires; hidden alone does not.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(3);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(4);

    streamer.stop();
  });

  it("stop() detaches observers; mutations after stop() don't emit", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer(makeStubClient(emissions), {
      debounceMs: 100,
    });
    streamer.start();
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(1);

    streamer.stop();

    const main = document.querySelector("main");
    main?.appendChild(document.createElement("button"));

    return Promise.resolve().then(() => {
      jest.advanceTimersByTime(500);
      expect(emissions).toHaveLength(1);
    });
  });

  it("start() is idempotent", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer(makeStubClient(emissions), {
      debounceMs: 100,
    });
    streamer.start();
    streamer.start(); // no-op
    jest.advanceTimersByTime(100);
    // Should have only one primed emission, not two.
    expect(emissions).toHaveLength(1);
    streamer.stop();
  });

  it("re-emits on selectionchange so snapshots reflect the latest selection", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer(makeStubClient(emissions), {
      debounceMs: 100,
    });
    streamer.start();
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(1);

    document.dispatchEvent(new Event("selectionchange"));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(2);

    streamer.stop();

    // After stop(), selectionchange should not produce more snapshots.
    document.dispatchEvent(new Event("selectionchange"));
    jest.advanceTimersByTime(500);
    expect(emissions).toHaveLength(2);
  });
});
