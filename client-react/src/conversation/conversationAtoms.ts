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

/** Tracks speech-progress cursor per message (keyed by message createdAt) */
export const botOutputMessageStateAtom = atom<
  Map<string, BotOutputMessageCursor>
>(new Map());

/** Callback set registered per hook instance */
export type MessageCallbacks = {
  onMessageCreated?: (message: ConversationMessage) => void;
  onMessageUpdated?: (message: ConversationMessage) => void;
};

/** Registered callbacks invoked on message lifecycle events */
export const messageCallbacksAtom = atom<Map<string, MessageCallbacks>>(
  new Map()
);

/** Whether BotOutput events are supported (RTVI 1.1.0+): null = unknown, true/false = detected */
export const botOutputSupportedAtom = atom<boolean | null>(null);

/** Raw BotOutput events per message (keyed by message createdAt), for debugging/replay */
export const botOutputEventsAtom = atom<Map<string, BotOutputEvent[]>>(
  new Map()
);
