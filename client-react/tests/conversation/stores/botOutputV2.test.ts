/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { createStoreHarness } from "../helpers/storeHarness";

describe("RTVI Protocol 2.0.0 – BotOutput v2", () => {
  let harness: ReturnType<typeof createStoreHarness>;

  beforeEach(() => {
    harness = createStoreHarness();
    harness.reset();
  });

  // -------------------------------------------------------------------------
  // Text accumulation
  // -------------------------------------------------------------------------
  describe("text accumulation", () => {
    it("creates a part for a will_be_spoken=false event", () => {
      harness.emitBotOutputV2({ text: "Hello world", will_be_spoken: false, aggregated_by: "sentence" });

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe("Hello world");
    });

    it("creates a part for a new spoken segment", () => {
      harness.emitBotOutputV2({ text: "Hello world", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe("Hello world");
      expect(parts[0].segment_id).toBe(1);
    });

    it("stores original text unchanged for consecutive segments", () => {
      harness.emitBotOutputV2({ text: "Hello world.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({ text: "How are you?", will_be_spoken: true, spoken_status: "new", segment_id: 2, aggregated_by: "sentence" });

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[0].text).toBe("Hello world.");
      expect(parts[1].text).toBe("How are you?");
    });

    it("sets needsSeparator=true on the second segment, false on the first", () => {
      harness.emitBotOutputV2({ text: "Hello.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({ text: "Goodbye.", will_be_spoken: true, spoken_status: "new", segment_id: 2, aggregated_by: "sentence" });

      const parts = harness.getMessages()[0].parts;
      expect(parts[0].needsSeparator).toBeFalsy();
      expect(parts[1].needsSeparator).toBe(true);
    });

    it("does not add space before the very first segment", () => {
      harness.emitBotOutputV2({ text: "First.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });

      const parts = harness.getMessages()[0].parts;
      expect(parts[0].text).toBe("First.");
      expect(parts[0].needsSeparator).toBeFalsy();
    });

    it("each segment always creates its own part (no word-level aggregation in v2)", () => {
      harness.emitBotOutputV2({ text: "First segment.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({ text: "Second segment.", will_be_spoken: true, spoken_status: "new", segment_id: 2, aggregated_by: "sentence" });
      harness.emitBotOutputV2({ text: "Third segment.", will_be_spoken: true, spoken_status: "new", segment_id: 3, aggregated_by: "sentence" });

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(3);
      expect(parts[0].text).toBe("First segment.");
      expect(parts[1].text).toBe("Second segment.");
      expect(parts[2].text).toBe("Third segment.");
    });
  });

  // -------------------------------------------------------------------------
  // Cursor advancement via spoken_progress
  // -------------------------------------------------------------------------
  describe("cursor advancement", () => {
    it("advances cursor on in-progress event using accumulated_text length", () => {
      harness.emitBotOutputV2({ text: "Hello world.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({
        text: "",
        will_be_spoken: true,
        spoken_status: "in-progress",
        spoken_progress: { accumulated_text: "Hello", remaining_text: " world." },
        segment_id: 1,
      });

      const cursor = harness.getLastAssistantCursor();
      expect(cursor).toBeDefined();
      expect(cursor!.currentCharIndex).toBe(5); // "Hello".length
    });

    it("cursor maps directly to original text with no offset for second segment", () => {
      harness.emitBotOutputV2({ text: "Hello.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({ text: "World.", will_be_spoken: true, spoken_status: "new", segment_id: 2, aggregated_by: "sentence" });

      // Progress on second segment: accumulated_text="Wor" (3 chars into "World.")
      // Part text is "World." (unchanged); cursor should be at exactly 3
      harness.emitBotOutputV2({
        text: "",
        will_be_spoken: true,
        spoken_status: "in-progress",
        spoken_progress: { accumulated_text: "Wor", remaining_text: "ld." },
        segment_id: 2,
      });

      const cursor = harness.getLastAssistantCursor();
      expect(cursor).toBeDefined();
      expect(cursor!.currentCharIndex).toBe(3); // directly "Wor".length, no offset
    });

    it("marks part as final on completed event with full accumulated_text", () => {
      harness.emitBotOutputV2({ text: "Hello.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({
        text: "",
        will_be_spoken: true,
        spoken_status: "completed",
        spoken_progress: { accumulated_text: "Hello.", remaining_text: "" },
        segment_id: 1,
      });

      const cursor = harness.getLastAssistantCursor();
      expect(cursor).toBeDefined();
      expect(cursor!.partFinalFlags[0]).toBe(true);
    });

    it("targets the correct part by segment_id when multiple segments exist", () => {
      harness.emitBotOutputV2({ text: "Segment one.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({ text: "Segment two.", will_be_spoken: true, spoken_status: "new", segment_id: 2, aggregated_by: "sentence" });

      // Progress for segment 1 (already created, cursor starts at 0)
      harness.emitBotOutputV2({
        text: "",
        will_be_spoken: true,
        spoken_status: "in-progress",
        spoken_progress: { accumulated_text: "Segment", remaining_text: " one." },
        segment_id: 1,
      });

      const cursor = harness.getLastAssistantCursor();
      expect(cursor).toBeDefined();
      // Cursor should be on part 0 (segment 1), not part 1 (segment 2)
      expect(cursor!.currentPartIndex).toBe(0);
      expect(cursor!.currentCharIndex).toBe(7); // "Segment".length
    });

    it("progress event does not create a new part", () => {
      harness.emitBotOutputV2({ text: "Hello.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      const partsBefore = harness.getMessages()[0].parts.length;

      harness.emitBotOutputV2({
        text: "",
        will_be_spoken: true,
        spoken_status: "in-progress",
        spoken_progress: { accumulated_text: "Hel", remaining_text: "lo." },
        segment_id: 1,
      });

      expect(harness.getMessages()[0].parts.length).toBe(partsBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed will_be_spoken
  // -------------------------------------------------------------------------
  describe("mixed will_be_spoken", () => {
    it("creates separate parts for spoken and non-spoken segments", () => {
      harness.emitBotOutputV2({ text: "Spoken text.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });
      harness.emitBotOutputV2({ text: "Silent text.", will_be_spoken: false, aggregated_by: "sentence" });

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[0].text).toBe("Spoken text.");
      expect(parts[1].text).toBe("Silent text.");
      expect(parts[1].needsSeparator).toBe(true);
    });

    it("does not set hasReceivedUnspoken for will_be_spoken=false events", () => {
      harness.emitBotOutputV2({ text: "Silent text.", will_be_spoken: false, aggregated_by: "sentence" });

      const cursor = harness.getLastAssistantCursor();
      expect(cursor).toBeDefined();
      expect(cursor!.hasReceivedUnspoken).toBe(false);
    });

    it("sets hasReceivedUnspoken=true for will_be_spoken=true events", () => {
      harness.emitBotOutputV2({ text: "Hello.", will_be_spoken: true, spoken_status: "new", segment_id: 1, aggregated_by: "sentence" });

      const cursor = harness.getLastAssistantCursor();
      expect(cursor).toBeDefined();
      expect(cursor!.hasReceivedUnspoken).toBe(true);
    });
  });
});
