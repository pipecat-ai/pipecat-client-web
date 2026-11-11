/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { ConversationMessage, ConversationMessagePart } from "./types";

/**
 * Split a user message into one message per run of consecutive parts with the
 * same speaker, each with that `speaker`. Parts without a speaker form runs of
 * their own, and their messages have no `speaker`. A message whose parts have
 * no speaker, or that isn't the user's, is returned unchanged.
 *
 * The first message keeps the original's `createdAt`; each later one takes its
 * first part's. Every message but the last is final, since only the last part
 * of a user message still changes.
 */
export function splitMessageBySpeaker(
  message: ConversationMessage
): ConversationMessage[] {
  if (message.role !== "user" || !message.parts.some((p) => p.speaker)) {
    return [message];
  }

  const runs: ConversationMessagePart[][] = [];
  for (const part of message.parts) {
    const run = runs[runs.length - 1];
    if (run && run[0].speaker?.number === part.speaker?.number) {
      run.push(part);
    } else {
      runs.push([part]);
    }
  }

  return runs.map((parts, index) => {
    const { speaker } = parts[0];
    return {
      ...message,
      parts,
      createdAt: index === 0 ? message.createdAt : parts[0].createdAt,
      final: index === runs.length - 1 ? message.final : true,
      ...(speaker && { speaker }),
    };
  });
}
