import { createStoreHarness } from "../helpers/storeHarness";
import {
  isMessageEmpty,
  mergeMessages,
} from "@/conversation/conversationActions";
import type { ConversationMessage } from "@/conversation/types";

describe("conversationStore - function calls", () => {
  let harness: ReturnType<typeof createStoreHarness>;

  beforeEach(() => {
    harness = createStoreHarness();
    harness.reset();
  });

  // -----------------------------------------------------------------------
  // addFunctionCall
  // -----------------------------------------------------------------------
  describe("addFunctionCall", () => {
    it("adds a function_call message with started status", () => {
      harness.addFunctionCall({ function_name: "get_weather" });

      const messages = harness.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("function_call");
      expect(messages[0].functionCall).toEqual({
        function_name: "get_weather",
        tool_call_id: undefined,
        args: undefined,
        status: "started",
      });
      expect(messages[0].final).toBe(false);
    });

    it("sets timestamps on the message", () => {
      harness.addFunctionCall({ function_name: "search" });

      const msg = harness.getMessages()[0];
      expect(msg.createdAt).toBeTruthy();
      expect(msg.updatedAt).toBeTruthy();
    });

    it("adds function call with tool_call_id and args", () => {
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_123",
        args: { query: "hello" },
      });

      const fc = harness.getMessages()[0].functionCall!;
      expect(fc.function_name).toBe("search");
      expect(fc.tool_call_id).toBe("call_123");
      expect(fc.args).toEqual({ query: "hello" });
      expect(fc.status).toBe("started");
    });

    it("does not add duplicate when tool_call_id already exists", () => {
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_123",
      });
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_123",
      });

      expect(harness.getMessages()).toHaveLength(1);
    });

    it("allows multiple function calls without tool_call_id", () => {
      harness.addFunctionCall({ function_name: "fn_a" });
      harness.addFunctionCall({ function_name: "fn_b" });

      expect(harness.getMessages()).toHaveLength(2);
    });

    it("allows different tool_call_ids", () => {
      harness.addFunctionCall({
        function_name: "fn_a",
        tool_call_id: "call_1",
      });
      harness.addFunctionCall({
        function_name: "fn_b",
        tool_call_id: "call_2",
      });

      expect(harness.getMessages()).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // updateFunctionCall
  // -----------------------------------------------------------------------
  describe("updateFunctionCall", () => {
    it("updates status of an existing function call by tool_call_id", () => {
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });

      const found = harness.updateFunctionCall("call_1", {
        status: "in_progress",
      });

      expect(found).toBe(true);
      const fc = harness.getMessages()[0].functionCall!;
      expect(fc.status).toBe("in_progress");
    });

    it("updates result and status to completed", () => {
      harness.addFunctionCall({
        function_name: "get_weather",
        tool_call_id: "call_1",
      });

      harness.updateFunctionCall("call_1", {
        status: "completed",
        result: { temp: 72, unit: "F" },
      });

      const msg = harness.getMessages()[0];
      expect(msg.functionCall!.status).toBe("completed");
      expect(msg.functionCall!.result).toEqual({ temp: 72, unit: "F" });
      expect(msg.final).toBe(true);
    });

    it("marks message as final when status is completed", () => {
      harness.addFunctionCall({
        function_name: "fn",
        tool_call_id: "call_1",
      });

      harness.updateFunctionCall("call_1", { status: "completed" });

      expect(harness.getMessages()[0].final).toBe(true);
    });

    it("does not mark message as final for non-completed status", () => {
      harness.addFunctionCall({
        function_name: "fn",
        tool_call_id: "call_1",
      });

      harness.updateFunctionCall("call_1", { status: "in_progress" });

      expect(harness.getMessages()[0].final).toBe(false);
    });

    it("returns false when tool_call_id not found", () => {
      harness.addFunctionCall({
        function_name: "fn",
        tool_call_id: "call_1",
      });

      const found = harness.updateFunctionCall("nonexistent", {
        status: "completed",
      });

      expect(found).toBe(false);
    });

    it("updates function_name if provided", () => {
      harness.addFunctionCall({
        tool_call_id: "call_1",
      });

      harness.updateFunctionCall("call_1", {
        function_name: "get_weather",
      });

      expect(harness.getMessages()[0].functionCall!.function_name).toBe(
        "get_weather"
      );
    });

    it("sets cancelled flag", () => {
      harness.addFunctionCall({
        function_name: "fn",
        tool_call_id: "call_1",
      });

      harness.updateFunctionCall("call_1", {
        status: "completed",
        cancelled: true,
      });

      const fc = harness.getMessages()[0].functionCall!;
      expect(fc.status).toBe("completed");
      expect(fc.cancelled).toBe(true);
    });

    it("updates the last matching function call when duplicates exist", () => {
      // Add two function calls with different tool_call_ids
      harness.addFunctionCall({
        function_name: "fn",
        tool_call_id: "call_1",
      });
      harness.addFunctionCall({
        function_name: "fn",
        tool_call_id: "call_2",
      });

      harness.updateFunctionCall("call_1", { status: "completed" });

      // The first function call should be completed
      const messages = harness.getMessages();
      const call1 = messages.find(
        (m) => m.functionCall?.tool_call_id === "call_1"
      );
      const call2 = messages.find(
        (m) => m.functionCall?.tool_call_id === "call_2"
      );
      expect(call1?.functionCall?.status).toBe("completed");
      expect(call2?.functionCall?.status).toBe("started");
    });
  });

  // -----------------------------------------------------------------------
  // updateLastStartedFunctionCall
  // -----------------------------------------------------------------------
  describe("updateLastStartedFunctionCall", () => {
    it("updates the last started function call without a tool_call_id", () => {
      harness.addFunctionCall({ function_name: "search" });

      const found = harness.updateLastStartedFunctionCall({
        tool_call_id: "call_1",
        args: { query: "test" },
        status: "in_progress",
      });

      expect(found).toBe(true);
      const fc = harness.getMessages()[0].functionCall!;
      expect(fc.tool_call_id).toBe("call_1");
      expect(fc.args).toEqual({ query: "test" });
      expect(fc.status).toBe("in_progress");
    });

    it("returns false if no started function call without tool_call_id exists", () => {
      // Add a function call that already has a tool_call_id
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });

      const found = harness.updateLastStartedFunctionCall({
        tool_call_id: "call_2",
        status: "in_progress",
      });

      expect(found).toBe(false);
    });

    it("returns false if the only function call is already in_progress", () => {
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });
      harness.updateFunctionCall("call_1", { status: "in_progress" });

      const found = harness.updateLastStartedFunctionCall({
        tool_call_id: "call_2",
        status: "in_progress",
      });

      expect(found).toBe(false);
    });

    it("returns false when no function calls exist", () => {
      const found = harness.updateLastStartedFunctionCall({
        tool_call_id: "call_1",
        status: "in_progress",
      });

      expect(found).toBe(false);
    });

    it("targets the last started entry when multiple exist", () => {
      harness.addFunctionCall({ function_name: "fn_a" });
      harness.addFunctionCall({ function_name: "fn_b" });

      const found = harness.updateLastStartedFunctionCall({
        tool_call_id: "call_b",
        status: "in_progress",
      });

      expect(found).toBe(true);
      // The last added function call should be updated
      const messages = harness.getMessages();
      const updated = messages.find(
        (m) => m.functionCall?.tool_call_id === "call_b"
      );
      expect(updated).toBeDefined();
      expect(updated!.functionCall!.function_name).toBe("fn_b");
    });
  });

  // -----------------------------------------------------------------------
  // isMessageEmpty - function_call role
  // -----------------------------------------------------------------------
  describe("isMessageEmpty - function_call", () => {
    it("returns false for function_call messages (even with empty parts)", () => {
      const fcMessage: ConversationMessage = {
        role: "function_call",
        parts: [],
        createdAt: new Date().toISOString(),
        final: false,
        functionCall: {
          function_name: "test",
          status: "started",
        },
      };

      expect(isMessageEmpty(fcMessage)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // mergeMessages - function_call role
  // -----------------------------------------------------------------------
  describe("mergeMessages - function_call", () => {
    it("does not merge function_call messages with each other", () => {
      const now = new Date();

      const messages: ConversationMessage[] = [
        {
          role: "function_call",
          parts: [],
          createdAt: now.toISOString(),
          final: false,
          functionCall: { function_name: "fn_a", status: "started" },
        },
        {
          role: "function_call",
          parts: [],
          createdAt: new Date(now.getTime() + 100).toISOString(),
          final: false,
          functionCall: { function_name: "fn_b", status: "started" },
        },
      ];

      const merged = mergeMessages(messages);
      expect(merged).toHaveLength(2);
    });

    it("does not merge function_call with adjacent assistant messages", () => {
      const now = new Date();

      const messages: ConversationMessage[] = [
        {
          role: "assistant",
          parts: [{ text: "Hello", final: true, createdAt: "" }],
          createdAt: now.toISOString(),
          final: true,
        },
        {
          role: "function_call",
          parts: [],
          createdAt: new Date(now.getTime() + 100).toISOString(),
          final: false,
          functionCall: { function_name: "search", status: "started" },
        },
      ];

      const merged = mergeMessages(messages);
      expect(merged).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // deduplicateFunctionCalls (tested via normalizeMessagesForUI)
  // -----------------------------------------------------------------------
  describe("deduplication via addMessage pipeline", () => {
    it("keeps the most advanced status when duplicates share a tool_call_id", () => {
      // Simulate the scenario: add a started entry, then add another
      // with same tool_call_id but advanced status via updateFunctionCall
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });

      // Update to completed
      harness.updateFunctionCall("call_1", {
        status: "completed",
        result: "done",
      });

      const messages = harness.getMessages();
      // Should only have one entry for this tool_call_id
      const fcMessages = messages.filter(
        (m) => m.functionCall?.tool_call_id === "call_1"
      );
      expect(fcMessages).toHaveLength(1);
      expect(fcMessages[0].functionCall!.status).toBe("completed");
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle: started -> in_progress -> completed
  // -----------------------------------------------------------------------
  describe("function call lifecycle", () => {
    it("transitions started -> in_progress -> completed", () => {
      // Started event
      harness.addFunctionCall({ function_name: "get_weather" });
      expect(harness.getMessages()[0].functionCall!.status).toBe("started");

      // InProgress event updates the started entry
      harness.updateLastStartedFunctionCall({
        tool_call_id: "call_abc",
        args: { location: "NYC" },
        status: "in_progress",
      });

      let fc = harness
        .getMessages()
        .find((m) => m.functionCall?.tool_call_id === "call_abc");
      expect(fc).toBeDefined();
      expect(fc!.functionCall!.status).toBe("in_progress");
      expect(fc!.functionCall!.args).toEqual({ location: "NYC" });

      // Completed event
      harness.updateFunctionCall("call_abc", {
        status: "completed",
        result: { temp: 72 },
      });

      fc = harness
        .getMessages()
        .find((m) => m.functionCall?.tool_call_id === "call_abc");
      expect(fc).toBeDefined();
      expect(fc!.functionCall!.status).toBe("completed");
      expect(fc!.functionCall!.result).toEqual({ temp: 72 });
      expect(fc!.final).toBe(true);
    });

    it("handles InProgress arriving before Started", () => {
      // InProgress arrives first (no started entry yet)
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
        args: { q: "test" },
      });
      harness.updateFunctionCall("call_1", { status: "in_progress" });

      let messages = harness.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].functionCall!.status).toBe("in_progress");

      // Completed
      harness.updateFunctionCall("call_1", {
        status: "completed",
        result: ["result1"],
      });

      messages = harness.getMessages();
      const fc = messages.find(
        (m) => m.functionCall?.tool_call_id === "call_1"
      );
      expect(fc!.functionCall!.status).toBe("completed");
      expect(fc!.functionCall!.result).toEqual(["result1"]);
    });

    it("handles cancelled function calls", () => {
      harness.addFunctionCall({
        function_name: "slow_fn",
        tool_call_id: "call_1",
      });

      harness.updateFunctionCall("call_1", {
        status: "completed",
        cancelled: true,
      });

      const fc = harness.getMessages()[0].functionCall!;
      expect(fc.status).toBe("completed");
      expect(fc.cancelled).toBe(true);
    });

    it("function calls coexist with assistant messages", () => {
      // Add an assistant message
      harness.addMessage({
        role: "assistant",
        final: false,
        parts: [{ text: "Let me check", final: false, createdAt: "" }],
      });

      // Add a function call
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });

      const messages = harness.getMessages();
      expect(messages.length).toBeGreaterThanOrEqual(2);

      const assistantMsg = messages.find((m) => m.role === "assistant");
      const fcMsg = messages.find((m) => m.role === "function_call");
      expect(assistantMsg).toBeDefined();
      expect(fcMsg).toBeDefined();
    });

    it("multiple concurrent function calls", () => {
      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });
      harness.addFunctionCall({
        function_name: "get_weather",
        tool_call_id: "call_2",
      });

      // Complete them in different order
      harness.updateFunctionCall("call_2", {
        status: "completed",
        result: { temp: 72 },
      });
      harness.updateFunctionCall("call_1", {
        status: "completed",
        result: ["result"],
      });

      const messages = harness.getMessages();
      const call1 = messages.find(
        (m) => m.functionCall?.tool_call_id === "call_1"
      );
      const call2 = messages.find(
        (m) => m.functionCall?.tool_call_id === "call_2"
      );

      expect(call1!.functionCall!.status).toBe("completed");
      expect(call2!.functionCall!.status).toBe("completed");
      expect(call1!.functionCall!.result).toEqual(["result"]);
      expect(call2!.functionCall!.result).toEqual({ temp: 72 });
    });
  });

  // -----------------------------------------------------------------------
  // Message callbacks
  // -----------------------------------------------------------------------
  describe("message callbacks for function calls", () => {
    it("triggers callbacks when adding a function call", () => {
      let callbackMessage: ConversationMessage | undefined;
      harness.registerMessageCallback("test", (msg) => {
        callbackMessage = msg;
      });

      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });

      expect(callbackMessage).toBeDefined();
      expect(callbackMessage!.role).toBe("function_call");

      harness.unregisterMessageCallback("test");
    });

    it("triggers callbacks when updating a function call", () => {
      let callbackMessage: ConversationMessage | undefined;

      harness.addFunctionCall({
        function_name: "search",
        tool_call_id: "call_1",
      });

      harness.registerMessageCallback("test", (msg) => {
        callbackMessage = msg;
      });

      harness.updateFunctionCall("call_1", { status: "completed" });

      expect(callbackMessage).toBeDefined();
      expect(callbackMessage!.functionCall!.status).toBe("completed");

      harness.unregisterMessageCallback("test");
    });
  });
});
