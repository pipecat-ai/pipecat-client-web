/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { PipecatClient } from "./../client/client";
import {
  type FlowNodeEnteredData,
  RTVIEvent,
  RTVIMessage,
  RTVIMessageType,
} from "./../rtvi";
import { TransportStub } from "./stubs/transport";

const entered: FlowNodeEnteredData = {
  node: "verify_to_book.ask_birth_date",
  previous_node: "greet",
  function: "wants_to_book",
  metadata: { step: 2 },
  parent: "verify_to_book",
};

const flowNodeEntered = (data: FlowNodeEnteredData): RTVIMessage =>
  ({
    id: "123",
    label: "rtvi-ai",
    type: RTVIMessageType.FLOW_NODE_ENTERED,
    data,
  }) as RTVIMessage;

describe("PipecatClient flow-node-entered", () => {
  let callback: jest.Mock;
  let client: PipecatClient;

  beforeEach(() => {
    callback = jest.fn();
    client = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: { onFlowNodeEntered: callback },
    });
  });

  const receive = (data: FlowNodeEnteredData) =>
    (client.transport as TransportStub).handleMessage(flowNodeEntered(data));

  it("fires onFlowNodeEntered callbacks and RTVIEvent.FlowNodeEntered events", () => {
    const event = jest.fn();
    client.on(RTVIEvent.FlowNodeEntered, event);

    receive(entered);

    expect(callback).toHaveBeenCalledWith(entered);
    expect(event).toHaveBeenCalledWith(entered);
  });

  it("flowNode is null before the flow enters a node", () => {
    expect(client.flowNode).toBeNull();
  });

  it("flowNode holds the latest node, already set when the event fires", () => {
    let seen: FlowNodeEnteredData | null = null;
    client.on(RTVIEvent.FlowNodeEntered, () => {
      seen = client.flowNode;
    });

    receive({ node: "greet" });
    receive(entered);

    expect(client.flowNode).toEqual(entered);
    expect(seen).toEqual(entered);
  });

  it("disconnect() clears flowNode", async () => {
    await client.connect();
    receive(entered);

    await client.disconnect();

    expect(client.flowNode).toBeNull();
  });
});
