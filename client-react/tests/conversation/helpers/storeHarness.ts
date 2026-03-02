import { createStore } from "jotai";

import {
  type BotOutputMessageCursor,
  hasUnspokenContent,
} from "@/conversation/botOutput";
import * as actions from "@/conversation/conversationActions";
import {
  botOutputMessageStateAtom,
  messagesAtom,
} from "@/conversation/conversationAtoms";
import type { ConversationMessage } from "@/conversation/types";

/**
 * Store-level test harness that replicates the ConversationProvider's
 * event-to-store-action logic without requiring React.
 *
 * The key behavior replicated here is the space-prepending logic from
 * ConversationProvider (lines 106-135): each BotOutput chunk gets a
 * leading space if there was a previous chunk of the same type (spoken
 * or unspoken). This is critical because the store receives already-spaced text.
 */
export function createStoreHarness() {
  const store = createStore();

  // Tracks last chunk per type, mirroring botOutputLastChunkRef in ConversationProvider
  let lastChunk = { spoken: "", unspoken: "" };

  function reset() {
    actions.clearMessages(store.get, store.set);
    lastChunk = { spoken: "", unspoken: "" };
  }

  /**
   * Ensures an assistant message exists, creating one if needed.
   * Mirrors ConversationProvider's ensureAssistantMessage(), including the
   * un-finalize logic for prematurely finalized messages with unspoken content.
   */
  function ensureAssistantMessage(): boolean {
    const messages = store.get(messagesAtom);
    const lastAssistantIndex = messages
      .map((msg: ConversationMessage, i: number) => ({ msg, i }))
      .filter(({ msg }) => msg.role === "assistant")
      .pop()?.i ?? -1;
    const lastAssistant =
      lastAssistantIndex !== -1 ? messages[lastAssistantIndex] : undefined;

    if (!lastAssistant || lastAssistant.final) {
      // If the message was finalized but still has unspoken content, it was
      // finalized prematurely. Un-finalize it instead of creating a new bubble
      // -- but only when no user message followed.
      if (
        lastAssistant?.final &&
        lastAssistantIndex === messages.length - 1
      ) {
        const messageId = lastAssistant.createdAt;
        const botOutputState = store.get(botOutputMessageStateAtom);
        const cursor = botOutputState.get(messageId);
        if (cursor && hasUnspokenContent(cursor, lastAssistant.parts || [])) {
          actions.updateLastMessage(store.get, store.set, "assistant", {
            final: false,
          });
          return false;
        }
      }

      actions.addMessage(store.get, store.set, {
        role: "assistant",
        final: false,
        parts: [],
      });
      lastChunk = { spoken: "", unspoken: "" };
      return true;
    }
    return false;
  }

  /**
   * Emit a BotOutput event, replicating ConversationProvider spacing logic.
   */
  function emitBotOutput(text: string, spoken: boolean, aggregatedBy?: string) {
    ensureAssistantMessage();

    let textToAdd = text;
    const prevChunk = spoken ? lastChunk.spoken : lastChunk.unspoken;

    if (prevChunk) {
      textToAdd = " " + textToAdd;
    }

    if (spoken) {
      lastChunk.spoken = textToAdd;
    } else {
      lastChunk.unspoken = textToAdd;
    }

    const isFinal = aggregatedBy === "sentence";
    actions.updateAssistantBotOutput(
      store.get,
      store.set,
      textToAdd,
      isFinal,
      spoken,
      aggregatedBy
    );
  }

  /**
   * Emit a UserTranscript event.
   */
  function emitUserTranscript(text: string, final: boolean) {
    actions.upsertUserTranscript(store.get, store.set, text, final);
  }

  /**
   * Finalize the last assistant message, replicating what happens after
   * BotStoppedSpeaking timeout or UserStartedSpeaking.
   */
  function finalizeAssistant() {
    actions.finalizeLastMessage(store.get, store.set, "assistant");
  }

  /**
   * Finalize the last user message.
   */
  function finalizeUser() {
    actions.finalizeLastMessage(store.get, store.set, "user");
  }

  /**
   * Finalize the last assistant message if it's pending (not yet final).
   * Mirrors ConversationProvider's finalizeLastAssistantMessageIfPending().
   */
  function finalizeAssistantIfPending() {
    const messages = store.get(messagesAtom);
    const lastAssistant = [...messages]
      .reverse()
      .find((m: ConversationMessage) => m.role === "assistant");
    if (lastAssistant && !lastAssistant.final) {
      finalizeAssistant();
    }
  }

  /**
   * Finalize the last user message if it's pending (not yet final).
   * Called on UserStartedSpeaking to close the previous user turn.
   */
  function finalizeUserIfPending() {
    const messages = store.get(messagesAtom);
    const lastUser = [...messages]
      .reverse()
      .find((m: ConversationMessage) => m.role === "user");
    if (lastUser && !lastUser.final) {
      finalizeUser();
    }
  }

  function removeEmptyLastUserMessage() {
    actions.removeEmptyLastMessage(store.get, store.set, "user");
  }

  function getMessages(): ConversationMessage[] {
    return store.get(messagesAtom);
  }

  function getBotOutputState(): Map<string, BotOutputMessageCursor> {
    return store.get(botOutputMessageStateAtom);
  }

  /**
   * Get the cursor for the last assistant message.
   */
  function getLastAssistantCursor(): BotOutputMessageCursor | undefined {
    const messages = getMessages();
    const lastAssistant = [...messages]
      .reverse()
      .find((m: ConversationMessage) => m.role === "assistant");
    if (!lastAssistant) return undefined;
    return getBotOutputState().get(lastAssistant.createdAt);
  }

  /**
   * Reset the chunk trackers, as happens when a new assistant message is created.
   */
  function resetChunkTrackers() {
    lastChunk = { spoken: "", unspoken: "" };
  }

  function handleFunctionCallStarted(data: { function_name?: string }) {
    actions.handleFunctionCallStarted(store.get, store.set, data);
  }

  function handleFunctionCallInProgress(data: {
    function_name?: string;
    tool_call_id: string;
    args?: Record<string, unknown>;
  }) {
    actions.handleFunctionCallInProgress(store.get, store.set, data);
  }

  function handleFunctionCallStopped(data: {
    function_name?: string;
    tool_call_id: string;
    result?: unknown;
    cancelled?: boolean;
  }) {
    actions.handleFunctionCallStopped(store.get, store.set, data);
  }

  // Expose raw store action helpers for tests that call actions directly
  function addMessage(
    messageData: Omit<ConversationMessage, "createdAt" | "updatedAt">
  ) {
    actions.addMessage(store.get, store.set, messageData);
  }

  function clearMessages() {
    actions.clearMessages(store.get, store.set);
  }

  function addFunctionCall(data: {
    function_name?: string;
    tool_call_id?: string;
    args?: Record<string, unknown>;
  }) {
    actions.addFunctionCall(store.get, store.set, data);
  }

  function updateFunctionCall(
    tool_call_id: string,
    updates: {
      status?: "started" | "in_progress" | "completed";
      result?: unknown;
      cancelled?: boolean;
      function_name?: string;
      args?: Record<string, unknown>;
    }
  ): boolean {
    return actions.updateFunctionCall(
      store.get,
      store.set,
      tool_call_id,
      updates
    );
  }

  function updateLastStartedFunctionCall(updates: {
    tool_call_id?: string;
    args?: Record<string, unknown>;
    status?: "started" | "in_progress" | "completed";
    function_name?: string;
  }): boolean {
    return actions.updateLastStartedFunctionCall(
      store.get,
      store.set,
      updates
    );
  }

  function updateAssistantBotOutput(
    text: string,
    final: boolean,
    spoken: boolean,
    aggregatedBy?: string
  ) {
    actions.updateAssistantBotOutput(
      store.get,
      store.set,
      text,
      final,
      spoken,
      aggregatedBy
    );
  }

  function registerMessageCallback(
    id: string,
    callback: (msg: ConversationMessage) => void
  ) {
    actions.registerMessageCallback(store.get, store.set, id, {
      onMessageCreated: callback,
      onMessageUpdated: callback,
    });
  }

  function unregisterMessageCallback(id: string) {
    actions.unregisterMessageCallback(store.get, store.set, id);
  }

  return {
    reset,
    ensureAssistantMessage,
    emitBotOutput,
    emitUserTranscript,
    finalizeAssistant,
    finalizeUser,
    finalizeAssistantIfPending,
    finalizeUserIfPending,
    removeEmptyLastUserMessage,
    getMessages,
    getBotOutputState,
    getLastAssistantCursor,
    resetChunkTrackers,
    handleFunctionCallStarted,
    handleFunctionCallInProgress,
    handleFunctionCallStopped,
    // Raw store action helpers
    addMessage,
    clearMessages,
    addFunctionCall,
    updateFunctionCall,
    updateLastStartedFunctionCall,
    updateAssistantBotOutput,
    registerMessageCallback,
    unregisterMessageCallback,
  };
}

export type StoreHarness = ReturnType<typeof createStoreHarness>;
