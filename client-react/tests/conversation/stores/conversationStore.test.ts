import { createStoreHarness } from "../helpers/storeHarness";
import {
  filterEmptyMessages,
  isMessageEmpty,
  mergeMessages,
  stripTurnCompletionMarker,
} from "@/conversation/conversationActions";
import type { ConversationMessage } from "@/conversation/types";

/** Helper: create a minimal message for merge/filter tests. */
function msg(
  role: "user" | "assistant",
  text: string,
  opts: { createdAt?: string; final?: boolean } = {}
): ConversationMessage {
  return {
    role,
    final: opts.final ?? true,
    parts: [{ text, final: true, createdAt: opts.createdAt ?? "2024-01-01" }],
    createdAt: opts.createdAt ?? new Date().toISOString(),
  };
}

describe("conversationStore", () => {
  let harness: ReturnType<typeof createStoreHarness>;

  beforeEach(() => {
    harness = createStoreHarness();
    harness.reset();
  });

  // -----------------------------------------------------------------------
  // addMessage
  // -----------------------------------------------------------------------
  describe("addMessage", () => {
    it("adds a message to the store", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });
      expect(harness.getMessages()).toHaveLength(1);
      expect(harness.getMessages()[0].role).toBe("assistant");
    });

    it("sets createdAt and updatedAt timestamps", () => {
      harness.addMessage({
        role: "user",
        final: false,
        parts: [],
      });
      const message = harness.getMessages()[0];
      expect(message.createdAt).toBeTruthy();
      expect(message.updatedAt).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // finalizeLastMessage
  // -----------------------------------------------------------------------
  describe("finalizeLastMessage", () => {
    it("marks message and last part as final", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [{ text: "Hello", final: false, createdAt: "" }],
      });
      harness.finalizeAssistant();
      const message = harness.getMessages()[0];
      expect(message.final).toBe(true);
      expect(message.parts[0].final).toBe(true);
    });

    it("removes empty messages on finalize", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });
      harness.finalizeAssistant();
      expect(harness.getMessages()).toHaveLength(0);
    });

    it("does nothing if no message of that role exists", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [{ text: "Hi", final: false, createdAt: "" }],
      });
      harness.finalizeUser(); // No user message
      // Assistant message should be unchanged
      expect(harness.getMessages()[0].final).toBeFalsy();
    });
  });

  // -----------------------------------------------------------------------
  // removeEmptyLastMessage
  // -----------------------------------------------------------------------
  describe("removeEmptyLastMessage", () => {
    it("removes the last message if it is empty", () => {
      harness.addMessage({
        role: "user",
        final: false,
        parts: [],
      });
      expect(harness.getMessages()).toHaveLength(1);
      harness.removeEmptyLastUserMessage();
      expect(harness.getMessages()).toHaveLength(0);
    });

    it("does not remove the last message if it has content", () => {
      harness.addMessage({
        role: "user",
        final: false,
        parts: [{ text: "Hello", final: false, createdAt: "" }],
      });
      harness.removeEmptyLastUserMessage();
      expect(harness.getMessages()).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // upsertUserTranscript
  // -----------------------------------------------------------------------
  describe("upsertUserTranscript", () => {
    it("creates new user message for first transcript", () => {
      harness.emitUserTranscript("Hello", false);
      const messages = harness.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].parts[0].text).toBe("Hello");
    });

    it("updates in-progress part for interim transcripts", () => {
      harness.emitUserTranscript("Hello", false);
      harness.emitUserTranscript("Hello world", false);
      const messages = harness.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].parts).toHaveLength(1);
      expect(messages[0].parts[0].text).toBe("Hello world");
    });

    it("finalizes part but not message on final transcript", () => {
      harness.emitUserTranscript("Hello", false);
      harness.emitUserTranscript("Hello world", true);
      const messages = harness.getMessages();
      expect(messages[0].parts[0].text).toBe("Hello world");
      expect(messages[0].parts[0].final).toBe(true);
      // Message stays non-final; finalization happens via UserStoppedSpeaking timer
      expect(messages[0].final).toBe(false);
    });

    it("creates new part after a final part in same message", () => {
      harness.emitUserTranscript("First sentence", true);

      // Message stays non-final, so second transcript adds a new part
      // to the same message (the first part is final but the message isn't).
      harness.emitUserTranscript("Second sentence", false);
      const messages = harness.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].parts).toHaveLength(2);
      expect(messages[0].parts[0].text).toBe("First sentence");
      expect(messages[0].parts[0].final).toBe(true);
      expect(messages[0].parts[1].text).toBe("Second sentence");
      expect(messages[0].parts[1].final).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // updateAssistantBotOutput -- unspoken
  // -----------------------------------------------------------------------
  describe("updateAssistantBotOutput (unspoken)", () => {
    it("appends word-level chunks to same part", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      harness.updateAssistantBotOutput("Hello", false, false, "word");
      harness.updateAssistantBotOutput(" world", false, false, "word");

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe("Hello world");
      expect(parts[0].aggregatedBy).toBe("word");
    });

    it("creates new part for sentence-level chunks", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      harness.updateAssistantBotOutput(
        "First sentence.",
        true,
        false,
        "sentence"
      );
      harness.updateAssistantBotOutput(
        "Second sentence.",
        true,
        false,
        "sentence"
      );

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[0].text).toBe("First sentence.");
      expect(parts[1].text).toBe("Second sentence.");
    });

    it("creates new part for custom aggregation types", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      harness.updateAssistantBotOutput(
        "Some text",
        false,
        false,
        "sentence"
      );
      harness.updateAssistantBotOutput(
        "console.log('hi')",
        false,
        false,
        "code"
      );

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[1].aggregatedBy).toBe("code");
    });
  });

  // -----------------------------------------------------------------------
  // updateAssistantBotOutput -- spoken
  // -----------------------------------------------------------------------
  describe("updateAssistantBotOutput (spoken)", () => {
    it("advances cursor for existing unspoken content", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      // First send unspoken
      harness.updateAssistantBotOutput("Hello", false, false, "word");
      harness.updateAssistantBotOutput(" world", false, false, "word");

      // Then spoken
      harness.updateAssistantBotOutput("Hello", false, true, "word");

      const cursor = harness.getBotOutputState().values().next().value;
      expect(cursor).toBeDefined();
      expect(cursor!.currentCharIndex).toBeGreaterThan(0);
    });

    it("creates new fully-spoken part when no unspoken content exists", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      // Spoken without prior unspoken
      harness.updateAssistantBotOutput("Hello", false, true, "word");

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe("Hello");
    });
  });

  // -----------------------------------------------------------------------
  // Helper functions
  // -----------------------------------------------------------------------
  describe("isMessageEmpty", () => {
    it("returns true for message with no parts", () => {
      expect(
        isMessageEmpty({
          role: "assistant",
          parts: [],
          createdAt: "",
        })
      ).toBe(true);
    });

    it("returns true for message with only whitespace text", () => {
      expect(
        isMessageEmpty({
          role: "assistant",
          parts: [{ text: "  ", final: false, createdAt: "" }],
          createdAt: "",
        })
      ).toBe(true);
    });

    it("returns false for message with content", () => {
      expect(
        isMessageEmpty({
          role: "assistant",
          parts: [{ text: "Hello", final: false, createdAt: "" }],
          createdAt: "",
        })
      ).toBe(false);
    });

    it("handles BotOutputText objects", () => {
      expect(
        isMessageEmpty({
          role: "assistant",
          parts: [
            {
              text: { spoken: "", unspoken: "" },
              final: false,
              createdAt: "",
            },
          ],
          createdAt: "",
        })
      ).toBe(true);

      expect(
        isMessageEmpty({
          role: "assistant",
          parts: [
            {
              text: { spoken: "Hello", unspoken: "" },
              final: false,
              createdAt: "",
            },
          ],
          createdAt: "",
        })
      ).toBe(false);
    });
  });

  describe("mergeMessages", () => {
    it("merges consecutive same-role messages within 30s", () => {
      const now = new Date();
      const messages: ConversationMessage[] = [
        msg("assistant", "Hello", { createdAt: now.toISOString() }),
        msg("assistant", "World", {
          createdAt: new Date(now.getTime() + 5000).toISOString(),
        }),
      ];

      const merged = mergeMessages(messages);

      expect(merged).toHaveLength(1);
      expect(merged[0].parts).toHaveLength(2);
    });

    it("does not merge messages from different roles", () => {
      const now = new Date();
      const messages: ConversationMessage[] = [
        msg("assistant", "Hello", { createdAt: now.toISOString() }),
        msg("user", "Hi", {
          createdAt: new Date(now.getTime() + 1000).toISOString(),
        }),
      ];

      const merged = mergeMessages(messages);

      expect(merged).toHaveLength(2);
    });

    it("does not merge messages more than 30s apart", () => {
      const now = new Date();
      const messages: ConversationMessage[] = [
        msg("assistant", "Hello", { createdAt: now.toISOString() }),
        msg("assistant", "World", {
          createdAt: new Date(now.getTime() + 31000).toISOString(),
        }),
      ];

      const merged = mergeMessages(messages);

      expect(merged).toHaveLength(2);
    });

    it("does not merge system messages", () => {
      const now = new Date();
      const messages: ConversationMessage[] = [
        {
          role: "system",
          parts: [{ text: "A", final: true, createdAt: "" }],
          createdAt: now.toISOString(),
          final: true,
        },
        {
          role: "system",
          parts: [{ text: "B", final: true, createdAt: "" }],
          createdAt: new Date(now.getTime() + 1000).toISOString(),
          final: true,
        },
      ];

      const merged = mergeMessages(messages);

      expect(merged).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // stripTurnCompletionMarker
  // -----------------------------------------------------------------------
  describe("stripTurnCompletionMarker", () => {
    it("strips ✓ marker with trailing space", () => {
      expect(stripTurnCompletionMarker("✓ Hello")).toBe("Hello");
    });

    it("strips ○ marker (incomplete short)", () => {
      expect(stripTurnCompletionMarker("○")).toBe("");
    });

    it("strips ◐ marker (incomplete long)", () => {
      expect(stripTurnCompletionMarker("◐")).toBe("");
    });

    it("strips marker without trailing space", () => {
      expect(stripTurnCompletionMarker("✓Hello")).toBe("Hello");
    });

    it("does not strip markers that are not at the start", () => {
      expect(stripTurnCompletionMarker("Hello ✓")).toBe("Hello ✓");
    });

    it("returns empty string unchanged", () => {
      expect(stripTurnCompletionMarker("")).toBe("");
    });

    it("does not strip regular text", () => {
      expect(stripTurnCompletionMarker("Hello world")).toBe("Hello world");
    });
  });

  // -----------------------------------------------------------------------
  // updateAssistantBotOutput -- turn completion marker filtering
  // -----------------------------------------------------------------------
  describe("updateAssistantBotOutput (turn completion markers)", () => {
    it("strips ✓ marker from first unspoken chunk", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      harness.updateAssistantBotOutput("✓ Japan", false, false, "word");

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe("Japan");
    });

    it("drops chunk entirely when it is only a marker", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      harness.updateAssistantBotOutput("○", false, false, "word");

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(0);
    });

    it("strips marker from spoken chunks too", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [],
      });

      harness.updateAssistantBotOutput("✓ Hello", false, true, "word");

      const parts = harness.getMessages()[0].parts;
      expect(parts).toHaveLength(1);
      expect(parts[0].text).toBe("Hello");
    });
  });

  // -----------------------------------------------------------------------
  // injectMessage -- backdating during active assistant message
  // -----------------------------------------------------------------------
  describe("injectMessage (backdating)", () => {
    const T0 = "2024-01-01T00:00:00.000Z";

    it("backdates injected message before active assistant message", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [{ text: "Hello", final: false, createdAt: T0 }],
      });
      const assistantCreatedAt = harness.getMessages()[0].createdAt;

      harness.injectMessage({
        role: "system",
        parts: [{ text: "System info", final: true, createdAt: T0 }],
      });

      const messages = harness.getMessages();
      expect(messages).toHaveLength(2);
      // System message should sort before the assistant message
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("assistant");
      expect(messages[0].createdAt < assistantCreatedAt).toBe(true);
    });

    it("does not backdate when assistant message is final", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [{ text: "Hello", final: false, createdAt: T0 }],
      });
      harness.finalizeAssistant();

      harness.injectMessage({
        role: "system",
        parts: [{ text: "System info", final: true, createdAt: T0 }],
      });

      const messages = harness.getMessages();
      // System message should sort after the finalized assistant message
      expect(messages[0].role).toBe("assistant");
      expect(messages[1].role).toBe("system");
    });

    it("does not backdate when no assistant message exists", () => {
      harness.injectMessage({
        role: "system",
        parts: [{ text: "System info", final: true, createdAt: T0 }],
      });

      const messages = harness.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("system");
    });

    it("does not backdate injected user messages", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [{ text: "Hello", final: false, createdAt: T0 }],
      });

      harness.injectMessage({
        role: "user",
        parts: [{ text: "Hi there", final: true, createdAt: T0 }],
      });

      const messages = harness.getMessages();
      // User message should sort after the assistant (not backdated)
      expect(messages[messages.length - 1].role).toBe("user");
    });

    it("does not backdate when non-final assistant is not the last message", () => {
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [{ text: "Hello", final: false, createdAt: T0 }],
      });
      // User message comes after the assistant
      harness.emitUserTranscript("Hey", true);
      harness.finalizeUser();

      harness.injectMessage({
        role: "system",
        parts: [{ text: "System info", final: true, createdAt: T0 }],
      });

      const messages = harness.getMessages();
      // System message should be last, not backdated before the user message
      expect(messages[messages.length - 1].role).toBe("system");
    });
  });

  describe("filterEmptyMessages", () => {
    it("removes empty messages that have a later non-empty message with same role", () => {
      const messages: ConversationMessage[] = [
        msg("assistant", ""), // empty
        msg("assistant", "Hello"), // non-empty
      ];

      // Fix: empty message part
      messages[0].parts = [];

      const filtered = filterEmptyMessages(messages);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].parts[0].text).toBe("Hello");
    });

    it("keeps empty message if no later same-role non-empty message exists", () => {
      const messages: ConversationMessage[] = [
        {
          role: "assistant",
          parts: [],
          createdAt: new Date().toISOString(),
        },
      ];

      const filtered = filterEmptyMessages(messages);

      expect(filtered).toHaveLength(1);
    });
  });
});
