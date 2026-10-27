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
  backchannelsAtom,
  botOutputEventsAtom,
  botOutputMessageStateAtom,
  type ExpressionEvent,
  expressionEventsAtom,
  messagesAtom,
} from "./conversation/conversationAtoms";
import { filterBotOutputText } from "./conversation/filterBotOutputText";
import { useConversationContext } from "./conversation/PipecatConversationProvider";
import type {
  BotOutputFilter,
  ConversationMessage,
  ConversationMessagePart,
  OutputTypeMetadata,
} from "./conversation/types";

// Shared across hook instances so the deprecation warning logs only once.
let aggregationMetadataWarned = false;

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
   * Metadata for output types to control rendering and speech progress behavior.
   * Used to determine which output types should be excluded from position-based splitting.
   */
  outputTypeMetadata?: Record<string, OutputTypeMetadata>;
  /**
   * @deprecated Use `outputTypeMetadata` instead. Where both have an entry for
   * an output type, `outputTypeMetadata`'s is used.
   */
  aggregationMetadata?: Record<string, OutputTypeMetadata>;
  /**
   * Filter controlling which portions of BotOutput text are returned.
   * The underlying atoms always store the full data; this filter controls
   * what the consumer receives in the `messages` array.
   */
  botOutputFilter?: BotOutputFilter;
  /**
   * Include backchannels: short acknowledgments said while the other side
   * talks, such as the user's "mhm" or the bot's "Mm-hmm." (RTVI 2.2.0+).
   * Each is its own message with `backchannel: true`, placed by when it was
   * said, and is also reported to `onMessageCreated`.
   * @default false
   */
  includeBackchannel?: boolean;
  /**
   * Include the sounds and pauses the bot performs in expressive
   * conversation, such as a laugh (RTVI 2.3.0+). Each is a part of the bot's
   * message whose `outputType` is `"expression_sound"`, with the sound's
   * name as its text, such as "laughs", or `"expression_pause"`, with the
   * pause's length in milliseconds. It sits where the bot's speech had
   * reached when it was performed, splitting the text around it; how it
   * looks is up to the renderer. A pause's text is a number rather than words
   * to show, so render these parts by their `outputType`.
   *
   * With a TTS service that doesn't report when each word is spoken, the bot
   * reports a sentence's sounds before the sentence, so a laugh mid-sentence
   * sits before that whole sentence.
   *
   * It affects `messages` only: `onMessageCreated` and `onMessageUpdated`
   * report the message without them. To react to one as it's
   * performed, use `RTVIEvent.BotExpression`.
   * @default false
   */
  includeExpressionEvents?: boolean;
}

/**
 * React hook for accessing and subscribing to the current conversation stream.
 *
 * This hook provides:
 * - The current list of conversation messages, ordered and merged for display.
 * - An `injectMessage` function to programmatically add a message to the conversation.
 * - A `sendText` function that sends text to the bot and adds it as a user message.
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
  outputTypeMetadata,
  aggregationMetadata,
  botOutputFilter,
  includeBackchannel = false,
  includeExpressionEvents = false,
}: Props = {}) => {
  const { injectMessage, sendText } = useConversationContext();

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
          includeBackchannel,
        });
      },
      [callbackId, resolvedCreated, onMessageUpdated, includeBackchannel]
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

  const usesAggregationMetadata = aggregationMetadata !== undefined;
  useEffect(() => {
    if (usesAggregationMetadata && !aggregationMetadataWarned) {
      console.warn(
        "usePipecatConversation: aggregationMetadata is deprecated. Use outputTypeMetadata instead."
      );
      aggregationMetadataWarned = true;
    }
  }, [usesAggregationMetadata]);

  // Get the raw state from atoms
  const messages = useAtomValue(messagesAtom);
  const botOutputMessageState = useAtomValue(botOutputMessageStateAtom);
  const backchannels = useAtomValue(backchannelsAtom);
  const expressionEvents = useAtomValue(expressionEventsAtom);

  // Memoize the filtered messages to prevent infinite loops
  const filteredMessages = useMemo(() => {
    const getMetadata = (part: ConversationMessagePart) => {
      const outputType = part.outputType ?? part.aggregatedBy;
      return outputType
        ? (outputTypeMetadata?.[outputType] ??
            aggregationMetadata?.[outputType])
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

        // The sounds and pauses the bot performed, by the part being spoken
        // when each was.
        const eventsByPart = new Map<number, ExpressionEvent[]>();
        if (includeExpressionEvents) {
          for (const event of expressionEvents.get(messageId) ?? []) {
            const index = Math.min(event.partIndex, parts.length);
            eventsByPart.set(index, [
              ...(eventsByPart.get(index) ?? []),
              event,
            ]);
          }
        }
        const eventPart = (
          event: ExpressionEvent
        ): ConversationMessagePart => ({
          text: filterBotOutputText(
            { spoken: event.text, unspoken: "" },
            botOutputFilter
          ),
          final: true,
          createdAt: event.createdAt,
          outputType: event.outputType,
          aggregatedBy: event.outputType,
          segment_id: event.segment_id,
          displayMode: "inline",
        });

        // Convert parts to BotOutputText format based on position state
        const processedParts: ConversationMessagePart[] = parts.flatMap(
          (part, partIndex): ConversationMessagePart[] => {
            const events = eventsByPart.get(partIndex) ?? [];
            // If part text is not a string, it's already processed (e.g., ReactNode)
            if (typeof part.text !== "string") {
              return [part, ...events.map(eventPart)];
            }

            const metadata = getMetadata(part);
            const displayMode =
              part.displayMode ?? metadata?.displayMode ?? "inline";
            const isSpoken = metadata?.isSpoken !== false;

            const partText =
              displayMode === "block" && !isSpoken
                ? part.text.trim()
                : part.text;
            if (!isSpoken) {
              // Non-spoken aggregation types: all content is "unspoken".
              return [
                {
                  ...part,
                  displayMode,
                  text: filterBotOutputText(
                    { spoken: "", unspoken: partText },
                    botOutputFilter
                  ),
                },
                ...events.map(eventPart),
              ];
            }

            // Use cursor split for the part at actualCurrentPartIndex for every message,
            // so previous (e.g. interrupted) messages keep partially spoken state.
            const spokenLength =
              partIndex === actualCurrentPartIndex
                ? messageState.currentCharIndex
                : partIndex < actualCurrentPartIndex
                  ? partText.length
                  : 0;

            // For v2 segments that follow another segment, prepend the separator
            // space to the spoken bucket so it appears immediately. The stored
            // text is the original segment text and is never modified.
            let separator = part.needsSeparator ? " " : "";

            // The part's text from start to end, split into its spoken and
            // unspoken text.
            const piece = (
              start: number,
              end: number
            ): ConversationMessagePart => {
              const spokenEnd = Math.min(Math.max(spokenLength, start), end);
              const text = filterBotOutputText(
                {
                  spoken: separator + partText.slice(start, spokenEnd),
                  unspoken: partText.slice(spokenEnd, end),
                },
                botOutputFilter
              );
              separator = "";
              return { ...part, displayMode, text };
            };

            // An event splits the part's text where it was performed.
            const pieces: ConversationMessagePart[] = [];
            let start = 0;
            for (const event of [...events].sort(
              (a, b) => a.charIndex - b.charIndex
            )) {
              const end = Math.min(event.charIndex, partText.length);
              if (end > start) {
                pieces.push(piece(start, end));
                start = end;
              }
              pieces.push(eventPart(event));
            }
            if (start < partText.length || pieces.length === 0) {
              pieces.push(piece(start, partText.length));
            }
            return pieces;
          }
        );
        // Events performed past the last part follow it.
        processedParts.push(
          ...(eventsByPart.get(parts.length) ?? []).map(eventPart)
        );

        return {
          ...message,
          parts: processedParts,
        };
      }
      return message;
    });

    // Messages are already normalized (sorted, filtered, deduped, merged) on write.
    if (!includeBackchannel || backchannels.length === 0) {
      return processedMessages;
    }
    return [...processedMessages, ...backchannels].sort(sortByCreatedAt);
  }, [
    messages,
    botOutputMessageState,
    outputTypeMetadata,
    aggregationMetadata,
    botOutputFilter,
    includeBackchannel,
    backchannels,
    includeExpressionEvents,
    expressionEvents,
  ]);

  const botOutputEvents = useAtomValue(botOutputEventsAtom);

  return {
    messages: filteredMessages,
    injectMessage,
    sendText,
    botOutputEvents,
  };
};
