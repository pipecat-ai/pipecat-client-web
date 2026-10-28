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
import { PipecatConversationProvider } from "@/conversation/PipecatConversationProvider";
import type { ConversationMessage } from "@/conversation/types";
import { findLast } from "@/conversation/utils";
import { RTVIEventContext } from "@/RTVIEventContext";

import { sentence } from "../helpers/fixtures";

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
        <PipecatConversationProvider>{null}</PipecatConversationProvider>
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

  return {
    emit,
    advance,
    getMessages,
    getAssistantMessages: () =>
      getMessages().filter((m: ConversationMessage) => m.role === "assistant"),
    /** The speech-progress cursor of the last assistant message, if any. */
    getLastAssistantCursor: () => {
      const lastAssistant = findLast(
        getMessages(),
        (m: ConversationMessage) => m.role === "assistant"
      );
      if (!lastAssistant) return undefined;
      return store.get(botOutputMessageStateAtom).get(lastAssistant.createdAt);
    },
  };
}

/** Delay the wiring waits after BotStoppedSpeaking before finalizing. */
const FINALIZE_DELAY_MS = 2500;

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

  describe("RTVI 2.0.0+ bot interruption", () => {
    const GREETING = "Hi there, how can I help you today?";

    /**
     * Starts a v2 session with the bot mid-sentence: it has voiced "Hi there,"
     * of the greeting and no finalize timer is armed.
     */
    function startMidSentenceTurn() {
      const w = renderWiring();
      w.emit(RTVIEvent.BotReady, { version: "2.1.0" });
      w.emit(RTVIEvent.BotStartedSpeaking);
      w.emit(
        RTVIEvent.BotOutput,
        sentence(GREETING, 1, { spoken_status: "new" })
      );
      w.emit(
        RTVIEvent.BotOutput,
        sentence(GREETING, 1, {
          spoken_status: "in-progress",
          spoken_progress: {
            accumulated_text: "Hi there,",
            remaining_text: " how can I help you today?",
          },
        })
      );
      return w;
    }

    it("ends the bot's turn", () => {
      const w = startMidSentenceTurn();
      expect(w.getAssistantMessages()[0].final).toBeFalsy();

      w.emit(RTVIEvent.BotInterrupted);

      expect(w.getAssistantMessages()[0].final).toBe(true);
    });

    it("opens a new message for the bot's next output", () => {
      // Text sent with run_immediately interrupts the bot without any
      // UserStartedSpeaking or user message, so BotInterrupted is the only
      // turn boundary, and the cut-off message must not be reopened as a
      // premature finalization.
      const w = startMidSentenceTurn();
      w.emit(RTVIEvent.BotInterrupted);

      w.emit(RTVIEvent.BotStartedSpeaking);
      w.emit(
        RTVIEvent.BotOutput,
        sentence("No problem.", 2, { spoken_status: "new" })
      );

      const assistant = w.getAssistantMessages();
      expect(assistant).toHaveLength(2);
      expect(assistant[0].parts.map((p) => p.text)).toEqual([GREETING]);
      expect(assistant[1].parts.map((p) => p.text)).toEqual(["No problem."]);
      expect(assistant[1].final).toBeFalsy();
    });

    it("leaves the speech cursor where the interruption stopped it", () => {
      const w = startMidSentenceTurn();
      w.emit(RTVIEvent.BotInterrupted);

      // The tail was never voiced, so it must not be shown as spoken.
      expect(w.getLastAssistantCursor()).toMatchObject({
        currentPartIndex: 0,
        currentCharIndex: "Hi there,".length,
      });
    });

    it("cancels a pending finalize timer so it can't end the next turn", () => {
      const w = startMidSentenceTurn();
      w.emit(RTVIEvent.BotStoppedSpeaking);
      w.advance(500);

      w.emit(RTVIEvent.BotInterrupted);
      expect(w.getAssistantMessages()[0].final).toBe(true);

      w.emit(RTVIEvent.BotStartedSpeaking);
      w.emit(
        RTVIEvent.BotOutput,
        sentence("No problem.", 2, { spoken_status: "new" })
      );
      w.advance(FINALIZE_DELAY_MS);

      const assistant = w.getAssistantMessages();
      expect(assistant).toHaveLength(2);
      expect(assistant[1].final).toBeFalsy();
    });

    it("does nothing when the bot's last turn is already over", () => {
      const w = startMidSentenceTurn();
      w.emit(RTVIEvent.BotStoppedSpeaking);
      w.advance(FINALIZE_DELAY_MS);
      const before = w.getMessages();

      w.emit(RTVIEvent.BotInterrupted);

      expect(w.getMessages()).toBe(before);
    });

    it("does nothing before the bot has said anything", () => {
      const w = renderWiring();
      w.emit(RTVIEvent.BotReady, { version: "2.1.0" });

      w.emit(RTVIEvent.BotInterrupted);

      expect(w.getMessages()).toEqual([]);
    });
  });

  // Real 1.4.x bots only send `aggregated_by`, so these exercise the fallback.
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

    it("appends consecutive unspoken words into one part", () => {
      const w = renderWiring();
      w.emit(RTVIEvent.BotReady, { version: "1.4.0" });
      w.emit(RTVIEvent.BotOutput, {
        text: "Hello",
        aggregated_by: "word",
        spoken: false,
      });
      w.emit(RTVIEvent.BotOutput, {
        text: "there",
        aggregated_by: "word",
        spoken: false,
      });

      const parts = w.getAssistantMessages()[0].parts ?? [];
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe("Hello there");
    });
  });
});
