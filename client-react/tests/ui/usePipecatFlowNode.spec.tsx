/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { type FlowNodeEnteredData, RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import React from "react";

import {
  PipecatClientFlowNodeProvider,
  usePipecatFlowNode,
} from "../../src/PipecatClientFlowNode";
import { RTVIEventContext } from "../../src/RTVIEventContext";
import { usePipecatClient } from "../../src/usePipecatClient";

jest.mock("../../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

type Result = { current: FlowNodeEnteredData | null };

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

  const first: Result = { current: null };
  const late: Result = { current: null };
  const Probe: React.FC<{ result: Result }> = ({ result }) => {
    result.current = usePipecatFlowNode();
    return null;
  };

  const tree = (withLateProbe: boolean) => (
    <JotaiProvider store={store}>
      <RTVIEventContext.Provider
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value={{ on: on as any, off: off as any }}
      >
        <PipecatClientFlowNodeProvider>
          <Probe result={first} />
          {withLateProbe && <Probe result={late} />}
        </PipecatClientFlowNodeProvider>
      </RTVIEventContext.Provider>
    </JotaiProvider>
  );
  const store = createStore();
  const { rerender } = render(tree(false));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emit = (event: RTVIEvent, data?: any) => {
    act(() => {
      handlers.get(event)?.forEach((handler) => handler(data));
    });
  };
  const mountLateProbe = () => rerender(tree(true));

  return { result: first, late, emit, mountLateProbe };
}

const verify: FlowNodeEnteredData = {
  node: "verify_to_book.ask_birth_date",
  previous_node: "greet",
  function: "wants_to_book",
  parent: "verify_to_book",
};

describe("usePipecatFlowNode", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
    mockUsePipecatClient.mockReturnValue({});
  });

  it("is null before the flow enters a node", () => {
    const { result } = renderHook();
    expect(result.current).toBeNull();
  });

  it("returns the latest node the flow entered", () => {
    const { result, emit } = renderHook();

    emit(RTVIEvent.FlowNodeEntered, { node: "greet" });
    emit(RTVIEvent.FlowNodeEntered, verify);

    expect(result.current).toEqual(verify);
  });

  it("starts from the client's flow node when mounted after the flow entered it", () => {
    mockUsePipecatClient.mockReturnValue({ flowNode: verify });
    const { result } = renderHook();
    expect(result.current).toEqual(verify);
  });

  it("gives a component that mounts later the current node", () => {
    const { late, emit, mountLateProbe } = renderHook();

    emit(RTVIEvent.FlowNodeEntered, verify);
    mountLateProbe();

    expect(late.current).toEqual(verify);
  });

  it("clears on disconnect", () => {
    const { result, emit } = renderHook();

    emit(RTVIEvent.FlowNodeEntered, verify);
    emit(RTVIEvent.Disconnected);

    expect(result.current).toBeNull();
  });
});
