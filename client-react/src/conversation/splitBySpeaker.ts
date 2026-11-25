/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { ConversationMessage, ConversationMessagePart } from "./types";

const splitCache = new WeakMap<ConversationMessage, ConversationMessage[]>();

/**
 * Split a user message into one message per run of consecutive parts with the
 * same speaker, each with that `speaker`. Consecutive final parts without a
 * speaker form a run too, whose message has no `speaker`. An interim part
 * without a speaker stays in the run before it, since most STT services only
 * name the speaker in the final transcript. A message whose parts have no
 * speaker, or that isn't the user's, is returned unchanged.
 *
 * The first message keeps the original's `createdAt`; each later one takes its
 * first part's, moved a millisecond past the message before it when it isn't
 * already later. Every message but the last is final, since only the last
 * part of a user message still changes.
 *
 * The split is kept for each message object, so an unchanged message gives
 * back the same messages.
 */
export function splitMessageBySpeaker(
  message: ConversationMessage
): ConversationMessage[] {
  if (message.role !== "user" || !message.parts.some((p) => p.speaker)) {
    return [message];
  }
  let split = splitCache.get(message);
  if (!split) {
    split = splitIntoRuns(message);
    splitCache.set(message, split);
  }
  return split;
}

function splitIntoRuns(message: ConversationMessage): ConversationMessage[] {
  const runs: ConversationMessagePart[][] = [];
  for (const part of message.parts) {
    const run = runs[runs.length - 1];
    const unlabelledInterim = !part.speaker && !part.final;
    if (
      run &&
      (unlabelledInterim || run[0].speaker?.number === part.speaker?.number)
    ) {
      run.push(part);
    } else {
      runs.push([part]);
    }
  }

  // Speakers' finals can arrive in the same millisecond, and apps tell
  // messages apart by createdAt.
  let previousTime = -Infinity;
  return runs.map((parts, index) => {
    const { speaker } = parts[0];
    let createdAt = index === 0 ? message.createdAt : parts[0].createdAt;
    const time = Date.parse(createdAt);
    if (time <= previousTime) {
      createdAt = new Date(previousTime + 1).toISOString();
    }
    previousTime = Math.max(time, previousTime + 1);
    return {
      ...message,
      parts,
      createdAt,
      final: index === runs.length - 1 ? message.final : true,
      ...(speaker && { speaker }),
    };
  });
}
