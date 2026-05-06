/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react";
import React from "react";

import { UIAgentProvider } from "../src/UIAgentProvider";
import { usePipecatClient } from "../src/usePipecatClient";
import { useUICommandHandler } from "../src/useUICommandHandler";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

function makeMockPipecatClient() {
  const listeners: Set<(data: unknown) => void> = new Set();
  return {
    sendRTVIMessage: jest.fn(),
    on: jest.fn((event: unknown, handler: unknown) => {
      if (event === "uiCommand") {
        listeners.add(handler as (data: unknown) => void);
      }
    }),
    off: jest.fn((event: unknown, handler: unknown) => {
      if (event === "uiCommand") {
        listeners.delete(handler as (data: unknown) => void);
      }
    }),
    emit: (data: unknown) => {
      for (const l of listeners) l(data);
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

    render(
      <UIAgentProvider>
        <Probe />
      </UIAgentProvider>,
    );

    act(() => {
      pipecat.emit({ command: "toast", payload: { title: "Hi" } });
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

    const rendered = render(
      <UIAgentProvider>
        <Probe />
      </UIAgentProvider>,
    );

    rendered.unmount();

    act(() => {
      pipecat.emit({ command: "toast", payload: { title: "Hi" } });
    });

    expect(calls).toEqual([]);
  });
});
