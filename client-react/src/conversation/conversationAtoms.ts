/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { atom } from "jotai";

import type { BotOutputMessageCursor } from "./botOutput";
import type { ConversationMessage } from "./types";

/** Raw (pre-normalization) message list */
export const messagesAtom = atom<ConversationMessage[]>([]);

/** Tracks speech-progress cursor per message (keyed by message createdAt) */
export const botOutputMessageStateAtom = atom<
  Map<string, BotOutputMessageCursor>
>(new Map());

/** Registered callbacks invoked on message add/update */
export const messageCallbacksAtom = atom<
  Map<string, (message: ConversationMessage) => void>
>(new Map());

/** Whether BotOutput events are supported (RTVI 1.1.0+): null = unknown, true/false = detected */
export const botOutputSupportedAtom = atom<boolean | null>(null);
