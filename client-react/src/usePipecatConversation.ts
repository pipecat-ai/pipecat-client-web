/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useId, useMemo } from "react";

import {
  registerMessageCallback,
  sortByCreatedAt,
  unregisterMessageCallback,
} from "./conversation/conversationActions";
import {
  botOutputMessageStateAtom,
  messagesAtom,
} from "./conversation/conversationAtoms";
import { useConversationContext } from "./conversation/PipecatConversationProvider";
import type {
  AggregationMetadata,
  ConversationMessage,
  ConversationMessagePart,
} from "./conversation/types";

/**
 * Options for `usePipecatConversation`.
 */
interface Props {
  /**
   * Called once when a brand-new message first enters the conversation.
   * The message may or may not be complete at this point — check `message.final`.
   */
  onMessageCreated?: (message: ConversationMessage) => void;
  /**
   * Called whenever an existing message's content changes
   * (e.g. streaming text appended, function call status changed, message finalized).
   * Check `message.final` to detect finalization.
   */
  onMessageUpdated?: (message: ConversationMessage) => void;
  /**
   * @deprecated Use `onMessageCreated` instead. Will be removed in a future release.
   */
  onMessageAdded?: (message: ConversationMessage) => void;
  /**
   * Metadata for aggregation types to control rendering and speech progress behavior.
   * Used to determine which aggregations should be excluded from position-based splitting.
   */
  aggregationMetadata?: Record<string, AggregationMetadata>;
}

/**
 * React hook for accessing and subscribing to the current conversation stream.
 *
 * This hook provides:
 * - The current list of conversation messages, ordered and merged for display.
 * - An `injectMessage` function to programmatically add a message to the conversation.
 * - Lifecycle callbacks: `onMessageCreated`, `onMessageUpdated`.
 *
 * Internally, this hook:
 * - Subscribes to conversation state updates and merges/filters messages for UI consumption.
 * - Ensures the provided callbacks are registered and unregistered as the component mounts/unmounts or the callbacks change.
 *
 * @param {Props} [options] - Optional configuration for the hook.
 * @returns {{
 *   messages: ConversationMessage[];
 *   injectMessage: (message: { role: "user" | "assistant" | "system"; parts: any[] }) => void;
 * }}
 */
export const usePipecatConversation = ({
  onMessageCreated,
  onMessageUpdated,
  onMessageAdded,
  aggregationMetadata,
}: Props = {}) => {
  const { injectMessage } = useConversationContext();

  // Generate a unique ID for this hook instance
  const callbackId = useId();

  // Resolve deprecated onMessageAdded → onMessageCreated
  const resolvedCreated = onMessageCreated ?? onMessageAdded;

  // Register and unregister the callbacks
  const doRegister = useAtomCallback(
    useCallback(
      (get, set) => {
        registerMessageCallback(get, set, callbackId, {
          onMessageCreated: resolvedCreated,
          onMessageUpdated,
        });
      },
      [callbackId, resolvedCreated, onMessageUpdated]
    )
  );

  const doUnregister = useAtomCallback(
    useCallback(
      (get, set) => {
        unregisterMessageCallback(get, set, callbackId);
      },
      [callbackId]
    )
  );

  useEffect(() => {
    doRegister();
    return () => {
      doUnregister();
    };
  }, [doRegister, doUnregister]);

  // Get the raw state from atoms
  const messages = useAtomValue(messagesAtom);
  const botOutputMessageState = useAtomValue(botOutputMessageStateAtom);

  // Memoize the filtered messages to prevent infinite loops
  const filteredMessages = useMemo(() => {
    const getMetadata = (part: ConversationMessagePart) => {
      return part.aggregatedBy
        ? aggregationMetadata?.[part.aggregatedBy]
        : undefined;
    };

    // Process messages: convert string parts to BotOutputText based on position state
    const processedMessages = messages.map((message) => {
      if (message.role === "assistant") {
        const messageId = message.createdAt;
        const messageState = botOutputMessageState.get(messageId);

        if (!messageState) {
          // No state yet, return message as-is
          return message;
        }

        const parts = message.parts || [];

        // Find the actual current part index (skip parts that aren't meant to be spoken)
        let actualCurrentPartIndex = messageState.currentPartIndex;
        while (actualCurrentPartIndex < parts.length) {
          const part = parts[actualCurrentPartIndex];
          if (typeof part?.text !== "string") break;
          const isSpoken = getMetadata(part)?.isSpoken !== false;
          if (isSpoken) break;
          actualCurrentPartIndex++;
        }
        if (parts.length > 0 && actualCurrentPartIndex >= parts.length) {
          actualCurrentPartIndex = parts.length - 1;
        }

        // Convert parts to BotOutputText format based on position state
        const processedParts: ConversationMessagePart[] = parts.map(
          (part, partIndex) => {
            // If part text is not a string, it's already processed (e.g., ReactNode)
            if (typeof part.text !== "string") return part;

            const metadata = getMetadata(part);
            const displayMode =
              part.displayMode ?? metadata?.displayMode ?? "inline";
            const isSpoken = metadata?.isSpoken !== false;

            const partText =
              displayMode === "block" && !isSpoken
                ? part.text.trim()
                : part.text;
            if (!isSpoken) {
              return {
                ...part,
                displayMode,
                text: { spoken: "", unspoken: partText },
              };
            }

            // Use cursor split for the part at actualCurrentPartIndex for every message,
            // so previous (e.g. interrupted) messages keep partially spoken state.
            const isPartAtCursor = partIndex === actualCurrentPartIndex;
            const currentCharIndex = messageState.currentCharIndex;
            const spokenText = isPartAtCursor
              ? partText.slice(0, currentCharIndex)
              : partIndex < actualCurrentPartIndex
                ? partText
                : "";
            const unspokenText = isPartAtCursor
              ? partText.slice(currentCharIndex)
              : partIndex < actualCurrentPartIndex
                ? ""
                : partText;

            return {
              ...part,
              displayMode,
              text: { spoken: spokenText, unspoken: unspokenText },
            };
          }
        );

        return {
          ...message,
          parts: processedParts,
        };
      }
      return message;
    });

    // Messages are already normalized (filtered, deduped, merged) on write.
    // Only sort is needed here for stable display ordering.
    return [...processedMessages].sort(sortByCreatedAt);
  }, [messages, botOutputMessageState, aggregationMetadata]);

  return {
    messages: filteredMessages,
    injectMessage,
  };
};
