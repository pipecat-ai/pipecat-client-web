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

import { A11ySnapshotStreamer } from "../client/A11ySnapshotStreamer";
import type { A11ySnapshot } from "../rtvi/ui";

type Emission = A11ySnapshot;

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
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
      debounceMs: 100,
    });

    streamer.start();
    expect(emissions).toHaveLength(0);

    jest.advanceTimersByTime(100);

    expect(emissions).toHaveLength(1);
    const snap = emissions[0];
    expect(snap.root).toBeDefined();
    expect(snap.captured_at).toBeGreaterThan(0);
    streamer.stop();
  });

  it("coalesces rapid mutation notifications into one emission", async () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
      debounceMs: 100,
    });
    streamer.start();
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(1);

    const main = document.querySelector("main")!;
    main.appendChild(document.createElement("button"));
    main.appendChild(document.createElement("button"));
    await Promise.resolve();

    expect(emissions).toHaveLength(1);
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(2);
  });

  it("stops observers and pending timers", async () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
      debounceMs: 100,
    });
    streamer.start();
    streamer.stop();

    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(0);

    document.querySelector("main")!.appendChild(document.createElement("button"));
    await Promise.resolve();
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(0);
  });

  it("restarts after stop()", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
      debounceMs: 100,
    });

    streamer.start();
    streamer.stop();
    streamer.start();
    jest.advanceTimersByTime(100);

    expect(emissions).toHaveLength(1);
  });

  it("emits when scrollend and resize fire", () => {
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
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
  });

  it("emits when a form control fires input or change", () => {
    document.body.innerHTML =
      '<main><input type="checkbox" aria-label="Milk" /></main>';
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
      debounceMs: 100,
    });
    streamer.start();
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(1);

    // A checkbox toggle changes the .checked PROPERTY (no DOM mutation),
    // so the snapshot only refreshes because we listen for `change`.
    const checkbox = document.querySelector("input")!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(2);

    // Typing fires `input`.
    checkbox.dispatchEvent(new Event("input", { bubbles: true }));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(3);

    streamer.stop();
  });

  it("stops listening for form events after stop()", () => {
    document.body.innerHTML =
      '<main><input type="checkbox" aria-label="Milk" /></main>';
    const emissions: Emission[] = [];
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
      debounceMs: 100,
    });
    const checkbox = document.querySelector("input")!;
    streamer.start();
    streamer.stop();

    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    jest.advanceTimersByTime(100);
    expect(emissions).toHaveLength(0);
  });

  it("logs snapshots when enabled", () => {
    const emissions: Emission[] = [];
    const groupCollapsed = jest
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const groupEnd = jest.spyOn(console, "groupEnd").mockImplementation(() => {});
    const streamer = new A11ySnapshotStreamer((snapshot) => {
      emissions.push(snapshot);
    }, {
      debounceMs: 100,
      logSnapshots: true,
    });

    streamer.start();
    jest.advanceTimersByTime(100);

    expect(groupCollapsed).toHaveBeenCalledWith(expect.stringContaining("emit:"));
    expect(log).toHaveBeenCalledWith("snapshot:", expect.any(Object));
    expect(groupEnd).toHaveBeenCalledTimes(1);

    groupCollapsed.mockRestore();
    log.mockRestore();
    groupEnd.mockRestore();
  });
});
