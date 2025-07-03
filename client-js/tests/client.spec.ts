/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, test } from "@jest/globals";

import { FunctionCallCallback, PipecatClient } from "./../client";
import { RTVIEvent, RTVIMessage } from "./../rtvi";
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
