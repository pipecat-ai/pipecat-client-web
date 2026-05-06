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

import { A11ySnapshotStreamer } from "../client/a11ySnapshotStreamer";
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
