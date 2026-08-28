/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { SendTextOptions } from "@pipecat-ai/client-js";
import { useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import React, { createContext, useCallback, useContext } from "react";

import { injectMessage as injectMessageAction } from "./conversationActions";
import { botOutputSupportedAtom } from "./conversationAtoms";
import type { ConversationMessagePart } from "./types";
import { useConversationEventWiring } from "./useConversationEventWiring";
import { useSentText } from "./useSentText";

interface ConversationContextValue {
  injectMessage: (message: {
    role: "user" | "assistant" | "system";
    parts: ConversationMessagePart[];
  }) => void;
  /**
   * Sends text to the bot and adds it to the conversation as a user message,
   * whose `status` follows whether the bot received it: `sent`, then
   * `received` once the bot acknowledges it, or `failed` if it couldn't be
   * sent. Use it in place of `injectMessage` plus `client.sendText()`, not
   * alongside them.
   *
   * @returns The id of the send-text message, also the message's `msgId`.
   */
  sendText: (text: string, options?: SendTextOptions) => Promise<string>;
  /**
   * Whether BotOutput events are supported (RTVI 1.1.0+)
   * null = unknown (before BotReady), true = supported, false = not supported
   */
  botOutputSupported: boolean | null;
}

export const ConversationContext =
  createContext<ConversationContextValue | null>(null);

export const PipecatConversationProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { finalizeLastAssistantMessageIfPending } =
    useConversationEventWiring();
  const sendText = useSentText();

  const injectMessage = useAtomCallback(
    useCallback((get, set, message: {
      role: "user" | "assistant" | "system";
      parts: ConversationMessagePart[];
    }) => {
      // An injected message is a turn boundary the RTVI events never report:
      // text input reaches the bot through `sendText`, so there is no
      // UserStartedSpeaking to close the assistant's turn, and the bot was
      // likely mid-utterance, so the BotStoppedSpeaking finalize timer is not
      // armed either. Without this the next BotOutput reopens the still-open
      // message and the following turn is appended to the previous one.
      //
      // System messages are excluded: `injectMessage` deliberately backdates
      // them behind an in-flight assistant message so they don't split it.
      //
      // Finalizing here mirrors the UserStartedSpeaking path, which likewise
      // leaves the speech cursor where it stopped — the turn was interrupted,
      // so unspoken text must stay unspoken.
      if (message.role !== "system") {
        finalizeLastAssistantMessageIfPending();
      }
      injectMessageAction(get, set, message);
    }, [finalizeLastAssistantMessageIfPending])
  );

  const botOutputSupported = useAtomValue(botOutputSupportedAtom);

  return (
    <ConversationContext.Provider value={{ injectMessage, sendText, botOutputSupported }}>
      {children}
    </ConversationContext.Provider>
  );
};
PipecatConversationProvider.displayName = "PipecatConversationProvider";

export const useConversationContext = (): ConversationContextValue => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error(
      "useConversationContext must be used within a PipecatClientProvider"
    );
  }
  return context;
};
