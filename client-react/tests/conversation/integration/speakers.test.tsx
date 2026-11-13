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
import {
  RTVIEvent,
  type TranscriptionSpeaker,
  type UserPerceptionSignal,
} from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import { createStore, Provider } from "jotai";

import { PipecatConversationProvider } from "@/conversation/PipecatConversationProvider";
import type { ConversationMessage } from "@/conversation/types";
import { RTVIEventContext } from "@/RTVIEventContext";
import { usePipecatConversation } from "@/usePipecatConversation";

type Probe = {
  messages: ConversationMessage[];
  created: ConversationMessage[];
};

const A: TranscriptionSpeaker = { label: "A", number: 1 };
const B: TranscriptionSpeaker = { label: "B", number: 2 };

/**
 * Renders the real event wiring against a fake RTVI event bus, with one
 * conversation hook as it is by default and one with `splitBySpeaker`.
 */
function renderConversation() {
  const store = createStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();
  const probes: Record<"default" | "split", Probe> = {
    default: { messages: [], created: [] },
    split: { messages: [], created: [] },
  };

  const ProbeView = ({
    probe,
    splitBySpeaker,
  }: {
    probe: Probe;
    splitBySpeaker?: boolean;
  }) => {
    const { messages } = usePipecatConversation({
      splitBySpeaker,
      onMessageCreated: (m) => probe.created.push(m),
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
          <ProbeView probe={probes.split} splitBySpeaker />
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

  const userInput = (
    text: string,
    final: boolean,
    speaker?: TranscriptionSpeaker,
    perception?: UserPerceptionSignal[]
  ) => {
    // A transcription a moment after the last, so each part gets its own time.
    jest.advanceTimersByTime(10);
    emit(RTVIEvent.UserInput, {
      text,
      input_type: "transcription",
      timestamp: "2026-11-11T00:00:00.000Z",
      final,
      user_id: "user",
      ...(speaker && { speaker }),
      ...(perception && { perception }),
    });
  };

  const userMessages = (probe: Probe) =>
    probe.messages.filter((m) => m.role === "user");

  return { emit, userInput, probes, userMessages };
}

describe("diarized user turns", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps one user message for the turn, with each part's speaker and perception", () => {
    const c = renderConversation();
    const tone: UserPerceptionSignal[] = [
      { name: "tone", labels: [{ label: "calm", confidence: 0.8 }] },
    ];
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.userInput("My favorite fruit is the apple.", true, A, tone);
    c.userInput("Mine is the banana.", true, B);

    const [message] = c.userMessages(c.probes.default);
    expect(c.userMessages(c.probes.default)).toHaveLength(1);
    expect(message).not.toHaveProperty("speaker");
    expect(message.parts.map((p) => [p.text, p.speaker])).toEqual([
      ["My favorite fruit is the apple.", A],
      ["Mine is the banana.", B],
    ]);
    expect(message.parts[0].perception).toEqual(tone);
    expect(message.parts[1]).not.toHaveProperty("perception");
  });

  it("splits the turn into a message per speaker run with splitBySpeaker", () => {
    const c = renderConversation();
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.userInput("My favorite fruit is the apple.", true, A);
    c.userInput("It's crunchy.", true, A);
    c.userInput("Mine is the banana.", true, B);
    c.userInput("And mine", false, A);

    const split = c.userMessages(c.probes.split);
    expect(
      split.map((m) => [m.speaker, m.final, m.parts.map((p) => p.text)])
    ).toEqual([
      [A, true, ["My favorite fruit is the apple.", "It's crunchy."]],
      [B, true, ["Mine is the banana."]],
      [A, false, ["And mine"]],
    ]);
  });

  it("still reports the whole turn as one message to onMessageCreated", () => {
    const c = renderConversation();
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.userInput("My favorite fruit is the apple.", true, A);
    c.userInput("Mine is the banana.", true, B);

    const userCreated = c.probes.split.created.filter((m) => m.role === "user");
    expect(userCreated).toHaveLength(1);
  });
});
