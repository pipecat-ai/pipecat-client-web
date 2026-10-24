/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useAtomValue } from "jotai";

import { botDeliveryAtom } from "./conversation/conversationAtoms";

/**
 * The bot's delivery now, in expressive conversation (RTVI 2.3.0+): that
 * of the words it just spoke, such as `["cheerful"]`, or
 * `["cheerful", "emphasis"]` while it stresses a word. Empty for the voice's
 * baseline, and null while the bot isn't speaking or the bot doesn't report
 * its delivery. Use it inside a `PipecatClientProvider`.
 */
export const usePipecatBotDelivery = (): string[] | null =>
  useAtomValue(botDeliveryAtom);
