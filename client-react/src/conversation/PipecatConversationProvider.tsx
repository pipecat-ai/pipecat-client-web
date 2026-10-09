/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import React, { createContext, useCallback, useContext } from "react";

import { injectMessage as injectMessageAction } from "./conversationActions";
import { botOutputSupportedAtom } from "./conversationAtoms";
import type { ConversationMessagePart } from "./types";
import { useConversationEventWiring } from "./useConversationEventWiring";

interface ConversationContextValue {
  injectMessage: (message: {
    role: "user" | "assistant" | "system";
    parts: ConversationMessagePart[];
  }) => void;
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

  const injectMessage = useAtomCallback(
    useCallback((get, set, message: {
      role: "user" | "assistant" | "system";
      parts: ConversationMessagePart[];
    }) => {
      // Text input through `sendText` produces no UserStartedSpeaking event,
      // so injecting the user message must close the assistant's turn. This
      // also emits onMessageUpdated when the assistant message is finalized.
      // Assistant injections can still merge into the active bubble, and
      // system injections retain their backdating behavior.
      if (message.role === "user") {
        finalizeLastAssistantMessageIfPending();
      }
      injectMessageAction(get, set, message);
    }, [finalizeLastAssistantMessageIfPending])
  );

  const botOutputSupported = useAtomValue(botOutputSupportedAtom);

  return (
    <ConversationContext.Provider value={{ injectMessage, botOutputSupported }}>
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
