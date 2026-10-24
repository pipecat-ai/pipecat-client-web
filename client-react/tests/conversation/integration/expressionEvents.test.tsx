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
import { RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";

import { botOutputMessageStateAtom } from "@/conversation/conversationAtoms";
import { PipecatConversationProvider } from "@/conversation/PipecatConversationProvider";
import type {
  BotOutputText,
  ConversationMessage,
  ConversationMessagePart,
} from "@/conversation/types";
import { RTVIEventContext } from "@/RTVIEventContext";
import { usePipecatConversation } from "@/usePipecatConversation";

type Probe = { messages: ConversationMessage[] };

/**
 * Renders the real event wiring against a fake RTVI event bus, with two
 * conversation hooks: one with the default options and one that includes
 * expression events.
 */
function renderConversation() {
  const store = createStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();
  const probes: Record<"default" | "included", Probe> = {
    default: { messages: [] },
    included: { messages: [] },
  };

  const ProbeView = ({
    probe,
    includeExpressionEvents,
  }: {
    probe: Probe;
    includeExpressionEvents?: boolean;
  }) => {
    const { messages } = usePipecatConversation({ includeExpressionEvents });
    probe.messages = messages;
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
          <ProbeView probe={probes.default} />
          <ProbeView probe={probes.included} includeExpressionEvents />
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

  const advance = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };

  return {
    emit,
    advance,
    probes,
    getCursors: () => store.get(botOutputMessageStateAtom),
  };
}

/** Each part of the bot's messages as its output type and spoken/unspoken text. */
const summarize = (messages: ConversationMessage[]) =>
  messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.parts)
    .map((part: ConversationMessagePart) => {
      const text = part.text as BotOutputText;
      return [part.outputType, text.spoken, text.unspoken];
    });

const segment = (
  text: string,
  segment_id: number,
  output_type: string,
  extra: Record<string, unknown> = {}
) => ({
  text,
  output_type,
  will_be_spoken: true,
  segment_id,
  ...extra,
});

const progress = (accumulated_text: string, remaining_text: string) => ({
  spoken_status: "in-progress",
  spoken_progress: { accumulated_text, remaining_text },
});

const performed = (text: string, segment_id: number, output_type: string) =>
  segment(text, segment_id, output_type, {
    spoken_status: "completed",
    spoken_progress: { accumulated_text: text, remaining_text: "" },
  });

/**
 * The bot says "It's back up.", laughing after "It's", with word timestamps.
 */
function laughMidSentence() {
  const w = renderConversation();
  w.emit(RTVIEvent.BotReady, { version: "2.3.0" });
  w.emit(RTVIEvent.BotStartedSpeaking);
  w.emit(
    RTVIEvent.BotOutput,
    segment("It's back up.", 1, "sentence", { spoken_status: "new" })
  );
  w.emit(
    RTVIEvent.BotOutput,
    segment("It's back up.", 1, "sentence", progress("It's", " back up."))
  );
  w.advance(100);
  w.emit(RTVIEvent.BotOutput, performed("laughs", 2, "expression_event"));
  w.emit(
    RTVIEvent.BotOutput,
    segment("It's back up.", 1, "sentence", progress("It's back", " up."))
  );
  return w;
}

describe("expression events", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps expression events out of the conversation by default", () => {
    const w = laughMidSentence();

    expect(summarize(w.probes.default.messages)).toEqual([
      ["sentence", "It's back", " up."],
    ]);
  });

  it("places an event where the bot's speech had reached with includeExpressionEvents", () => {
    const w = laughMidSentence();

    expect(summarize(w.probes.included.messages)).toEqual([
      ["sentence", "It's", ""],
      ["expression_event", "laughs", ""],
      ["sentence", " back", " up."],
    ]);
  });

  it("leaves the speech cursor where the words put it", () => {
    const w = laughMidSentence();
    const [cursor] = [...w.getCursors().values()];

    expect(cursor.currentCharIndex).toBe("It's back".length);
  });

  it("places an event between sentences before the next one", () => {
    const w = renderConversation();
    w.emit(RTVIEvent.BotReady, { version: "2.3.0" });
    w.emit(RTVIEvent.BotStartedSpeaking);
    w.emit(
      RTVIEvent.BotOutput,
      segment("Hi.", 1, "sentence", { spoken_status: "new" })
    );
    w.emit(
      RTVIEvent.BotOutput,
      segment("Bye.", 2, "sentence", { spoken_status: "new" })
    );
    w.emit(RTVIEvent.BotOutput, performed("Hi.", 1, "sentence"));
    w.emit(RTVIEvent.BotOutput, performed("300", 3, "expression_pause"));

    expect(summarize(w.probes.included.messages)).toEqual([
      ["sentence", "Hi.", ""],
      ["expression_pause", "300", ""],
      // The separator before a later sentence is shown with its spoken text.
      ["sentence", " ", "Bye."],
    ]);
  });

  it("places an event after the last words at the end", () => {
    const w = renderConversation();
    w.emit(RTVIEvent.BotReady, { version: "2.3.0" });
    w.emit(RTVIEvent.BotStartedSpeaking);
    w.emit(
      RTVIEvent.BotOutput,
      segment("See you!", 1, "sentence", { spoken_status: "new" })
    );
    w.emit(RTVIEvent.BotOutput, performed("See you!", 1, "sentence"));
    w.emit(RTVIEvent.BotOutput, performed("laughs", 2, "expression_event"));

    expect(summarize(w.probes.included.messages)).toEqual([
      ["sentence", "See you!", ""],
      ["expression_event", "laughs", ""],
    ]);
  });

  it("clears expression events when the client connects again", () => {
    const w = laughMidSentence();
    w.emit(RTVIEvent.Connected);

    expect(w.probes.included.messages).toEqual([]);
  });
});
