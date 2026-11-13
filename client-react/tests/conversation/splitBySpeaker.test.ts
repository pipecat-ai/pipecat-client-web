/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import type { TranscriptionSpeaker } from "@pipecat-ai/client-js";

import { splitMessageBySpeaker } from "@/conversation/splitBySpeaker";
import type { ConversationMessage } from "@/conversation/types";

import { conversation, playScenario } from "./helpers/conversationDSL";
import { createStoreHarness } from "./helpers/storeHarness";

const A: TranscriptionSpeaker = { label: "A", number: 1 };
const B: TranscriptionSpeaker = { label: "B", number: 2 };

const split = (messages: ConversationMessage[]) =>
  messages.filter((m) => m.role === "user").flatMap(splitMessageBySpeaker);

const summary = (messages: ConversationMessage[]) =>
  messages.map((m) => [m.speaker?.label, m.parts.map((p) => p.text)]);

describe("splitMessageBySpeaker", () => {
  let harness: ReturnType<typeof createStoreHarness>;

  beforeEach(() => {
    jest.useFakeTimers();
    harness = createStoreHarness();
    harness.reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("gives each speaker's run of parts a message of its own", () => {
    playScenario(
      harness,
      conversation()
        .user([
          { text: "My favorite fruit is the apple.", speaker: A },
          { text: "It's crunchy.", speaker: A },
          { text: "Mine is the banana.", speaker: B },
          { text: "And mine is the pear.", speaker: A },
        ])
        .build()
    );

    expect(summary(split(harness.getMessages()))).toEqual([
      ["A", ["My favorite fruit is the apple.", "It's crunchy."]],
      ["B", ["Mine is the banana."]],
      ["A", ["And mine is the pear."]],
    ]);
  });

  it("keeps an unlabelled interim in the run before it, so no message comes and goes", () => {
    const steps: (string | undefined)[][] = [];
    playScenario(
      harness,
      conversation()
        .user([
          { text: "My favorite fruit is the apple.", speaker: A },
          { text: "It's crunchy.", speaker: A },
          { text: "Mine is the banana.", speaker: B },
        ])
        .build(),
      () =>
        steps.push(split(harness.getMessages()).map((m) => m.speaker?.label))
    );

    // Each speaker's message, once shown, stays until the turn ends.
    steps.forEach((labels, i) => {
      if (i > 0)
        expect(labels.length).toBeGreaterThanOrEqual(steps[i - 1].length);
    });
    expect(steps[steps.length - 1]).toEqual(["A", "B"]);
  });

  it("marks every message but the turn's last as final", () => {
    harness.emitUserTranscript("My favorite fruit is the apple.", true, {
      speaker: A,
    });
    harness.emitUserTranscript("Mine is", false, { speaker: B });

    expect(split(harness.getMessages()).map((m) => m.final)).toEqual([
      true,
      false,
    ]);
  });

  it("gives final parts without a speaker a message of their own, without a speaker", () => {
    harness.emitUserTranscript("My favorite fruit is the apple.", true, {
      speaker: A,
    });
    harness.emitUserTranscript("Hmm.", true);
    harness.emitUserTranscript("Right.", true);

    const messages = split(harness.getMessages());
    expect(summary(messages)).toEqual([
      ["A", ["My favorite fruit is the apple."]],
      [undefined, ["Hmm.", "Right."]],
    ]);
    expect(messages[1]).not.toHaveProperty("speaker");
  });

  it("gives each message a later createdAt, even when the finals arrive in one millisecond", () => {
    playScenario(
      harness,
      conversation()
        .user([
          { text: "Apple.", speaker: A },
          { text: "Banana.", speaker: B },
          { text: "Pear.", speaker: A },
        ])
        .build()
    );

    const createdAt = split(harness.getMessages()).map((m) =>
      Date.parse(m.createdAt)
    );
    expect(createdAt).toHaveLength(3);
    expect(createdAt[1]).toBeGreaterThan(createdAt[0]);
    expect(createdAt[2]).toBeGreaterThan(createdAt[1]);
  });

  it("gives the same messages for the same message, so unchanged turns don't re-render", () => {
    harness.emitUserTranscript("Apple.", true, { speaker: A });
    harness.emitUserTranscript("Banana.", true, { speaker: B });
    const [message] = harness.getMessages();

    expect(splitMessageBySpeaker(message)).toBe(splitMessageBySpeaker(message));
  });

  it("leaves a user message without speakers, and other roles, unchanged", () => {
    playScenario(
      harness,
      conversation().user("So I was thinking.").bot("Tell me more.").build()
    );

    for (const message of harness.getMessages()) {
      expect(splitMessageBySpeaker(message)).toEqual([message]);
    }
  });
});
