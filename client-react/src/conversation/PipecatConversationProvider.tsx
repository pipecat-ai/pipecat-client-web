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
   * `received` or `failed`. Use it in place of
   * `injectMessage` plus `client.sendText()`, not alongside them.
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
  useConversationEventWiring();
  const sendText = useSentText();

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
