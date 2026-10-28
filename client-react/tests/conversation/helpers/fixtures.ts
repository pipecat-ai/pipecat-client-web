/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * A spoken `BotOutput` sentence payload as a RTVI 2.0.0+ bot sends it. Pass
 * `spoken_status` and `spoken_progress` in `extra` to model speech progress,
 * or `will_be_spoken: false` for text the bot only displays.
 */
export const sentence = (
  text: string,
  segment_id: number,
  extra: Record<string, unknown> = {}
) => ({
  text,
  output_type: "sentence",
  will_be_spoken: true,
  segment_id,
  ...extra,
});
