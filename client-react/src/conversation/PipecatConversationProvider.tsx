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
  useConversationEventWiring();

  const injectMessage = useAtomCallback(
    useCallback((get, set, message: {
      role: "user" | "assistant" | "system";
      parts: ConversationMessagePart[];
    }) => {
      injectMessageAction(get, set, message);
    }, [])
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
