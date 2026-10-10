/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import { FunctionCallCallback, PipecatClient } from "./../client";
import { messageSizeWithinLimit } from "./../client/utils";
import {
  AggregationType,
  BotOutputData,
  BotReadyData,
  FileBytes,
  MediaSupport,
  RTVIEvent,
  RTVIFile,
  RTVIMessage,
  RTVIMessageType,
  TextType,
  UserInputData,
} from "./../rtvi";
import {
  MessageTooLargeError,
  UnsupportedFeatureError,
} from "./../rtvi/errors";
import { TransportStub } from "./stubs/transport";

// _uploadFile is private — tests reach it through a structural cast (for
// spies) or bracket notation (for direct calls).
type UploadCapable = { _uploadFile: (file: File) => Promise<RTVIFile> };
const spyOnUploadFile = (client: PipecatClient) =>
  jest.spyOn(client as unknown as UploadCapable, "_uploadFile");

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let callbackData: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let callbackData: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let callbackData: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let callbackData: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  test("should auto-disconnect when bot disconnects (default behavior)", async () => {
    await client.connect();
    expect(client.connected).toBe(true);

    const disconnectedPromise = new Promise<void>((resolve) => {
      client.on(RTVIEvent.TransportStateChanged, (state) => {
        if (state === "disconnected") resolve();
      });
    });

    (client.transport as TransportStub).simulateBotDisconnect();

    await disconnectedPromise;

    expect(client.connected).toBe(false);
    expect(client.state).toBe("disconnected");
  });

  test("should NOT auto-disconnect when bot disconnects if disconnectOnBotDisconnect is false", async () => {
    const clientNoBotDisconnect = new PipecatClient({
      transport: TransportStub.create(),
      disconnectOnBotDisconnect: false,
    });

    await clientNoBotDisconnect.connect();
    expect(clientNoBotDisconnect.connected).toBe(true);

    let disconnectCalled = false;
    clientNoBotDisconnect.on(RTVIEvent.Disconnected, () => {
      disconnectCalled = true;
    });

    (clientNoBotDisconnect.transport as TransportStub).simulateBotDisconnect();

    // Yield to allow any async disconnect to fire if it were going to
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(disconnectCalled).toBe(false);
    expect(clientNoBotDisconnect.connected).toBe(true);
    expect(clientNoBotDisconnect.state).toBe("ready");
  });

  test("should invoke onBotDisconnected callback regardless of disconnectOnBotDisconnect setting", async () => {
    let callbackCalledDefault = false;
    let callbackCalledOptOut = false;

    const clientDefault = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: {
        onBotDisconnected: () => {
          callbackCalledDefault = true;
        },
      },
    });

    const clientOptOut = new PipecatClient({
      transport: TransportStub.create(),
      disconnectOnBotDisconnect: false,
      callbacks: {
        onBotDisconnected: () => {
          callbackCalledOptOut = true;
        },
      },
    });

    await clientDefault.connect();
    await clientOptOut.connect();

    (clientDefault.transport as TransportStub).simulateBotDisconnect();
    (clientOptOut.transport as TransportStub).simulateBotDisconnect();

    expect(callbackCalledDefault).toBe(true);
    expect(callbackCalledOptOut).toBe(true);
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

describe("UnsupportedFeatureError handling", () => {
  // Transport stub that throws UnsupportedFeatureError for cam and screen share
  class UnsupportedTransportStub extends TransportStub {
    get selectedCam(): MediaDeviceInfo | Record<string, never> {
      throw new UnsupportedFeatureError(
        "selectedCam",
        "UnsupportedTransportStub",
        "Not implemented"
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    enableCam(enable: boolean): void {
      throw new UnsupportedFeatureError(
        "enableCam",
        "UnsupportedTransportStub",
        "Not implemented"
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    enableScreenShare(enable: boolean): void {
      throw new UnsupportedFeatureError(
        "enableScreenShare",
        "UnsupportedTransportStub",
        "Not implemented"
      );
    }
  }

  function createClientWithUnsupportedCallback(
    onUnsupportedFeature: (error: UnsupportedFeatureError) => void
  ): PipecatClient {
    return new PipecatClient({
      transport: new UnsupportedTransportStub(),
      callbacks: { onUnsupportedFeature },
    });
  }

  test("selectedCam returns {} instead of throwing when transport throws UnsupportedFeatureError", () => {
    const client = new PipecatClient({
      transport: new UnsupportedTransportStub(),
    });
    expect(() => client.selectedCam).not.toThrow();
    expect(client.selectedCam).toEqual({});
  });

  test("selectedCam fires onUnsupportedFeature callback with the error", () => {
    let received: UnsupportedFeatureError | null = null;
    const client = createClientWithUnsupportedCallback((e) => (received = e));

    void client.selectedCam;

    expect(received).toBeInstanceOf(UnsupportedFeatureError);
    expect((received as unknown as UnsupportedFeatureError).feature).toBe(
      "selectedCam"
    );
  });

  test("selectedCam emits RTVIEvent.UnsupportedFeature", () => {
    let emitted: UnsupportedFeatureError | null = null;
    const client = new PipecatClient({
      transport: new UnsupportedTransportStub(),
    });
    client.on(RTVIEvent.UnsupportedFeature, (e) => (emitted = e));

    void client.selectedCam;

    expect(emitted).toBeInstanceOf(UnsupportedFeatureError);
  });

  test("enableCam does not throw when transport throws UnsupportedFeatureError", () => {
    const client = new PipecatClient({
      transport: new UnsupportedTransportStub(),
    });
    expect(() => client.enableCam(true)).not.toThrow();
  });

  test("enableCam fires onUnsupportedFeature callback with the error", () => {
    let received: UnsupportedFeatureError | null = null;
    const client = createClientWithUnsupportedCallback((e) => (received = e));

    client.enableCam(true);

    expect(received).toBeInstanceOf(UnsupportedFeatureError);
    expect((received as unknown as UnsupportedFeatureError).feature).toBe(
      "enableCam"
    );
  });

  test("enableCam emits RTVIEvent.UnsupportedFeature", () => {
    let emitted: UnsupportedFeatureError | null = null;
    const client = new PipecatClient({
      transport: new UnsupportedTransportStub(),
    });
    client.on(RTVIEvent.UnsupportedFeature, (e) => (emitted = e));

    client.enableCam(true);

    expect(emitted).toBeInstanceOf(UnsupportedFeatureError);
  });

  test("enableScreenShare does not throw when transport throws UnsupportedFeatureError", () => {
    const client = new PipecatClient({
      transport: new UnsupportedTransportStub(),
    });
    expect(() => client.enableScreenShare(true)).not.toThrow();
  });

  test("enableScreenShare fires onUnsupportedFeature callback with the error", () => {
    let received: UnsupportedFeatureError | null = null;
    const client = createClientWithUnsupportedCallback((e) => (received = e));

    client.enableScreenShare(true);

    expect(received).toBeInstanceOf(UnsupportedFeatureError);
    expect((received as unknown as UnsupportedFeatureError).feature).toBe(
      "enableScreenShare"
    );
  });

  test("enableScreenShare emits RTVIEvent.UnsupportedFeature", () => {
    let emitted: UnsupportedFeatureError | null = null;
    const client = new PipecatClient({
      transport: new UnsupportedTransportStub(),
    });
    client.on(RTVIEvent.UnsupportedFeature, (e) => (emitted = e));

    client.enableScreenShare(true);

    expect(emitted).toBeInstanceOf(UnsupportedFeatureError);
  });

  test("selectedCam re-throws non-UnsupportedFeatureError errors", () => {
    class ErrorTransportStub extends TransportStub {
      get selectedCam(): MediaDeviceInfo | Record<string, never> {
        throw new Error("unexpected transport failure");
      }
    }
    const client = new PipecatClient({ transport: new ErrorTransportStub() });
    expect(() => client.selectedCam).toThrow("unexpected transport failure");
  });

  test("enableCam re-throws non-UnsupportedFeatureError errors", () => {
    class ErrorTransportStub extends TransportStub {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      enableCam(enable: boolean): void {
        throw new Error("unexpected transport failure");
      }
    }
    const client = new PipecatClient({ transport: new ErrorTransportStub() });
    expect(() => client.enableCam(true)).toThrow(
      "unexpected transport failure"
    );
  });

  test("enableScreenShare re-throws non-UnsupportedFeatureError errors", () => {
    class ErrorTransportStub extends TransportStub {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      enableScreenShare(enable: boolean): void {
        throw new Error("unexpected transport failure");
      }
    }
    const client = new PipecatClient({ transport: new ErrorTransportStub() });
    expect(() => client.enableScreenShare(true)).toThrow(
      "unexpected transport failure"
    );
  });
});

describe("Bot capabilities", () => {
  let client: PipecatClient;

  const botReady = (data: Record<string, unknown>): RTVIMessage => ({
    id: "1",
    label: "rtvi-ai",
    type: "bot-ready",
    data,
  });

  beforeEach(() => {
    client = new PipecatClient({
      transport: TransportStub.create(),
    });
  });

  test("botCapabilities is undefined before bot-ready", () => {
    expect(client.botCapabilities).toBeUndefined();
  });

  test("botCapabilities holds the capabilities from bot-ready", async () => {
    await client.connect();
    const capabilities = {
      audio_in: true,
      audio_out: true,
      video_in: true,
      screen_in: false,
    };
    let eventData: BotReadyData | undefined;
    client.on(RTVIEvent.BotReady, (data) => {
      eventData = data;
    });

    (client.transport as TransportStub).handleMessage(
      botReady({ version: "2.2.0", capabilities })
    );

    expect(client.botCapabilities).toEqual(capabilities);
    expect(eventData?.capabilities).toEqual(capabilities);
  });

  test("botCapabilities is undefined for a bot that doesn't send them", async () => {
    await client.connect();
    (client.transport as TransportStub).handleMessage(
      botReady({ version: "2.1.0" })
    );
    expect(client.botCapabilities).toBeUndefined();
  });

  test("disconnect() clears botCapabilities", async () => {
    await client.connect();
    (client.transport as TransportStub).handleMessage(
      botReady({ version: "2.2.0", capabilities: { video_out: true } })
    );
    await client.disconnect();
    expect(client.botCapabilities).toBeUndefined();
  });
});

describe("User input and bot output", () => {
  let client: PipecatClient;
  let transport: TransportStub;

  const serverMessage = (type: string, data: unknown): RTVIMessage => ({
    id: "1",
    label: "rtvi-ai",
    type,
    data,
  });

  beforeEach(async () => {
    transport = TransportStub.create();
    client = new PipecatClient({ transport });
    await client.connect();
  });

  test("sendText() returns the id of the send-text message", async () => {
    const sendMessage = jest.spyOn(transport, "sendMessage");

    const id = await client.sendText("Hello.");

    const sent = sendMessage.mock.calls[0][0];
    expect(sent.type).toBe(RTVIMessageType.SEND_TEXT);
    expect(id).toBe(sent.id);
  });

  test("a user-input message is reported as user input", () => {
    const data: UserInputData = {
      text: "Hello.",
      input_type: "chat",
      timestamp: "2026-10-09T00:00:00.000Z",
      final: true,
      msg_id: "abc12345",
    };
    let eventData: UserInputData | undefined;
    client.on(RTVIEvent.UserInput, (d) => {
      eventData = d;
    });

    transport.handleMessage(serverMessage(RTVIMessageType.USER_INPUT, data));

    expect(eventData).toEqual(data);
  });

  test("bot output from a bot that only sends aggregated_by has its text_type", () => {
    let eventData: BotOutputData | undefined;
    client.on(RTVIEvent.BotOutput, (d) => {
      eventData = d;
    });

    transport.handleMessage(
      serverMessage(RTVIMessageType.BOT_OUTPUT, {
        text: "Hello.",
        aggregated_by: "sentence",
      })
    );

    expect(eventData?.text_type).toBe(TextType.SENTENCE);
  });

  test("bot output keeps the text_type the bot sends", () => {
    let eventData: BotOutputData | undefined;
    client.on(RTVIEvent.BotOutput, (d) => {
      eventData = d;
    });

    transport.handleMessage(
      serverMessage(RTVIMessageType.BOT_OUTPUT, {
        text: "Mm-hmm.",
        text_type: "backchannel",
        aggregated_by: "backchannel",
      })
    );

    expect(eventData?.text_type).toBe(TextType.BACKCHANNEL);
  });

  test("AggregationType is an alias of TextType", () => {
    expect(AggregationType.WORD).toBe(TextType.WORD);
    expect(AggregationType.SENTENCE).toBe(TextType.SENTENCE);
  });

  const rawTextMessages = [
    {
      type: RTVIMessageType.STT_RAW_TEXT,
      event: RTVIEvent.SttRawText,
      callback: "onSttRawText",
      data: {
        text: "Hel",
        final: false,
        timestamp: "2026-10-09T00:00:00.000Z",
        user_id: "user",
      },
    },
    {
      type: RTVIMessageType.LLM_RAW_TEXT,
      event: RTVIEvent.LlmRawText,
      callback: "onLlmRawText",
      data: { text: "Hi" },
    },
    {
      type: RTVIMessageType.TTS_RAW_TEXT,
      event: RTVIEvent.TtsRawText,
      callback: "onTtsRawText",
      data: { text: "Hi" },
    },
  ] as const;

  test.each(rawTextMessages)(
    "a $type message is reported to $callback and as $event",
    async ({ type, event, callback, data }) => {
      const onRawText = jest.fn();
      const callbackClient = new PipecatClient({
        transport,
        callbacks: { [callback]: onRawText },
      });
      await callbackClient.connect();
      let eventData: unknown;
      callbackClient.on(event, (d: unknown) => {
        eventData = d;
      });

      transport.handleMessage(serverMessage(type, data));

      expect(onRawText).toHaveBeenCalledWith(data);
      expect(eventData).toEqual(data);
    }
  );
});

describe("Media support", () => {
  class VideoLessTransport extends TransportStub {
    get mediaSupport() {
      return {
        mic: true,
        cam: false,
        screenShare: false,
        botAudio: true,
        botVideo: false,
      };
    }
  }

  const botReady = (data: Record<string, unknown>): RTVIMessage => ({
    id: "1",
    label: "rtvi-ai",
    type: "bot-ready",
    data,
  });

  test("a transport that rules nothing out leaves everything unknown before bot-ready", () => {
    const client = new PipecatClient({ transport: TransportStub.create() });
    expect(
      Object.values(client.mediaSupport).every((v) => v === undefined)
    ).toBe(true);
  });

  test("reflects the transport before bot-ready", () => {
    const client = new PipecatClient({ transport: new VideoLessTransport() });
    expect(client.mediaSupport.cam).toBe(false);
    expect(client.mediaSupport.screenShare).toBe(false);
    expect(client.mediaSupport.mic).toBeUndefined();
  });

  test("combines the transport with the bot's capabilities after bot-ready", async () => {
    const client = new PipecatClient({ transport: new VideoLessTransport() });
    await client.connect();
    (client.transport as TransportStub).handleMessage(
      botReady({
        version: "2.2.0",
        capabilities: { audio_in: true, audio_out: true, video_in: true },
      })
    );
    expect(client.mediaSupport).toMatchObject({
      mic: true,
      cam: false,
      botAudio: true,
      botVideo: false,
    });
  });

  test("bot-ready that changes mediaSupport emits the event and callback", async () => {
    const changes: MediaSupport[] = [];
    const client = new PipecatClient({
      transport: new VideoLessTransport(),
      callbacks: { onMediaSupportChanged: (support) => changes.push(support) },
    });
    const events: MediaSupport[] = [];
    client.on(RTVIEvent.MediaSupportUpdated, (support) => events.push(support));
    await client.connect();

    (client.transport as TransportStub).handleMessage(
      botReady({ version: "2.2.0", capabilities: { audio_in: true } })
    );

    expect(events).toHaveLength(1);
    expect(events[0].mic).toBe(true);
    expect(changes).toEqual(events);
  });

  test("bot-ready that leaves mediaSupport unchanged emits nothing", async () => {
    // With a transport that rules nothing out, a bot that only reports `true`
    // values leaves every kind of media undefined.
    const client = new PipecatClient({ transport: TransportStub.create() });
    const events: MediaSupport[] = [];
    client.on(RTVIEvent.MediaSupportUpdated, (support) => events.push(support));
    await client.connect();

    (client.transport as TransportStub).handleMessage(
      botReady({
        version: "2.2.0",
        capabilities: { audio_in: true, video_in: true },
      })
    );

    expect(events).toHaveLength(0);
  });

  test("disconnect emits when it changes mediaSupport", async () => {
    const client = new PipecatClient({ transport: TransportStub.create() });
    await client.connect();
    (client.transport as TransportStub).handleMessage(
      botReady({ version: "2.2.0", capabilities: { video_out: false } })
    );
    const events: MediaSupport[] = [];
    client.on(RTVIEvent.MediaSupportUpdated, (support) => events.push(support));

    await client.disconnect();

    expect(events).toHaveLength(1);
    expect(events[0].botVideo).toBeUndefined();
  });

  test("falls back to the transport after disconnect", async () => {
    const client = new PipecatClient({ transport: new VideoLessTransport() });
    await client.connect();
    (client.transport as TransportStub).handleMessage(
      botReady({ version: "2.2.0", capabilities: { audio_in: true } })
    );
    await client.disconnect();
    expect(client.mediaSupport.mic).toBeUndefined();
  });
});

describe("sendFile", () => {
  const DEFAULT_MAX_MESSAGE_SIZE = 64 * 1024;

  // Connect a client and override the bot version by injecting a second BOT_READY.
  const connectWithBotVersion = async (
    version = "2.2.0"
  ): Promise<{ client: PipecatClient; stub: TransportStub }> => {
    const stub = new TransportStub();
    const client = new PipecatClient({ transport: stub });
    await client.connect();
    stub.handleMessage({
      label: "rtvi-ai",
      id: "bot-ready-override",
      type: RTVIMessageType.BOT_READY,
      data: { version },
    } as RTVIMessage);
    return { client, stub };
  };

  interface MockFileReader {
    readAsDataURL: ReturnType<typeof jest.fn>;
    onload: ((e: { target: { result: string | null } | null }) => void) | null;
    onerror: (() => void) | null;
  }

  let mockFileReaderInstance: MockFileReader;
  let OriginalFileReader: typeof FileReader;

  beforeEach(() => {
    OriginalFileReader = globalThis.FileReader;
    mockFileReaderInstance = {
      readAsDataURL: jest.fn(),
      onload: null,
      onerror: null,
    };
    globalThis.FileReader = jest.fn(
      () => mockFileReaderInstance
    ) as unknown as typeof FileReader;
  });

  afterEach(() => {
    globalThis.FileReader = OriginalFileReader;
    jest.restoreAllMocks();
  });

  describe("version guard", () => {
    test("throws UnsupportedFeatureError for bot version 1.x", async () => {
      const { client } = await connectWithBotVersion("1.0.0");
      const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
      await expect(client.sendFile(file, "caption")).rejects.toThrow(
        UnsupportedFeatureError
      );
    });

    test("throws UnsupportedFeatureError for bot version 2.1.x", async () => {
      const { client } = await connectWithBotVersion("2.1.0");
      const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
      await expect(client.sendFile(file, "caption")).rejects.toThrow(
        UnsupportedFeatureError
      );
    });

    test("proceeds for bot version 2.2.0", async () => {
      const { client } = await connectWithBotVersion("2.2.0");
      const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
      const pending = client.sendFile(file, "caption");
      mockFileReaderInstance.onload?.({
        target: { result: "data:image/jpeg;base64,dGVzdA==" },
      });
      await expect(pending).resolves.toBeUndefined();
    });
  });

  describe("Browser File input", () => {
    test("small file is read as base64 and sent inline", async () => {
      const { client, stub } = await connectWithBotVersion();
      const sentMessages: RTVIMessage[] = [];
      jest.spyOn(stub, "sendMessage").mockImplementation((msg) => {
        sentMessages.push(msg);
        return true;
      });

      const file = new File(["hello"], "photo.jpg", { type: "image/jpeg" });
      const pending = client.sendFile(file, "what is this?");
      mockFileReaderInstance.onload?.({
        target: { result: "data:image/jpeg;base64,aGVsbG8=" },
      });
      await pending;

      expect(sentMessages).toHaveLength(1);
      const payload = sentMessages[0].data as { file: RTVIFile };
      expect(payload.file.source.type).toBe("bytes");
      expect((payload.file.source as FileBytes).bytes).toBe("aGVsbG8=");
      expect(payload.file.format).toBe("image/jpeg");
      expect(payload.file.name).toBe("photo.jpg");
    });

    test("strips data-URL prefix from base64 result", async () => {
      const { client, stub } = await connectWithBotVersion();
      const sentMessages: RTVIMessage[] = [];
      jest.spyOn(stub, "sendMessage").mockImplementation((msg) => {
        sentMessages.push(msg);
        return true;
      });

      const file = new File(["data"], "photo.png", { type: "image/png" });
      const pending = client.sendFile(file, "caption");
      mockFileReaderInstance.onload?.({
        target: { result: "data:image/png;base64,dGVzdA==" },
      });
      await pending;

      const source = (sentMessages[0].data as { file: RTVIFile }).file
        .source as FileBytes;
      expect(source.bytes).toBe("dGVzdA==");
      expect(source.bytes).not.toContain("data:");
    });

    test("large file is uploaded instead of read inline", async () => {
      const { client } = await connectWithBotVersion();
      const uploadSpy = spyOnUploadFile(client).mockResolvedValue({
        name: "large.jpg",
        format: "image/jpeg",
        source: { type: "url", url: "https://cdn.example.com/large.jpg" },
      });

      // size * 1.37 + 1000 exceeds 64 KiB
      const largeContent = new Uint8Array(DEFAULT_MAX_MESSAGE_SIZE);
      const file = new File([largeContent], "large.jpg", {
        type: "image/jpeg",
      });
      await client.sendFile(file, "caption");

      expect(uploadSpy).toHaveBeenCalledWith(file);
      expect(mockFileReaderInstance.readAsDataURL).not.toHaveBeenCalled();
    });

    test("FileReader onerror rejects with RTVIError", async () => {
      const { client } = await connectWithBotVersion();
      const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
      const pending = client.sendFile(file, "caption");

      mockFileReaderInstance.onerror?.();

      await expect(pending).rejects.toThrow("Could not read file data");
    });

    test("null FileReader result rejects with RTVIError", async () => {
      const { client } = await connectWithBotVersion();
      const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
      const pending = client.sendFile(file, "caption");

      mockFileReaderInstance.onload?.({ target: { result: null } });

      await expect(pending).rejects.toThrow("Could not read file data");
    });
  });

  describe("RTVIFile input", () => {
    test("url source passes through without upload", async () => {
      const { client, stub } = await connectWithBotVersion();
      const sentMessages: RTVIMessage[] = [];
      jest.spyOn(stub, "sendMessage").mockImplementation((msg) => {
        sentMessages.push(msg);
        return true;
      });
      const uploadSpy = spyOnUploadFile(client);

      const rtviFile: RTVIFile = {
        name: "photo.jpg",
        format: "image/jpeg",
        source: { type: "url", url: "https://example.com/photo.jpg" },
      };
      await client.sendFile(rtviFile, "caption");

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(
        (sentMessages[0].data as { file: RTVIFile }).file.source.type
      ).toBe("url");
    });

    test("small bytes source is sent inline", async () => {
      const { client, stub } = await connectWithBotVersion();
      const sentMessages: RTVIMessage[] = [];
      jest.spyOn(stub, "sendMessage").mockImplementation((msg) => {
        sentMessages.push(msg);
        return true;
      });
      const uploadSpy = spyOnUploadFile(client);

      const rtviFile: RTVIFile = {
        name: "photo.jpg",
        format: "image/jpeg",
        source: { type: "bytes", bytes: "aGVsbG8=" },
      };
      await client.sendFile(rtviFile, "caption");

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(
        ((sentMessages[0].data as { file: RTVIFile }).file.source as FileBytes)
          .bytes
      ).toBe("aGVsbG8=");
    });

    test("large bytes source is uploaded", async () => {
      const { client } = await connectWithBotVersion();
      const uploadSpy = spyOnUploadFile(client).mockResolvedValue({
        name: "large.jpg",
        format: "image/jpeg",
        source: { type: "url", url: "https://cdn.example.com/large.jpg" },
      });

      const rtviFile: RTVIFile = {
        name: "large.jpg",
        format: "image/jpeg",
        source: { type: "bytes", bytes: "x".repeat(DEFAULT_MAX_MESSAGE_SIZE) },
      };
      await client.sendFile(rtviFile, "caption");

      expect(uploadSpy).toHaveBeenCalled();
    });

    test("shorthand format is normalized to MIME type", async () => {
      const { client, stub } = await connectWithBotVersion();
      const sentMessages: RTVIMessage[] = [];
      jest.spyOn(stub, "sendMessage").mockImplementation((msg) => {
        sentMessages.push(msg);
        return true;
      });

      const rtviFile: RTVIFile = {
        name: "photo.jpg",
        format: "jpg" as string,
        source: { type: "url", url: "https://example.com/photo.jpg" },
      };
      await client.sendFile(rtviFile, "caption");

      expect((sentMessages[0].data as { file: RTVIFile }).file.format).toBe(
        "image/jpeg"
      );
    });
  });
});

describe("uploadFile endpoint selection", () => {
  const uploadResponse = JSON.stringify({
    name: "photo.jpg",
    format: "image/jpeg",
    source: { type: "url", url: "pipecat:abc-123" },
  });

  let client: PipecatClient;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  const fetchedUrls = () =>
    fetchMock.mock.calls.map((call) => (call[0] as Request).url);

  beforeEach(() => {
    client = new PipecatClient({ transport: new TransportStub() });
    fetchMock = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  const startBotReturning = async (startResponse: Record<string, unknown>) => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(startResponse), { status: 200 })
    );
    await client.startBot({ endpoint: "https://example.invalid/start" });
  };

  test("resolves a relative advertised fileUploadUrl against the start endpoint", async () => {
    await startBotReturning({
      sessionId: "sess-123",
      fileUploadUrl: "/sessions/sess-123/files",
    });
    fetchMock.mockResolvedValueOnce(
      new Response(uploadResponse, { status: 200 })
    );

    const result = await client["_uploadFile"](
      new File(["data"], "photo.jpg", { type: "image/jpeg" })
    );

    expect(fetchedUrls()[1]).toBe(
      "https://example.invalid/sessions/sess-123/files"
    );
    expect(result.source).toEqual({ type: "url", url: "pipecat:abc-123" });
  });

  test("uses an absolute advertised fileUploadUrl as-is", async () => {
    await startBotReturning({
      fileUploadUrl: "https://uploads.example.invalid/u/files",
    });
    fetchMock.mockResolvedValueOnce(
      new Response(uploadResponse, { status: 200 })
    );

    await client["_uploadFile"](
      new File(["data"], "photo.jpg", { type: "image/jpeg" })
    );

    expect(fetchedUrls()[1]).toBe("https://uploads.example.invalid/u/files");
  });

  test("rejects when the start-bot response advertised no fileUploadUrl", async () => {
    await startBotReturning({ sessionId: "sess-123" });

    await expect(
      client["_uploadFile"](new File(["data"], "photo.jpg", { type: "image/jpeg" }))
    ).rejects.toThrow("did not advertise a fileUploadUrl");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("upload errors propagate", async () => {
    await startBotReturning({ fileUploadUrl: "/files" });
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    await expect(
      client["_uploadFile"](new File(["data"], "photo.jpg", { type: "image/jpeg" }))
    ).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("disconnect clears the start-bot response used for uploads", async () => {
    await startBotReturning({ fileUploadUrl: "/files" });
    await client.disconnect();

    await expect(
      client["_uploadFile"](new File(["data"], "photo.jpg", { type: "image/jpeg" }))
    ).rejects.toThrow("did not advertise a fileUploadUrl");
  });

  test("falls back to the fileUploadEndpoint option when nothing is advertised", async () => {
    client = new PipecatClient({
      transport: new TransportStub(),
      fileUploadEndpoint: "https://uploads.example.invalid/custom",
    });
    await startBotReturning({ sessionId: "sess-123" });
    fetchMock.mockResolvedValueOnce(
      new Response(uploadResponse, { status: 200 })
    );

    await client["_uploadFile"](
      new File(["data"], "photo.jpg", { type: "image/jpeg" })
    );

    expect(fetchedUrls()[1]).toBe("https://uploads.example.invalid/custom");
  });

  test("an advertised fileUploadUrl overrides the fileUploadEndpoint option", async () => {
    client = new PipecatClient({
      transport: new TransportStub(),
      fileUploadEndpoint: "https://uploads.example.invalid/custom",
    });
    await startBotReturning({ fileUploadUrl: "/sessions/sess-123/files" });
    fetchMock.mockResolvedValueOnce(
      new Response(uploadResponse, { status: 200 })
    );

    await client["_uploadFile"](
      new File(["data"], "photo.jpg", { type: "image/jpeg" })
    );

    expect(fetchedUrls()[1]).toBe(
      "https://example.invalid/sessions/sess-123/files"
    );
  });

  test("an absolute fileUploadEndpoint option works without startBot", async () => {
    client = new PipecatClient({
      transport: new TransportStub(),
      fileUploadEndpoint: new URL("https://uploads.example.invalid/custom"),
    });
    fetchMock.mockResolvedValueOnce(
      new Response(uploadResponse, { status: 200 })
    );

    await client["_uploadFile"](
      new File(["data"], "photo.jpg", { type: "image/jpeg" })
    );

    expect(fetchedUrls()[0]).toBe("https://uploads.example.invalid/custom");
  });

  test("accepts a snake_case file_upload_url in the /start response", async () => {
    await startBotReturning({ file_upload_url: "/files" });
    fetchMock.mockResolvedValueOnce(
      new Response(uploadResponse, { status: 200 })
    );

    await client["_uploadFile"](
      new File(["data"], "photo.jpg", { type: "image/jpeg" })
    );

    expect(fetchedUrls()[1]).toBe("https://example.invalid/files");
  });
});
