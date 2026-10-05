/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { MediaSupport } from "../rtvi/common_types";
import { BotCapabilities } from "../rtvi/messages";

/**
 * Combine what a transport and a bot each support into what can flow in the
 * session. A kind of media is `false` if either side rules it out, `true` only
 * if every side is known and supports it, and `undefined` otherwise.
 */
export function combineMediaSupport(
  transport: MediaSupport,
  bot: BotCapabilities | undefined
): MediaSupport {
  const combine = (...values: (boolean | undefined)[]): boolean | undefined => {
    if (values.includes(false)) return false;
    if (values.every((value) => value === true)) return true;
    return undefined;
  };
  return {
    mic: combine(transport.mic, bot?.audio_in),
    cam: combine(transport.cam, bot?.video_in),
    screenShare: combine(transport.screenShare, bot?.video_in, bot?.screen_in),
    botAudio: combine(transport.botAudio, bot?.audio_out),
    botVideo: combine(transport.botVideo, bot?.video_out),
  };
}
