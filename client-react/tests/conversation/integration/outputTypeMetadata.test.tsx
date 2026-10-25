/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";

import { PipecatConversationProvider } from "@/conversation/PipecatConversationProvider";
import type {
  ConversationMessage,
  OutputTypeMetadata,
} from "@/conversation/types";
import { RTVIEventContext } from "@/RTVIEventContext";
import { usePipecatConversation } from "@/usePipecatConversation";

type Metadata = Record<string, OutputTypeMetadata>;

/**
 * Renders the real event wiring against a fake RTVI event bus, with a
 * conversation hook given the metadata options.
 */
function renderConversation(options: {
  outputTypeMetadata?: Metadata;
  aggregationMetadata?: Metadata;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();
  const probe: { messages: ConversationMessage[] } = { messages: [] };

  const ProbeView = () => {
    probe.messages = usePipecatConversation(options).messages;
    return null;
  };

  render(
    <Provider store={createStore()}>
      <RTVIEventContext.Provider
        value={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          on: ((event: string, handler: (data?: any) => void) => {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(handler);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          off: ((event: string, handler: (data?: any) => void) => {
            handlers.get(event)?.delete(handler);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
        }}
      >
        <PipecatConversationProvider>
          <ProbeView />
        </PipecatConversationProvider>
      </RTVIEventContext.Provider>
    </Provider>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emit = (event: RTVIEvent, data?: any) => {
    act(() => {
      handlers.get(event)?.forEach((handler) => handler(data));
    });
  };

  emit(RTVIEvent.BotReady, { version: "2.2.0" });
  emit(RTVIEvent.BotOutput, {
    text: "print('hi')",
    output_type: "code",
    text_type: "code",
    aggregated_by: "code",
    will_be_spoken: false,
  });
  return probe.messages[0].parts[0];
}

describe("output type metadata", () => {
  // Installed before any test so every aggregationMetadata warning is counted,
  // whichever test happens to trigger the first one.
  let warnSpy: jest.SpiedFunction<typeof console.warn>;
  beforeAll(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSpy.mockRestore();
  });

  it("gives a part its output type, and the same deprecated aggregatedBy", () => {
    const part = renderConversation({});

    expect(part.outputType).toBe("code");
    expect(part.aggregatedBy).toBe("code");
  });

  it("renders a part by its outputTypeMetadata", () => {
    const part = renderConversation({
      outputTypeMetadata: { code: { displayMode: "block" } },
    });

    expect(part.displayMode).toBe("block");
  });

  it("still renders a part by the deprecated aggregationMetadata", () => {
    const part = renderConversation({
      aggregationMetadata: { code: { displayMode: "block" } },
    });

    expect(part.displayMode).toBe("block");
  });

  it("prefers outputTypeMetadata to aggregationMetadata", () => {
    const part = renderConversation({
      outputTypeMetadata: { code: { displayMode: "inline" } },
      aggregationMetadata: { code: { displayMode: "block" } },
    });

    expect(part.displayMode).toBe("inline");
  });

  it("warns about the deprecated aggregationMetadata only once", () => {
    renderConversation({ aggregationMetadata: { code: {} } });
    renderConversation({ aggregationMetadata: { code: {} } });

    const deprecationWarnings = warnSpy.mock.calls.filter(([message]) =>
      String(message).includes("aggregationMetadata is deprecated")
    );
    expect(deprecationWarnings).toHaveLength(1);
  });
});
