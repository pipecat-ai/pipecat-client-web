/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react";
import React from "react";

import { useA11ySnapshot } from "../src/useA11ySnapshot";
import { usePipecatClient } from "../src/usePipecatClient";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

function makeMockPipecatClient() {
  return {
    sendRTVIMessage: jest.fn(),
  };
}

describe("useA11ySnapshot", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUsePipecatClient.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("emits an initial snapshot after mount (debounced)", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    document.body.innerHTML = '<main><button>Go</button></main>';

    const Probe: React.FC = () => {
      useA11ySnapshot({ debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    // No emission yet (before debounce elapses).
    expect(pipecat.sendRTVIMessage).not.toHaveBeenCalled();

    // Advance past debounce window.
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);
    const [type, data] = pipecat.sendRTVIMessage.mock.calls[0] as [
      string,
      { tree: Record<string, unknown> },
    ];
    expect(type).toBe("ui-snapshot");
    expect(data.tree).toHaveProperty("root");
    expect(data.tree).toHaveProperty("captured_at");
  });

  it("coalesces rapid mutations into a single debounced snapshot", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = "<main></main>";

    const Probe: React.FC = () => {
      useA11ySnapshot({ debounceMs: 200 });
      return null;
    };

    render(<Probe />);

    // Advance past initial emission.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);

    // Fire several mutations in quick succession.
    const main = document.querySelector("main")!;
    act(() => {
      for (let i = 0; i < 5; i++) {
        const btn = document.createElement("button");
        btn.textContent = `B${i}`;
        main.appendChild(btn);
      }
    });

    // Nothing emitted yet (still inside debounce window).
    // MutationObserver is async, so we need a microtask flush before timers.
    return Promise.resolve().then(() => {
      expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);
      act(() => {
        jest.advanceTimersByTime(200);
      });
      expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(2);
    });
  });

  it("is a no-op when enabled is false", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = "<main><button>X</button></main>";

    const Probe: React.FC = () => {
      useA11ySnapshot({ enabled: false, debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(pipecat.sendRTVIMessage).not.toHaveBeenCalled();
  });

  it("emits on scrollend", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = "<main><button>X</button></main>";

    const Probe: React.FC = () => {
      useA11ySnapshot({ debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    // Flush initial emission.
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("scrollend"));
      jest.advanceTimersByTime(100);
    });

    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(2);
  });

  it("emits on window resize and visibilitychange", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = "<main><button>X</button></main>";

    const Probe: React.FC = () => {
      useA11ySnapshot({ debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("resize"));
      jest.advanceTimersByTime(100);
    });
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(2);

    // Visibility flipping to visible fires an emission; flipping to
    // hidden should not.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      jest.advanceTimersByTime(100);
    });
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      jest.advanceTimersByTime(100);
    });
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(3);
  });

  it("stops emitting after unmount", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = "<main></main>";

    const Probe: React.FC = () => {
      useA11ySnapshot({ debounceMs: 100 });
      return null;
    };

    const rendered = render(<Probe />);

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);

    rendered.unmount();

    // Force what would be a mutation-triggered snapshot; observer
    // should be disconnected, no new emission.
    const main = document.querySelector("main");
    if (main) {
      main.appendChild(document.createElement("button"));
    }

    return Promise.resolve().then(() => {
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);
    });
  });
});
