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

import {
  botOutputMessageStateAtom,
  messagesAtom,
} from "@/conversation/conversationAtoms";
import {
  PipecatConversationProvider,
  useConversationContext,
} from "@/conversation/PipecatConversationProvider";
import type {
  ConversationMessage,
  ConversationMessagePart,
} from "@/conversation/types";
import { RTVIEventContext } from "@/RTVIEventContext";

/**
 * Renders the real event wiring (via PipecatConversationProvider) against a
 * fake RTVI event bus, so these tests exercise
 * `useConversationEventWiring` itself rather than a hand-written mirror of it.
 */
function renderWiring() {
  const store = createStore();
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

  let injectMessage: ReturnType<
    typeof useConversationContext
  >["injectMessage"];

  const CaptureContext = () => {
    injectMessage = useConversationContext().injectMessage;
    return null;
  };

  render(
    <Provider store={store}>
      <RTVIEventContext.Provider
        value={{
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          on: on as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          off: off as any,
        }}
      >
        <PipecatConversationProvider>
          <CaptureContext />
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

  const getMessages = () => store.get(messagesAtom);

  const inject = (
    role: "user" | "assistant" | "system",
    parts: ConversationMessagePart[]
  ) => {
    act(() => {
      injectMessage({ role, parts });
    });
  };

  return {
    emit,
    advance,
    inject,
    getMessages,
    getAssistantMessages: () =>
      getMessages().filter((m: ConversationMessage) => m.role === "assistant"),
    getLastAssistantCursor: () => {
      const lastAssistant = [...getMessages()]
        .reverse()
        .find((m: ConversationMessage) => m.role === "assistant");
      if (!lastAssistant) return undefined;
      return store.get(botOutputMessageStateAtom).get(lastAssistant.createdAt);
    },
  };
}

/** Delay the wiring waits after BotStoppedSpeaking before finalizing. */
const FINALIZE_DELAY_MS = 2500;

const sentence = (
  text: string,
  segment_id: number,
  extra: Record<string, unknown> = {}
) => ({
  text,
  aggregated_by: "sentence",
  will_be_spoken: true,
  segment_id,
  ...extra,
});

describe("useConversationEventWiring", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("RTVI 2.0.0+ turn continuity", () => {
    /**
     * Starts a v2 session with the bot mid-turn, having spoken one sentence.
     */
    function startV2Turn() {
      const w = renderWiring();
      w.emit(RTVIEvent.BotReady, { version: "2.1.0" });
      w.emit(RTVIEvent.BotStartedSpeaking);
      w.emit(
        RTVIEvent.BotOutput,
        sentence("Hi there!", 1, {
          spoken_status: "new",
        })
      );
      w.emit(
        RTVIEvent.BotOutput,
        sentence("Hi there!", 1, {
          spoken_status: "completed",
          spoken_progress: {
            accumulated_text: "Hi there!",
            remaining_text: "",
          },
        })
      );
      return w;
    }

    it("keeps a multi-sentence turn in a single assistant message", () => {
      const w = startV2Turn();
      w.emit(
        RTVIEvent.BotOutput,
        sentence("How can I help you today?", 2, {
          spoken_status: "new",
        })
      );

      const assistant = w.getAssistantMessages();
      expect(assistant).toHaveLength(1);
      expect(assistant[0].parts.map((p) => p.text)).toEqual([
        "Hi there!",
        "How can I help you today?",
      ]);
    });

    it("leaves the turn open until BotStoppedSpeaking settles", () => {
      const w = startV2Turn();
      expect(w.getAssistantMessages()[0].final).toBeFalsy();

      w.emit(RTVIEvent.BotStoppedSpeaking);
      w.advance(FINALIZE_DELAY_MS - 1);
      expect(w.getAssistantMessages()[0].final).toBeFalsy();

      w.advance(1);
      expect(w.getAssistantMessages()[0].final).toBe(true);
    });

    it("finalizes the turn when the user interrupts", () => {
      const w = startV2Turn();
      w.emit(RTVIEvent.UserStartedSpeaking);

      expect(w.getAssistantMessages()[0].final).toBe(true);
    });

    it("re-arms the finalize timer for a BotOutput trailing BotStoppedSpeaking", () => {
      const w = startV2Turn();
      w.emit(RTVIEvent.BotStoppedSpeaking);
      w.advance(FINALIZE_DELAY_MS - 500);

      // A late progress event postpones finalization; it must not cancel it
      // outright, or the turn would stay open until the user speaks again.
      w.emit(
        RTVIEvent.BotOutput,
        sentence("Hi there!", 1, {
          spoken_status: "completed",
          spoken_progress: {
            accumulated_text: "Hi there!",
            remaining_text: "",
          },
        })
      );
      w.advance(FINALIZE_DELAY_MS - 1);
      expect(w.getAssistantMessages()[0].final).toBeFalsy();

      w.advance(1);
      expect(w.getAssistantMessages()[0].final).toBe(true);
    });

    it("opens a new message for the turn after a finalized one", () => {
      const w = startV2Turn();
      w.emit(RTVIEvent.BotStoppedSpeaking);
      w.advance(FINALIZE_DELAY_MS);

      w.emit(RTVIEvent.BotStartedSpeaking);
      w.emit(
        RTVIEvent.BotOutput,
        sentence("Second turn.", 2, {
          spoken_status: "new",
        })
      );

      expect(w.getAssistantMessages()).toHaveLength(2);
    });
  });

  describe("RTVI 2.0.0+ text-input turn boundaries", () => {
    const userText = (text: string): ConversationMessagePart[] => [
      { text, final: true, createdAt: new Date().toISOString() },
    ];

    /**
     * Text input reaches the bot through `sendText`, which produces no
     * UserStartedSpeaking, and the bot is mid-utterance, so no finalize timer
     * is armed. Injecting the user's message is the only turn boundary the
     * conversation ever sees.
     */
    function startInterruptedV2Turn() {
      const w = renderWiring();
      w.emit(RTVIEvent.BotReady, { version: "2.1.0" });
      w.emit(RTVIEvent.BotStartedSpeaking);
      w.emit(
        RTVIEvent.BotOutput,
        sentence("Hi there, how can I help you today?", 1, {
          spoken_status: "new",
        })
      );
      w.emit(
        RTVIEvent.BotOutput,
        sentence("Hi there, how can I help you today?", 1, {
          spoken_status: "in-progress",
          spoken_progress: {
            accumulated_text: "Hi there,",
            remaining_text: " how can I help you today?",
          },
        })
      );
      return w;
    }

    it("finalizes the open turn when a user message is injected", () => {
      const w = startInterruptedV2Turn();
      expect(w.getAssistantMessages()[0].final).toBeFalsy();

      w.inject("user", userText("actually, never mind"));

      expect(w.getAssistantMessages()[0].final).toBe(true);
    });

    it("opens a new message for the reply to injected text", () => {
      const w = startInterruptedV2Turn();
      w.inject("user", userText("actually, never mind"));

      w.emit(RTVIEvent.BotStartedSpeaking);
      w.emit(
        RTVIEvent.BotOutput,
        sentence("No problem.", 2, {
          spoken_status: "new",
        })
      );

      const assistant = w.getAssistantMessages();
      expect(assistant).toHaveLength(2);
      expect(assistant[1].parts.map((p) => p.text)).toEqual(["No problem."]);
    });

    it("leaves the speech cursor where the interruption stopped it", () => {
      const w = startInterruptedV2Turn();
      w.inject("user", userText("actually, never mind"));

      // Finalizing must not snap the cursor to the end: the turn was cut off,
      // so the unspoken tail stays unspoken.
      expect(w.getLastAssistantCursor()!.currentCharIndex).toBe(
        "Hi there,".length
      );
    });

    it("does not finalize the turn for an injected system message", () => {
      const w = startInterruptedV2Turn();
      w.inject("system", userText("connection is unstable"));

      expect(w.getAssistantMessages()[0].final).toBeFalsy();
      expect(w.getAssistantMessages()).toHaveLength(1);
    });
  });

  describe("legacy 1.4.x path", () => {
    it("still finalizes per sentence", () => {
      const w = renderWiring();
      w.emit(RTVIEvent.BotReady, { version: "1.4.0" });
      w.emit(RTVIEvent.BotOutput, {
        text: "Hello there.",
        aggregated_by: "sentence",
        spoken: true,
      });

      expect(w.getAssistantMessages()[0].final).toBe(true);
    });

    it("does not finalize a non-sentence aggregation", () => {
      const w = renderWiring();
      w.emit(RTVIEvent.BotReady, { version: "1.4.0" });
      w.emit(RTVIEvent.BotOutput, {
        text: "Hello",
        aggregated_by: "word",
        spoken: true,
      });

      expect(w.getAssistantMessages()[0].final).toBeFalsy();
    });
  });
});
