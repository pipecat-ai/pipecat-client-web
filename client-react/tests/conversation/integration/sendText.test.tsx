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
import { type PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";

import { PipecatConversationProvider } from "@/conversation/PipecatConversationProvider";
import type { ConversationMessage } from "@/conversation/types";
import { PipecatClientContext } from "@/PipecatClientProvider";
import { RTVIEventContext } from "@/RTVIEventContext";
import { usePipecatConversation } from "@/usePipecatConversation";

type Conversation = ReturnType<typeof usePipecatConversation>;

/**
 * Renders the real conversation provider against a fake RTVI event bus and a
 * fake client whose `sendText()` resolves to "msg-1", "msg-2", and so on.
 */
function renderConversation(
  sendText: (text: string, options?: unknown) => Promise<string> = (() => {
    let count = 0;
    return async () => `msg-${++count}`;
  })()
) {
  const store = createStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();
  const client = { sendText: jest.fn(sendText) };
  const probe: { conversation?: Conversation; updated: ConversationMessage[] } =
    { updated: [] };

  const ProbeView = () => {
    probe.conversation = usePipecatConversation({
      onMessageUpdated: (message) => probe.updated.push(message),
    });
    return null;
  };

  render(
    <Provider store={store}>
      <PipecatClientContext.Provider
        value={{ client: client as unknown as PipecatClient }}
      >
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
      </PipecatClientContext.Provider>
    </Provider>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emit = (event: RTVIEvent, data?: any) => {
    act(() => {
      handlers.get(event)?.forEach((handler) => handler(data));
    });
  };

  const advance = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };

  // Errors are rethrown outside act(), which skips rendering when it rejects.
  const send = async (text: string) => {
    let msgId: string | undefined;
    let error: unknown;
    await act(async () => {
      try {
        msgId = await probe.conversation!.sendText(text);
      } catch (e) {
        error = e;
      }
    });
    if (error) throw error;
    return msgId;
  };

  const ack = (msg_id: string, text = "Hello.") =>
    emit(RTVIEvent.UserInput, {
      text,
      input_type: "chat",
      timestamp: "2026-10-09T00:00:00.000Z",
      final: true,
      msg_id,
    });

  return {
    emit,
    advance,
    send,
    ack,
    client,
    probe,
    messages: () => probe.conversation!.messages,
  };
}

const summarize = (messages: ConversationMessage[]) =>
  messages.map((m) => ({
    role: m.role,
    text: m.parts.map((p) => p.text).join(""),
    msgId: m.msgId,
    status: m.status,
  }));

describe("conversation sendText", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks text received when the bot acknowledges it", async () => {
    const c = renderConversation();
    c.emit(RTVIEvent.BotReady, { version: "2.2.0" });

    const msgId = await c.send("Hello.");

    expect(msgId).toBe("msg-1");
    expect(c.client.sendText).toHaveBeenCalledWith("Hello.", undefined);
    expect(summarize(c.messages())).toEqual([
      { role: "user", text: "Hello.", msgId: "msg-1", status: "sent" },
    ]);

    c.ack("msg-1");

    expect(summarize(c.messages())).toEqual([
      { role: "user", text: "Hello.", msgId: "msg-1", status: "received" },
    ]);
    expect(c.probe.updated.map((m) => m.status)).toEqual(["received"]);
  });

  it("ignores acknowledgments of text it didn't send", () => {
    const c = renderConversation();
    c.emit(RTVIEvent.BotReady, { version: "2.2.0" });
    act(() => {
      c.probe.conversation!.injectMessage({
        role: "user",
        parts: [{ text: "Hello.", final: true, createdAt: "" }],
      });
    });

    c.ack("abc12345");

    expect(summarize(c.messages())).toEqual([
      { role: "user", text: "Hello.", msgId: undefined, status: undefined },
    ]);
  });

  it("marks text failed when the bot doesn't acknowledge it in time", async () => {
    const c = renderConversation();
    c.emit(RTVIEvent.BotReady, { version: "2.2.0" });
    await c.send("Hello.");

    c.advance(10_000);
    expect(c.messages()[0].status).toBe("failed");

    // A late acknowledgment still means the bot received it.
    c.ack("msg-1");
    expect(c.messages()[0].status).toBe("received");
  });

  it("marks text awaiting acknowledgment failed when the client disconnects", async () => {
    const c = renderConversation();
    c.emit(RTVIEvent.BotReady, { version: "2.2.0" });
    await c.send("Hello.");
    await c.send("Are you there?");
    c.ack("msg-1");

    c.emit(RTVIEvent.Disconnected);

    expect(c.messages().map((m) => m.status)).toEqual(["received", "failed"]);
  });

  it("leaves text sent for a bot that doesn't acknowledge it", async () => {
    const c = renderConversation();
    c.emit(RTVIEvent.BotReady, { version: "2.1.0" });
    await c.send("Hello.");

    c.advance(10_000);
    c.emit(RTVIEvent.Disconnected);

    expect(c.messages()[0].status).toBe("sent");
  });

  it("adds text as failed and rethrows when it can't be sent", async () => {
    const error = new Error("transport not ready");
    const c = renderConversation(async () => {
      throw error;
    });
    c.emit(RTVIEvent.BotReady, { version: "2.2.0" });

    await expect(c.send("Hello.")).rejects.toBe(error);

    expect(summarize(c.messages())).toEqual([
      { role: "user", text: "Hello.", msgId: undefined, status: "failed" },
    ]);
  });

  it("keeps sent text apart from what the user is saying", async () => {
    const c = renderConversation();
    c.emit(RTVIEvent.BotReady, { version: "2.2.0" });
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.emit(RTVIEvent.UserTranscript, { text: "So I was", final: false });
    c.advance(100);

    await c.send("Hello.");

    expect(summarize(c.messages())).toEqual([
      { role: "user", text: "So I was", msgId: undefined, status: undefined },
      { role: "user", text: "Hello.", msgId: "msg-1", status: "sent" },
    ]);
  });
});
