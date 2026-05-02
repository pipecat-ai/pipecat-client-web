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
import { useUIEventSender } from "../src/useUIEventSender";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

describe("useUIEventSender", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("sends ui-event through the ambient Pipecat client", () => {
    const sendRTVIMessage = jest.fn();
    mockUsePipecatClient.mockReturnValue({
      sendRTVIMessage,
      on: jest.fn(),
      off: jest.fn(),
    });

    let sender: (name: string, payload?: unknown) => void = () => {
      throw new Error("sender not yet bound");
    };

    const Probe: React.FC = () => {
      sender = useUIEventSender();
      return null;
    };

    render(
      <UIAgentProvider>
        <Probe />
      </UIAgentProvider>,
    );

    act(() => {
      sender("nav_click", { view: "home" });
    });

    expect(sendRTVIMessage).toHaveBeenCalledTimes(1);
    expect(sendRTVIMessage).toHaveBeenCalledWith("ui-event", {
      name: "nav_click",
      payload: { view: "home" },
    });
  });

  it("is a no-op when the Pipecat client is unavailable", () => {
    mockUsePipecatClient.mockReturnValue(undefined);

    // Provider won't construct a UIAgentClient when pipecatClient is
    // undefined, so we don't need to stub on/off here.

    let sender: (name: string, payload?: unknown) => void = () => {
      throw new Error("sender not yet bound");
    };

    const Probe: React.FC = () => {
      sender = useUIEventSender();
      return null;
    };

    render(
      <UIAgentProvider>
        <Probe />
      </UIAgentProvider>,
    );

    expect(() => {
      act(() => {
        sender("hello");
      });
    }).not.toThrow();
  });

  it("prefers an explicit client prop over the ambient context", () => {
    // Context path returns an unrelated client; the prop should win.
    const contextSendClientMessage = jest.fn();
    mockUsePipecatClient.mockReturnValue({
      sendRTVIMessage: contextSendClientMessage,
      on: jest.fn(),
      off: jest.fn(),
    });

    const propSendClientMessage = jest.fn();
    const propClient = {
      sendRTVIMessage: propSendClientMessage,
      on: jest.fn(),
      off: jest.fn(),
    };

    let sender: (name: string, payload?: unknown) => void = () => {
      throw new Error("sender not yet bound");
    };

    const Probe: React.FC = () => {
      sender = useUIEventSender();
      return null;
    };

    render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <UIAgentProvider client={propClient as any}>
        <Probe />
      </UIAgentProvider>,
    );

    act(() => {
      sender("nav_click", { view: "home" });
    });

    expect(propSendClientMessage).toHaveBeenCalledTimes(1);
    expect(propSendClientMessage).toHaveBeenCalledWith("ui-event", {
      name: "nav_click",
      payload: { view: "home" },
    });
    expect(contextSendClientMessage).not.toHaveBeenCalled();
  });

  it("uses the client prop even when no context provider is mounted", () => {
    // Simulate consumer apps (e.g. render-prop hosts like PipecatAppBase)
    // that have the client in hand but no PipecatClientProvider in the
    // tree the UIAgentProvider reads from.
    mockUsePipecatClient.mockReturnValue(undefined);

    const propSendClientMessage = jest.fn();
    const propClient = {
      sendRTVIMessage: propSendClientMessage,
      on: jest.fn(),
      off: jest.fn(),
    };

    let sender: (name: string, payload?: unknown) => void = () => {
      throw new Error("sender not yet bound");
    };

    const Probe: React.FC = () => {
      sender = useUIEventSender();
      return null;
    };

    render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <UIAgentProvider client={propClient as any}>
        <Probe />
      </UIAgentProvider>,
    );

    act(() => {
      sender("hello");
    });

    expect(propSendClientMessage).toHaveBeenCalledTimes(1);
    expect(propSendClientMessage).toHaveBeenCalledWith("ui-event", {
      name: "hello",
      payload: undefined,
    });
  });
});
