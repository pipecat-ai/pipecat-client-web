/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  BotOutputData,
  BotReadyData,
  type LLMFunctionCallInProgressData,
  type LLMFunctionCallStartedData,
  type LLMFunctionCallStoppedData,
  RTVIEvent,
} from "@pipecat-ai/client-js";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useRef } from "react";

import { useRTVIClientEvent } from "../useRTVIClientEvent";
import { hasUnspokenContent } from "./botOutput";
import {
  addMessage,
  clearMessages,
  finalizeLastMessage,
  handleFunctionCallInProgress,
  handleFunctionCallStarted,
  handleFunctionCallStopped,
  removeEmptyLastMessage,
  updateAssistantBotOutput,
  updateLastMessage,
  upsertUserTranscript,
} from "./conversationActions";
import {
  botOutputMessageStateAtom,
  botOutputSupportedAtom,
  messagesAtom,
} from "./conversationAtoms";
import type { ConversationMessage } from "./types";
import { findLast, findLastIndex } from "./utils";

/**
 * Checks if a version meets a minimum version requirement.
 * Inlined to avoid adding a `semver` dependency.
 */
function isMinVersion(
  currentVersion: string,
  minVersion: [number, number, number]
): boolean {
  // Strip pre-release suffix (e.g. "1.1.0-beta.1" -> "1.1.0")
  const parts = currentVersion.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((parts[i] || 0) > minVersion[i]) return true;
    if ((parts[i] || 0) < minVersion[i]) return false;
  }
  return true; // equal
}

/** Delay (ms) before finalizing the assistant message after bot stops speaking. */
const BOT_STOPPED_FINALIZE_DELAY_MS = 2500;

/**
 * Internal hook that wires RTVI events to conversation state atoms.
 * Called once inside PipecatConversationProvider.
 */
export function useConversationEventWiring() {
  const userStoppedTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const botStoppedSpeakingTimeoutRef =
    useRef<ReturnType<typeof setTimeout>>(undefined);
  const assistantStreamResetRef = useRef<number>(0);
  const botOutputLastChunkRef = useRef<{ spoken: string; unspoken: string }>({
    spoken: "",
    unspoken: "",
  });

  // Clean up pending timeouts on unmount
  useEffect(() => {
    return () => {
      clearTimeout(userStoppedTimeout.current);
      clearTimeout(botStoppedSpeakingTimeoutRef.current);
    };
  }, []);

  // -- helpers ---------------------------------------------------------------

  const finalizeLastAssistantMessageIfPending = useAtomCallback(
    useCallback((get, set) => {
      clearTimeout(botStoppedSpeakingTimeoutRef.current);
      botStoppedSpeakingTimeoutRef.current = undefined;
      const messages = get(messagesAtom);
      const lastAssistant = findLast(messages,
        (m: ConversationMessage) => m.role === "assistant"
      );
      if (lastAssistant && !lastAssistant.final) {
        finalizeLastMessage(get, set, "assistant");
      }
    }, [])
  );

  const ensureAssistantMessage = useAtomCallback(
    useCallback((get, set) => {
      const messages = get(messagesAtom);
      const lastAssistantIndex = findLastIndex(messages,
        (msg: ConversationMessage) => msg.role === "assistant"
      );
      const lastAssistant =
        lastAssistantIndex !== -1 ? messages[lastAssistantIndex] : undefined;

      if (!lastAssistant || lastAssistant.final) {
        // If the message was finalized but still has unspoken content, it was
        // finalized prematurely (e.g. BotStoppedSpeaking timer fired during a
        // TTS pause mid-response). Un-finalize it instead of creating a new
        // message bubble — but only when no user message followed.
        if (
          lastAssistant?.final &&
          lastAssistantIndex === messages.length - 1
        ) {
          const messageId = lastAssistant.createdAt;
          const botOutputState = get(botOutputMessageStateAtom);
          const cursor = botOutputState.get(messageId);
          if (
            cursor &&
            hasUnspokenContent(cursor, lastAssistant.parts || [])
          ) {
            updateLastMessage(get, set, "assistant", { final: false });
            return false;
          }
        }

        addMessage(get, set, {
          role: "assistant",
          final: false,
          parts: [],
        });
        assistantStreamResetRef.current += 1;
        return true;
      }
      return false;
    }, [])
  );

  // -- event handlers --------------------------------------------------------

  useRTVIClientEvent(
    RTVIEvent.Connected,
    useAtomCallback(
      useCallback((get, set) => {
        clearMessages(get, set);
        set(botOutputSupportedAtom, null);
        clearTimeout(botStoppedSpeakingTimeoutRef.current);
        botStoppedSpeakingTimeoutRef.current = undefined;
        botOutputLastChunkRef.current = { spoken: "", unspoken: "" };
      }, [])
    )
  );

  useRTVIClientEvent(
    RTVIEvent.BotReady,
    useAtomCallback(
      useCallback((_get, set, botData: BotReadyData) => {
        const rtviVersion = botData.version;
        const supportsBotOutput = isMinVersion(rtviVersion, [1, 1, 0]);
        set(botOutputSupportedAtom, supportsBotOutput);
      }, [])
    )
  );

  useRTVIClientEvent(
    RTVIEvent.BotOutput,
    useAtomCallback(
      useCallback(
        (get, set, data: BotOutputData) => {
          // A BotOutput event means the response is still active; cancel any
          // pending finalize timer from BotStoppedSpeaking.
          clearTimeout(botStoppedSpeakingTimeoutRef.current);
          botStoppedSpeakingTimeoutRef.current = undefined;

          ensureAssistantMessage();

          // Handle spacing for BotOutput chunks
          let textToAdd = data.text;
          const lastChunk = data.spoken
            ? botOutputLastChunkRef.current.spoken
            : botOutputLastChunkRef.current.unspoken;

          // Add space separator if needed between BotOutput chunks
          if (lastChunk) {
            textToAdd = " " + textToAdd;
          }

          // Update the appropriate last chunk tracker
          if (data.spoken) {
            botOutputLastChunkRef.current.spoken = textToAdd;
          } else {
            botOutputLastChunkRef.current.unspoken = textToAdd;
          }

          // Update both spoken and unspoken text streams
          const isFinal = data.aggregated_by === "sentence";
          updateAssistantBotOutput(
            get,
            set,
            textToAdd,
            isFinal,
            data.spoken,
            data.aggregated_by
          );
        },
        [ensureAssistantMessage]
      )
    )
  );

  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useAtomCallback(
      useCallback((get, set) => {
        // Don't finalize immediately; start a timer. Bot may start speaking again (pause).
        clearTimeout(botStoppedSpeakingTimeoutRef.current);
        const messages = get(messagesAtom);
        const lastAssistant = findLast(messages,
          (m: ConversationMessage) => m.role === "assistant"
        );
        if (!lastAssistant || lastAssistant.final) return;
        botStoppedSpeakingTimeoutRef.current = setTimeout(() => {
          botStoppedSpeakingTimeoutRef.current = undefined;

          // Snap the speech-progress cursor to the end of all parts.
          // The bot finished speaking normally (not interrupted), so all
          // text should render as "spoken". Without this, text from the
          // last sentence can remain grey if the spoken BotOutput event
          // didn't match the unspoken text exactly.
          const msgs = get(messagesAtom);
          const cursorMap = new Map(get(botOutputMessageStateAtom));
          const last = findLast(msgs,
            (m: ConversationMessage) => m.role === "assistant"
          );
          if (last) {
            const cursor = cursorMap.get(last.createdAt);
            if (cursor && last.parts && last.parts.length > 0) {
              const lastPartIdx = last.parts.length - 1;
              const lastPartText = last.parts[lastPartIdx]?.text;
              cursor.currentPartIndex = lastPartIdx;
              cursor.currentCharIndex =
                typeof lastPartText === "string" ? lastPartText.length : 0;
              for (let i = 0; i <= lastPartIdx; i++) {
                cursor.partFinalFlags[i] = true;
              }
              set(botOutputMessageStateAtom, cursorMap);
            }
          }

          finalizeLastMessage(get, set, "assistant");
        }, BOT_STOPPED_FINALIZE_DELAY_MS);
      }, [])
    )
  );

  useRTVIClientEvent(
    RTVIEvent.BotStartedSpeaking,
    useCallback(() => {
      // Bot is speaking again; reset the finalize timer (bot was just pausing).
      clearTimeout(botStoppedSpeakingTimeoutRef.current);
      botStoppedSpeakingTimeoutRef.current = undefined;
    }, [])
  );

  useRTVIClientEvent(
    RTVIEvent.UserStartedSpeaking,
    useCallback(() => {
      // User started a new turn; bot's turn is done. Fast-forward: finalize immediately.
      finalizeLastAssistantMessageIfPending();
      clearTimeout(userStoppedTimeout.current);
    }, [finalizeLastAssistantMessageIfPending])
  );

  useRTVIClientEvent(
    RTVIEvent.UserTranscript,
    useAtomCallback(
      useCallback((get, set, data) => {
        const text = data.text ?? "";
        const final = Boolean(data.final);
        upsertUserTranscript(get, set, text, final);

        // If we got any transcript, cancel pending cleanup
        clearTimeout(userStoppedTimeout.current);
      }, [])
    )
  );

  useRTVIClientEvent(
    RTVIEvent.UserStoppedSpeaking,
    useAtomCallback(
      useCallback((get, set) => {
        clearTimeout(userStoppedTimeout.current);
        // If no transcript ends up arriving, ensure any accidental empty placeholder is removed.
        userStoppedTimeout.current = setTimeout(() => {
          // Re-read state at timeout time
          const messages = get(messagesAtom);
          const lastUser = findLast(messages,
            (m: ConversationMessage) => m.role === "user"
          );
          const hasParts =
            Array.isArray(lastUser?.parts) && lastUser!.parts.length > 0;
          if (!lastUser || !hasParts) {
            removeEmptyLastMessage(get, set, "user");
          } else if (!lastUser.final) {
            finalizeLastMessage(get, set, "user");
          }
        }, 3000);
      }, [])
    )
  );

  // LLM Function Call lifecycle events
  useRTVIClientEvent(
    RTVIEvent.LLMFunctionCallStarted,
    useAtomCallback(
      useCallback((get, set, data: LLMFunctionCallStartedData) => {
        handleFunctionCallStarted(get, set, {
          function_name: data.function_name,
        });
      }, [])
    )
  );

  useRTVIClientEvent(
    RTVIEvent.LLMFunctionCallInProgress,
    useAtomCallback(
      useCallback((get, set, data: LLMFunctionCallInProgressData) => {
        handleFunctionCallInProgress(get, set, {
          function_name: data.function_name,
          tool_call_id: data.tool_call_id,
          args: data.arguments,
        });
      }, [])
    )
  );

  useRTVIClientEvent(
    RTVIEvent.LLMFunctionCallStopped,
    useAtomCallback(
      useCallback((get, set, data: LLMFunctionCallStoppedData) => {
        handleFunctionCallStopped(get, set, {
          function_name: data.function_name,
          tool_call_id: data.tool_call_id,
          result: data.result,
          cancelled: data.cancelled,
        });
      }, [])
    )
  );
}
