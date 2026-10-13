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
import type { ConversationMessage } from "@/conversation/types";
import { RTVIEventContext } from "@/RTVIEventContext";

/**
 * Renders the real event wiring against a fake RTVI event bus.
 */
function renderConversation() {
  const store = createStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(data?: any) => void>>();

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

  const userInput = (text: string, final: boolean) =>
    emit(RTVIEvent.UserInput, {
      text,
      input_type: "transcription",
      timestamp: "2026-10-09T00:00:00.000Z",
      final,
      user_id: "user",
    });

  const userTranscript = (text: string, final: boolean) =>
    emit(RTVIEvent.UserTranscript, {
      text,
      final,
      timestamp: "2026-10-09T00:00:00.000Z",
      user_id: "user",
    });

  return {
    emit,
    userInput,
    userTranscript,
    getUserTexts: () =>
      store
        .get(messagesAtom)
        .filter((m: ConversationMessage) => m.role === "user")
        .map((m: ConversationMessage) => m.parts.map((p) => p.text).join("")),
  };
}

describe("user transcriptions", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds the user's turn from user-input without adding user-transcription too", () => {
    const c = renderConversation();
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.userInput("So I was", false);
    c.userTranscript("So I was", false);
    c.userInput("So I was thinking.", true);
    c.userTranscript("So I was thinking.", true);

    expect(c.getUserTexts()).toEqual(["So I was thinking."]);
  });

  it("builds the user's turn from user-input alone", () => {
    const c = renderConversation();
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.userInput("So I was thinking.", true);

    expect(c.getUserTexts()).toEqual(["So I was thinking."]);
  });

  it("builds the user's turn from user-transcription when the bot sends no user-input", () => {
    const c = renderConversation();
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.userTranscript("So I was", false);
    c.userTranscript("So I was thinking.", true);

    expect(c.getUserTexts()).toEqual(["So I was thinking."]);
  });

  it("builds the user's turn from user-transcription again after reconnecting", () => {
    const c = renderConversation();
    c.userInput("Hello.", true);
    c.emit(RTVIEvent.Connected);
    c.emit(RTVIEvent.UserStartedSpeaking);
    c.userTranscript("Hello again.", true);

    expect(c.getUserTexts()).toEqual(["Hello again."]);
  });
});
