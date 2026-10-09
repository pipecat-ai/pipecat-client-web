/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { atom } from "jotai";

import type { BotOutputMessageCursor } from "./botOutput";
import type { BotOutputEvent, ConversationMessage } from "./types";

/** Raw (pre-normalization) message list */
export const messagesAtom = atom<ConversationMessage[]>([]);

/**
 * Backchannels the user or the bot said, kept out of `messagesAtom` so they
 * never open, extend or end a turn.
 */
export const backchannelsAtom = atom<ConversationMessage[]>([]);

/** Tracks speech-progress cursor per message (keyed by message createdAt) */
export const botOutputMessageStateAtom = atom<
  Map<string, BotOutputMessageCursor>
>(new Map());

/** Callback set registered per hook instance */
export type MessageCallbacks = {
  onMessageCreated?: (message: ConversationMessage) => void;
  onMessageUpdated?: (message: ConversationMessage) => void;
  /** Whether backchannels are reported to these callbacks. */
  includeBackchannel?: boolean;
};

/** Registered callbacks invoked on message lifecycle events */
export const messageCallbacksAtom = atom<Map<string, MessageCallbacks>>(
  new Map()
);

/** Whether BotOutput events are supported (RTVI 1.1.0+): null = unknown, true/false = detected */
export const botOutputSupportedAtom = atom<boolean | null>(null);

/** Whether the bot acknowledges text sent with sendText() (RTVI 2.2.0+). */
export const botAcknowledgesSentTextAtom = atom<boolean>(false);

/** Which BotOutput protocol version is active. null = unknown (pre-BotReady). */
export const botOutputProtocolAtom = atom<"legacy" | "v2" | null>(null);

/** Raw BotOutput events per message (keyed by message createdAt), for debugging/replay */
export const botOutputEventsAtom = atom<Map<string, BotOutputEvent[]>>(
  new Map()
);
