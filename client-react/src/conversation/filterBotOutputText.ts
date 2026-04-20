/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { BotOutputFilter, BotOutputText } from "./types";

/**
 * Apply a {@link BotOutputFilter} to a {@link BotOutputText}, zeroing out any
 * portion whose flag is explicitly `false`. Both flags default to `true`, so
 * an omitted filter (or `undefined`) returns the text unchanged.
 */
export function filterBotOutputText(
  text: BotOutputText,
  filter?: BotOutputFilter
): BotOutputText {
  return {
    spoken: filter?.spoken === false ? "" : text.spoken,
    unspoken: filter?.unspoken === false ? "" : text.unspoken,
  };
}
