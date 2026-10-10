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

import { messagesAtom } from "@/conversation/conversationAtoms";
import { PipecatConversationProvider } from "@/conversation/PipecatConversationProvider";
import type {
  BotOutputText,
  ConversationMessage,
  ConversationMessagePart,
} from "@/conversation/types";
import { RTVIEventContext } from "@/RTVIEventContext";
import { usePipecatConversation } from "@/usePipecatConversation";

type Probe = {
  messages: ConversationMessage[];
  created: ConversationMessage[];
};

/**
 * Renders the real event wiring against a fake RTVI event bus, with two
 * conversation hooks: one with the default options and one that includes
 * backchannels.
 */
function renderConversation() {
  const store = createStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();
  const probes: Record<"default" | "included", Probe> = {
    default: { messages: [], created: [] },
    included: { messages: [], created: [] },
  };

  const ProbeView = ({
    probe,
    includeBackchannel,
  }: {
    probe: Probe;
    includeBackchannel?: boolean;
  }) => {
    const { messages } = usePipecatConversation({
      includeBackchannel,
      onMessageCreated: (message) => probe.created.push(message),
    });
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
          <ProbeView probe={probes.included} includeBackchannel />
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

  // Each step moves the clock on, so every message gets its own createdAt.
  const advance = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };

  return {
    emit,
    advance,
    probes,
    getStoredMessages: () => store.get(messagesAtom),
  };
}

const partText = (part: ConversationMessagePart): string => {
  if (typeof part.text === "string") return part.text;
  const text = part.text as BotOutputText;
  return text.spoken + text.unspoken;
};

const summarize = (messages: ConversationMessage[]) =>
  messages.map((m) => ({
    role: m.role,
    backchannel: m.backchannel ?? false,
    text: m.parts.map(partText).join(""),
  }));

const segment = (
  text: string,
  segment_id: number,
  text_type: string,
  extra: Record<string, unknown> = {}
) => ({
  text,
  text_type,
  aggregated_by: text_type,
  will_be_spoken: true,
  segment_id,
  ...extra,
});

/**
 * The bot says "Hi there!", then says "Mm-hmm." while the user is talking.
 */
function backchannelWhileUserTalks() {
  const w = renderConversation();
  w.emit(RTVIEvent.BotReady, { version: "2.2.0" });
  w.emit(RTVIEvent.BotStartedSpeaking);
  w.emit(
    RTVIEvent.BotOutput,
    segment("Hi there!", 1, "sentence", { spoken_status: "new" })
  );
  w.emit(
    RTVIEvent.BotOutput,
    segment("Hi there!", 1, "sentence", {
      spoken_status: "completed",
      spoken_progress: { accumulated_text: "Hi there!", remaining_text: "" },
    })
  );
  w.emit(RTVIEvent.BotStoppedSpeaking);
  w.advance(3000);

  w.emit(RTVIEvent.UserStartedSpeaking);
  w.advance(100);
  w.emit(RTVIEvent.UserTranscript, { text: "So I was thinking", final: false });
  w.advance(100);

  w.emit(RTVIEvent.BotStartedSpeaking);
  w.emit(
    RTVIEvent.BotOutput,
    segment("Mm-hmm.", 2, "backchannel", { spoken_status: "new" })
  );
  w.emit(
    RTVIEvent.BotOutput,
    segment("Mm-hmm.", 2, "backchannel", {
      spoken_status: "in-progress",
      spoken_progress: { accumulated_text: "Mm-hmm.", remaining_text: "" },
    })
  );
  w.emit(
    RTVIEvent.BotOutput,
    segment("Mm-hmm.", 2, "backchannel", {
      spoken_status: "completed",
      spoken_progress: { accumulated_text: "Mm-hmm.", remaining_text: "" },
    })
  );
  w.emit(RTVIEvent.BotStoppedSpeaking);
  w.advance(100);
  return w;
}

describe("backchannels", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps a bot backchannel out of the conversation by default", () => {
    const w = backchannelWhileUserTalks();

    expect(summarize(w.probes.default.messages)).toEqual([
      { role: "assistant", backchannel: false, text: "Hi there!" },
      { role: "user", backchannel: false, text: "So I was thinking" },
    ]);
  });

  it("keeps a bot backchannel out of the bot's turns", () => {
    const w = backchannelWhileUserTalks();
    w.emit(RTVIEvent.UserTranscript, {
      text: "So I was thinking about dinner.",
      final: true,
    });
    w.emit(RTVIEvent.UserStoppedSpeaking);
    w.advance(100);
    w.emit(RTVIEvent.BotStartedSpeaking);
    w.emit(
      RTVIEvent.BotOutput,
      segment("How about pasta?", 3, "sentence", { spoken_status: "new" })
    );

    expect(summarize(w.getStoredMessages())).toEqual([
      { role: "assistant", backchannel: false, text: "Hi there!" },
      {
        role: "user",
        backchannel: false,
        text: "So I was thinking about dinner.",
      },
      { role: "assistant", backchannel: false, text: "How about pasta?" },
    ]);
  });

  it("includes backchannels by when they were said with includeBackchannel", () => {
    const w = backchannelWhileUserTalks();

    expect(summarize(w.probes.included.messages)).toEqual([
      { role: "assistant", backchannel: false, text: "Hi there!" },
      { role: "user", backchannel: false, text: "So I was thinking" },
      { role: "assistant", backchannel: true, text: "Mm-hmm." },
    ]);
  });

  it("includes a user backchannel with includeBackchannel", () => {
    const w = renderConversation();
    w.emit(RTVIEvent.BotReady, { version: "2.2.0" });
    w.emit(RTVIEvent.UserInput, {
      text: "mhm",
      input_type: "backchannel",
      timestamp: "2026-10-09T00:00:00.000Z",
      final: true,
      user_id: "user",
    });

    expect(summarize(w.probes.default.messages)).toEqual([]);
    expect(summarize(w.probes.included.messages)).toEqual([
      { role: "user", backchannel: true, text: "mhm" },
    ]);
  });

  it("reports backchannels to onMessageCreated only with includeBackchannel", () => {
    const w = backchannelWhileUserTalks();

    expect(w.probes.default.created.some((m) => m.backchannel)).toBe(false);
    expect(
      summarize(w.probes.included.created.filter((m) => m.backchannel))
    ).toEqual([{ role: "assistant", backchannel: true, text: "Mm-hmm." }]);
  });

  it("clears backchannels when the client connects again", () => {
    const w = backchannelWhileUserTalks();
    w.emit(RTVIEvent.Connected);

    expect(w.probes.included.messages).toEqual([]);
  });
});
