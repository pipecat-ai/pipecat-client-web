/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react";
import React from "react";

import { RTVIEvent } from "@pipecat-ai/client-js";
import { usePipecatClient } from "../src/usePipecatClient";
import { useUICommandHandler } from "../src/useUICommandHandler";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

function makeMockPipecatClient() {
  const listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  const get = (event: string) => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    return set;
  };
  return {
    on: jest.fn((event: string, handler: unknown) => {
      get(event).add(handler as (data: unknown) => void);
    }),
    off: jest.fn((event: string, handler: unknown) => {
      get(event).delete(handler as (data: unknown) => void);
    }),
    emit: (data: unknown) => {
      for (const l of get(RTVIEvent.UICommand)) l(data);
    },
  };
}

describe("useUICommandHandler", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("registers a handler on mount and dispatches matching commands", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const calls: unknown[] = [];

    const Probe: React.FC = () => {
      useUICommandHandler<{ title: string }>("toast", (payload) => {
        calls.push(payload);
      });
      return null;
    };

    render(<Probe />);

    expect(pipecat.on).toHaveBeenCalledWith(
      RTVIEvent.UICommand,
      expect.any(Function),
    );

    act(() => {
      pipecat.emit({ command: "toast", payload: { title: "Hi" } });
      pipecat.emit({ command: "navigate", payload: { view: "home" } });
    });

    expect(calls).toEqual([{ title: "Hi" }]);
  });

  it("unregisters on unmount", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const calls: unknown[] = [];

    const Probe: React.FC = () => {
      useUICommandHandler<{ title: string }>("toast", (payload) => {
        calls.push(payload);
      });
      return null;
    };

    const rendered = render(<Probe />);

    rendered.unmount();

    expect(pipecat.off).toHaveBeenCalledWith(
      RTVIEvent.UICommand,
      expect.any(Function),
    );

    act(() => {
      pipecat.emit({ command: "toast", payload: { title: "Hi" } });
    });

    expect(calls).toEqual([]);
  });
});
