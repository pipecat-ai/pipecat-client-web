/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { describe, expect, it } from "@jest/globals";
import { RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";

import { PipecatConversationProvider } from "@/conversation/PipecatConversationProvider";
import { RTVIEventContext } from "@/RTVIEventContext";
import { usePipecatBotDelivery } from "@/usePipecatBotDelivery";

/** Renders usePipecatBotDelivery against a fake RTVI event bus. */
function renderBotDelivery() {
  const store = createStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();
  const probe: { delivery: string[] | null } = { delivery: null };

  const ProbeView = () => {
    probe.delivery = usePipecatBotDelivery();
    return null;
  };

  render(
    <Provider store={store}>
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

  return { emit, probe };
}

describe("usePipecatBotDelivery", () => {
  it("follows the bot's delivery", () => {
    const w = renderBotDelivery();
    expect(w.probe.delivery).toBeNull();

    w.emit(RTVIEvent.BotDeliveryUpdated, {
      delivery: ["cheerful"],
      previous: null,
    });
    expect(w.probe.delivery).toEqual(["cheerful"]);

    w.emit(RTVIEvent.BotDeliveryUpdated, {
      delivery: ["cheerful", "emphasis"],
      previous: ["cheerful"],
    });
    expect(w.probe.delivery).toEqual(["cheerful", "emphasis"]);

    w.emit(RTVIEvent.BotDeliveryUpdated, {
      delivery: null,
      previous: ["cheerful", "emphasis"],
    });
    expect(w.probe.delivery).toBeNull();
  });

  it("is null again when the client connects again", () => {
    const w = renderBotDelivery();
    w.emit(RTVIEvent.BotDeliveryUpdated, {
      delivery: ["calm"],
      previous: null,
    });
    w.emit(RTVIEvent.Connected);

    expect(w.probe.delivery).toBeNull();
  });
});
