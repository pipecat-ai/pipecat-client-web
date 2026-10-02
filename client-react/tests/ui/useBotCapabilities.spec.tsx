/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type BotCapabilities, RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import React from "react";

import {
  PipecatClientBotCapabilitiesProvider,
  useBotCapabilities,
} from "../../src/PipecatClientBotCapabilities";
import { RTVIEventContext } from "../../src/RTVIEventContext";
import { usePipecatClient } from "../../src/usePipecatClient";

jest.mock("../../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

/** Renders the hook against a fake RTVI event bus. */
function renderHook() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = (event: string, handler: (data?: any) => void) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const off = (event: string, handler: (data?: any) => void) => {
    handlers.get(event)?.delete(handler);
  };

  const result: { current: BotCapabilities | undefined } = {
    current: undefined,
  };
  const Probe: React.FC = () => {
    result.current = useBotCapabilities();
    return null;
  };

  render(
    <JotaiProvider store={createStore()}>
      <RTVIEventContext.Provider
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value={{ on: on as any, off: off as any }}
      >
        <PipecatClientBotCapabilitiesProvider>
          <Probe />
        </PipecatClientBotCapabilitiesProvider>
      </RTVIEventContext.Provider>
    </JotaiProvider>,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emit = (event: RTVIEvent, data?: any) => {
    act(() => {
      handlers.get(event)?.forEach((handler) => handler(data));
    });
  };

  return { result, emit };
}

describe("useBotCapabilities", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("is undefined before bot-ready", () => {
    mockUsePipecatClient.mockReturnValue({ botCapabilities: undefined });
    const { result } = renderHook();
    expect(result.current).toBeUndefined();
  });

  it("returns the capabilities from bot-ready", () => {
    mockUsePipecatClient.mockReturnValue({ botCapabilities: undefined });
    const { result, emit } = renderHook();
    const capabilities = { audio_in: true, video_out: false };

    emit(RTVIEvent.BotReady, { version: "2.2.0", capabilities });

    expect(result.current).toEqual(capabilities);
  });

  it("starts from the client's capabilities when mounted after bot-ready", () => {
    const capabilities = { audio_out: true, video_out: true };
    mockUsePipecatClient.mockReturnValue({ botCapabilities: capabilities });
    const { result } = renderHook();
    expect(result.current).toEqual(capabilities);
  });

  it("clears on disconnect", () => {
    mockUsePipecatClient.mockReturnValue({ botCapabilities: undefined });
    const { result, emit } = renderHook();

    emit(RTVIEvent.BotReady, {
      version: "2.2.0",
      capabilities: { audio_in: true },
    });
    emit(RTVIEvent.Disconnected);

    expect(result.current).toBeUndefined();
  });
});
