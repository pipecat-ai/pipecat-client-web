/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, test } from "@jest/globals";

import { FunctionCallCallback, PipecatClient } from "./../client";
import { RTVIEvent, RTVIMessage } from "./../rtvi";
import { messageSizeWithinLimit } from "./../client/utils";
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
  // Create a message that exceeds the limit (70,000 characters ensures > 64KB after JSON serialization)
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
    } catch (e) {
      // Expected to throw
    }

    expect(errors.length).toBe(1);
    expect(errors[0].type).toBe("error");
    expect(errors[0].data.message).toContain("Message data too large");
  });

  test("should include max size in error message", async () => {
    const errors: RTVIMessage[] = [];
    client = createClientWithErrorCallback((error) => errors.push(error));

    await client.connect();

    const largeData = createOversizedData();

    try {
      client.sendClientMessage("test", { data: largeData });
    } catch (e) {
      // Expected to throw
    }

    expect(errors.length).toBe(1);
    expect(errors[0].data.message).toContain("65536"); // 64KB in bytes
  });

  test("should not call onError callback for messages within limit", async () => {
    const errors: RTVIMessage[] = [];
    client = createClientWithErrorCallback((error) => errors.push(error));

    await client.connect();

    client.sendClientMessage("test", { data: "small payload" });

    expect(errors.length).toBe(0);
  });
});
