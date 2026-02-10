/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, test } from "@jest/globals";

import { FunctionCallCallback, PipecatClient } from "./../client";
import { messageSizeWithinLimit } from "./../client/utils";
import { RTVIEvent, RTVIMessage } from "./../rtvi";
import { MessageTooLargeError } from "./../rtvi/errors";
import { TransportStub } from "./stubs/transport";

describe("PipecatClient Methods", () => {
  let client: PipecatClient;

  beforeEach(() => {
    client = new PipecatClient({
      transport: TransportStub.create(),
    });
  });

  test("connect() and disconnect()", async () => {
    const stateChanges: string[] = [];
    const mockStateChangeHandler = (newState: string) => {
      stateChanges.push(newState);
    };
    client.on(RTVIEvent.TransportStateChanged, mockStateChangeHandler);

    expect(client.connected).toBe(false);

    await client.connect();

    expect(client.connected).toBe(true);
    expect(client.state === "ready").toBe(true);

    await client.disconnect();

    expect(client.connected).toBe(false);
    expect(client.state).toBe("disconnected");

    expect(stateChanges).toEqual([
      "initializing",
      "initialized",
      "connecting",
      "connected",
      "ready",
      "disconnecting",
      "disconnected",
    ]);
  });

  test("initDevices() sets initialized state", async () => {
    const stateChanges: string[] = [];
    const mockStateChangeHandler = (newState: string) => {
      stateChanges.push(newState);
    };
    client.on(RTVIEvent.TransportStateChanged, mockStateChangeHandler);

    await client.initDevices();

    expect(client.state === "initialized").toBe(true);

    expect(stateChanges).toEqual(["initializing", "initialized"]);
  });

  test("Connection params should be nullable", async () => {
    const stateChanges: string[] = [];
    const mockStateChangeHandler = (newState: string) => {
      stateChanges.push(newState);
    };
    client.on(RTVIEvent.TransportStateChanged, mockStateChangeHandler);
    await client.connect();
    expect(client.state === "ready").toBe(true);
    expect(stateChanges).toEqual([
      "initializing",
      "initialized",
      "connecting",
      "connected",
      "ready",
    ]);
  });

  test("registerFunctionCallHandler should register a new handler with the specified name", async () => {
    let handled = false;
    let fooVal = "";
    const fcHander: FunctionCallCallback = (args) => {
      fooVal = args.arguments.foo as string;
      handled = true;
      return Promise.resolve();
    };
    client.registerFunctionCallHandler("testHandler", fcHander);
    const msg: RTVIMessage = {
      id: "123",
      label: "rtvi-ai",
      type: "llm-function-call",
      data: {
        function_name: "testHandler",
        tool_call_id: "call-123",
        args: { foo: "bar" },
      },
    };
    (client.transport as TransportStub).handleMessage(msg);
    expect(handled).toBe(true);
    expect(fooVal).toBe("bar");
  });

  test("llm-function-call-started should trigger callback and emit event", async () => {
    let callbackTriggered = false;
    let eventTriggered = false;
    let callbackData: any = null;
    let eventData: any = null;

    const clientWithCallbacks = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onLLMFunctionCallStarted: (data) => {
          callbackTriggered = true;
          callbackData = data;
        },
      },
    });

    clientWithCallbacks.on(RTVIEvent.LLMFunctionCallStarted, (data) => {
      eventTriggered = true;
      eventData = data;
    });

    const msg: RTVIMessage = {
      id: "123",
      label: "rtvi-ai",
      type: "llm-function-call-started",
      data: {
        function_name: "testFunction",
      },
    };

    (clientWithCallbacks.transport as TransportStub).handleMessage(msg);

    expect(callbackTriggered).toBe(true);
    expect(eventTriggered).toBe(true);
    expect(callbackData.function_name).toBe("testFunction");
    expect(eventData.function_name).toBe("testFunction");
  });

  test("llm-function-call-in-progress should trigger callback and emit event", async () => {
    let callbackTriggered = false;
    let eventTriggered = false;
    let callbackData: any = null;
    let eventData: any = null;

    const clientWithCallbacks = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onLLMFunctionCallInProgress: (data) => {
          callbackTriggered = true;
          callbackData = data;
        },
      },
    });

    clientWithCallbacks.on(RTVIEvent.LLMFunctionCallInProgress, (data) => {
      eventTriggered = true;
      eventData = data;
    });

    const msg: RTVIMessage = {
      id: "456",
      label: "rtvi-ai",
      type: "llm-function-call-in-progress",
      data: {
        function_name: "testFunction",
        tool_call_id: "call-456",
        args: { param1: "value1" },
      },
    };

    (clientWithCallbacks.transport as TransportStub).handleMessage(msg);

    expect(callbackTriggered).toBe(true);
    expect(eventTriggered).toBe(true);
    expect(callbackData.function_name).toBe("testFunction");
    expect(callbackData.tool_call_id).toBe("call-456");
    expect(callbackData.args.param1).toBe("value1");
    expect(eventData.function_name).toBe("testFunction");
    expect(eventData.tool_call_id).toBe("call-456");
    expect(eventData.args.param1).toBe("value1");
  });

  test("llm-function-call-stopped should trigger callback and emit event", async () => {
    let callbackTriggered = false;
    let eventTriggered = false;
    let callbackData: any = null;
    let eventData: any = null;

    const clientWithCallbacks = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onLLMFunctionCallStopped: (data) => {
          callbackTriggered = true;
          callbackData = data;
        },
      },
    });

    clientWithCallbacks.on(RTVIEvent.LLMFunctionCallStopped, (data) => {
      eventTriggered = true;
      eventData = data;
    });

    const msg: RTVIMessage = {
      id: "789",
      label: "rtvi-ai",
      type: "llm-function-call-stopped",
      data: {
        function_name: "testFunction",
        tool_call_id: "call-789",
        cancelled: false,
        result: { success: true },
      },
    };

    (clientWithCallbacks.transport as TransportStub).handleMessage(msg);

    expect(callbackTriggered).toBe(true);
    expect(eventTriggered).toBe(true);
    expect(callbackData.function_name).toBe("testFunction");
    expect(callbackData.tool_call_id).toBe("call-789");
    expect(callbackData.cancelled).toBe(false);
    expect(callbackData.result.success).toBe(true);
    expect(eventData.function_name).toBe("testFunction");
    expect(eventData.tool_call_id).toBe("call-789");
    expect(eventData.cancelled).toBe(false);
    expect(eventData.result.success).toBe(true);
  });

  test("deprecated llm-function-call should trigger callback and emit event", async () => {
    let callbackTriggered = false;
    let eventTriggered = false;
    let callbackData: any = null;
    let eventData: any = null;

    const clientWithCallbacks = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onLLMFunctionCall: (data) => {
          callbackTriggered = true;
          callbackData = data;
        },
      },
    });

    clientWithCallbacks.on(RTVIEvent.LLMFunctionCall, (data) => {
      eventTriggered = true;
      eventData = data;
    });

    const msg: RTVIMessage = {
      id: "999",
      label: "rtvi-ai",
      type: "llm-function-call",
      data: {
        function_name: "deprecatedFunction",
        tool_call_id: "call-999",
        args: { deprecated: true },
      },
    };

    (clientWithCallbacks.transport as TransportStub).handleMessage(msg);

    expect(callbackTriggered).toBe(true);
    expect(eventTriggered).toBe(true);
    expect(callbackData.function_name).toBe("deprecatedFunction");
    expect(callbackData.tool_call_id).toBe("call-999");
    expect(callbackData.args.deprecated).toBe(true);
    expect(eventData.function_name).toBe("deprecatedFunction");
    expect(eventData.tool_call_id).toBe("call-999");
    expect(eventData.args.deprecated).toBe(true);
  });

  test("user-mute-started should trigger callback and emit event", async () => {
    let callbackTriggered = false;
    let eventTriggered = false;

    const clientWithCallbacks = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onUserMuteStarted: () => {
          callbackTriggered = true;
        },
      },
    });

    clientWithCallbacks.on(RTVIEvent.UserMuteStarted, () => {
      eventTriggered = true;
    });

    const msg: RTVIMessage = {
      id: "user-mute-1",
      label: "rtvi-ai",
      type: "user-mute-started",
      data: {},
    };

    (clientWithCallbacks.transport as TransportStub).handleMessage(msg);

    expect(callbackTriggered).toBe(true);
    expect(eventTriggered).toBe(true);
  });

  test("user-mute-stopped should trigger callback and emit event", async () => {
    let callbackTriggered = false;
    let eventTriggered = false;

    const clientWithCallbacks = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onUserMuteStopped: () => {
          callbackTriggered = true;
        },
      },
    });

    clientWithCallbacks.on(RTVIEvent.UserMuteStopped, () => {
      eventTriggered = true;
    });

    const msg: RTVIMessage = {
      id: "user-mute-2",
      label: "rtvi-ai",
      type: "user-mute-stopped",
      data: {},
    };

    (clientWithCallbacks.transport as TransportStub).handleMessage(msg);

    expect(callbackTriggered).toBe(true);
    expect(eventTriggered).toBe(true);
  });

  test("enableScreenShare should enable screen share", async () => {
    await client.connect();
    client.enableScreenShare(true);
    expect(client.isSharingScreen).toBe(true);
  });
});

describe("messageSizeWithinLimit utility function", () => {
  test("should return true for messages within size limit", () => {
    const smallMessage = { type: "test", data: "small payload" };
    const maxSize = 1024 * 1024; // 1 MB
    expect(messageSizeWithinLimit(smallMessage, maxSize)).toBe(true);
  });

  test("should return false for messages exceeding size limit", () => {
    // Create a large message (100,000 characters creates ~100KB payload)
    const LARGE_MESSAGE_CHARS = 100000;
    const largeData = "x".repeat(LARGE_MESSAGE_CHARS);
    const largeMessage = { type: "test", data: largeData };
    const maxSize = 1000; // 1000 bytes - much smaller than the message
    expect(messageSizeWithinLimit(largeMessage, maxSize)).toBe(false);
  });

  test("should correctly calculate size for complex nested objects", () => {
    const complexMessage = {
      type: "test",
      nested: {
        level1: {
          level2: {
            data: "some data",
            array: [1, 2, 3, 4, 5],
          },
        },
      },
    };
    const maxSize = 1024;
    expect(messageSizeWithinLimit(complexMessage, maxSize)).toBe(true);
  });

  test("should return true for message exactly at size limit", () => {
    // Create a message and calculate its exact size
    const message = { data: "x".repeat(50) };
    const encoder = new TextEncoder();
    const actualSize = encoder.encode(JSON.stringify(message)).length;
    expect(messageSizeWithinLimit(message, actualSize)).toBe(true);
  });

  test("should return false for message one byte over limit", () => {
    // Reuse the same message structure to ensure consistency
    const message = { data: "x".repeat(50) };
    const encoder = new TextEncoder();
    const actualSize = encoder.encode(JSON.stringify(message)).length;
    // Message should be rejected when limit is 1 byte less than actual size
    expect(messageSizeWithinLimit(message, actualSize - 1)).toBe(false);
  });
});

describe("Message size validation", () => {
  let client: PipecatClient;

  // Default max message size in the Transport class
  const DEFAULT_MAX_MESSAGE_SIZE = 64 * 1024; // 64 KB
  // Create a message that exceeds the limit by 10%
  const OVERSIZED_CHARS = Math.floor(DEFAULT_MAX_MESSAGE_SIZE * 1.1);

  // Helper to create a message that exceeds the default 64KB limit
  const createOversizedData = () => "x".repeat(OVERSIZED_CHARS);

  // Helper to create a client with error callback
  const createClientWithErrorCallback = (
    errorCallback: (error: RTVIMessage) => void
  ): PipecatClient => {
    return new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onError: errorCallback,
      },
    });
  };

  beforeEach(() => {
    client = new PipecatClient({
      transport: TransportStub.create(),
    });
  });

  test("should successfully send messages within size limit", async () => {
    await client.connect();

    // Small message should send without error
    expect(() => {
      client.sendClientMessage("test", { data: "small payload" });
    }).not.toThrow();
  });

  test("should throw MessageTooLargeError for oversized messages", async () => {
    await client.connect();

    const largeData = createOversizedData();

    expect(() => {
      client.sendClientMessage("test", { data: largeData });
    }).toThrow(MessageTooLargeError);
  });

  test("should call onError callback when message size exceeds limit", async () => {
    const errors: RTVIMessage[] = [];
    client = createClientWithErrorCallback((error) => errors.push(error));

    await client.connect();

    const largeData = createOversizedData();

    try {
      client.sendClientMessage("test", { data: largeData });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // Expected to throw
    }

    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe("error");
    expect((errors[0].data as { message: string }).message).toContain(
      "Message data too large"
    );
  });

  test("should include max size in error message", async () => {
    const errors: RTVIMessage[] = [];
    client = createClientWithErrorCallback((error) => errors.push(error));

    await client.connect();

    const largeData = createOversizedData();

    try {
      client.sendClientMessage("test", { data: largeData });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // Expected to throw
    }

    expect(errors.length).toBe(1);
    expect((errors[0].data as { message: string }).message).toContain(
      DEFAULT_MAX_MESSAGE_SIZE.toString()
    );
  });

  test("should not call onError callback for messages within limit", async () => {
    const errors: RTVIMessage[] = [];
    client = createClientWithErrorCallback((error) => errors.push(error));

    await client.connect();

    client.sendClientMessage("test", { data: "small payload" });

    expect(errors.length).toBe(0);
  });
});
