/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type MediaSupport, RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import React from "react";

import {
  PipecatClientMediaSupportProvider,
  useMediaSupport,
} from "../../src/PipecatClientMediaSupport";
import { RTVIEventContext } from "../../src/RTVIEventContext";
import { usePipecatClient } from "../../src/usePipecatClient";

jest.mock("../../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

/** Renders the hook inside its provider, against a fake RTVI event bus. */
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

  const result: { current: MediaSupport | undefined } = { current: undefined };
  const Probe: React.FC = () => {
    result.current = useMediaSupport();
    return null;
  };

  const tree = () => (
    <JotaiProvider store={store}>
      <RTVIEventContext.Provider
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value={{ on: on as any, off: off as any }}
      >
        <PipecatClientMediaSupportProvider>
          <Probe />
        </PipecatClientMediaSupportProvider>
      </RTVIEventContext.Provider>
    </JotaiProvider>
  );
  const store = createStore();
  const { rerender } = render(tree());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emit = (event: RTVIEvent, data?: any) => {
    act(() => {
      handlers.get(event)?.forEach((handler) => handler(data));
    });
  };

  return { result, emit, rerender: () => rerender(tree()) };
}

describe("useMediaSupport", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("starts from the client's current media support", () => {
    const support = { cam: false, screenShare: false };
    mockUsePipecatClient.mockReturnValue({ mediaSupport: support });
    const { result } = renderHook();
    expect(result.current).toEqual(support);
  });

  it("follows MediaSupportUpdated", () => {
    mockUsePipecatClient.mockReturnValue({ mediaSupport: {} });
    const { result, emit } = renderHook();
    const next = { mic: true, botVideo: false };

    emit(RTVIEvent.MediaSupportUpdated, next);

    expect(result.current).toEqual(next);
  });

  it("re-seeds when the client changes", () => {
    mockUsePipecatClient.mockReturnValue({ mediaSupport: {} });
    const { result, rerender } = renderHook();

    mockUsePipecatClient.mockReturnValue({ mediaSupport: { cam: false } });
    rerender();

    expect(result.current).toEqual({ cam: false });
  });

  it("is empty without a client", () => {
    mockUsePipecatClient.mockReturnValue(undefined);
    const { result } = renderHook();
    expect(result.current).toEqual({});
  });
});
