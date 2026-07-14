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

import { PipecatClient } from "./../client/client";
import {
  RTVIEvent,
  RTVIMessage,
  RTVIMessageType,
  type UICommandData,
  type UIJobGroupData,
} from "./../rtvi";
import { TransportStub } from "./stubs/transport";

type Listener = (data: unknown) => void;

interface MockPipecatClient extends PipecatClient {
  on: jest.Mock;
  off: jest.Mock;
  fire: (event: RTVIEvent, data: unknown) => void;
}

type MessageMockHolder = { _sendMessage: jest.Mock };

function makeMockPipecatClient(): MockPipecatClient {
  const listeners: Map<RTVIEvent, Set<Listener>> = new Map();
  const get = (event: RTVIEvent): Set<Listener> => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    return set;
  };

  const mock = Object.create(PipecatClient.prototype) as MockPipecatClient;
  (mock as unknown as MessageMockHolder)._sendMessage = jest.fn();
  Object.assign(mock, { _transport: { state: "ready" }, _botVersion: [0, 0, 0] });
  mock.on = jest.fn((event: unknown, handler: unknown) => {
    get(event as RTVIEvent).add(handler as Listener);
    return mock;
  });
  mock.off = jest.fn((event: unknown, handler: unknown) => {
    get(event as RTVIEvent).delete(handler as Listener);
    return mock;
  });
  mock.fire = (event: RTVIEvent, data: unknown) => {
    for (const listener of get(event)) listener(data);
  };
  return mock;
}

function sendMock(client: MockPipecatClient): jest.Mock {
  return (client as unknown as MessageMockHolder)._sendMessage;
}

function expectSentMessage(
  client: MockPipecatClient,
  type: RTVIMessageType,
  data: unknown
): void {
  expect(sendMock(client)).toHaveBeenCalledWith(
    expect.objectContaining({ type, data })
  );
}

describe("PipecatClient managed a11y snapshots", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "<main><button>Go</button></main>";
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("startUISnapshotStream emits ui-snapshot messages", () => {
    const client = makeMockPipecatClient();

    client.startUISnapshotStream({ debounceMs: 100 });
    jest.advanceTimersByTime(100);

    expectSentMessage(
      client,
      RTVIMessageType.UI_SNAPSHOT,
      expect.objectContaining({ tree: expect.any(Object) }),
    );
  });

  it("buffers the latest snapshot until the transport becomes ready", async () => {
    const transport = new TransportStub();
    const client = new PipecatClient({ transport });
    const send = jest
      .spyOn(client as unknown as MessageMockHolder, "_sendMessage")
      .mockImplementation(() => undefined);

    client.startUISnapshotStream({ debounceMs: 100 });
    jest.advanceTimersByTime(100);

    expect(send).not.toHaveBeenCalled();

    await transport.sendReadyMessage();

    expectSentMessage(
      client as unknown as MockPipecatClient,
      RTVIMessageType.UI_SNAPSHOT,
      expect.objectContaining({ tree: expect.any(Object) }),
    );
  });

  it("repeated startUISnapshotStream replaces the previous stream", async () => {
    const client = makeMockPipecatClient();

    client.startUISnapshotStream({ debounceMs: 100 });
    jest.advanceTimersByTime(100);
    expect(sendMock(client)).toHaveBeenCalledTimes(1);

    client.startUISnapshotStream({ debounceMs: 200 });
    document.querySelector("main")!.appendChild(document.createElement("button"));
    await Promise.resolve();

    jest.advanceTimersByTime(100);
    expect(sendMock(client)).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(100);
    expect(sendMock(client)).toHaveBeenCalledTimes(2);
  });

  it("stopUISnapshotStream stops emissions", async () => {
    const client = makeMockPipecatClient();

    client.startUISnapshotStream({ debounceMs: 100 });
    client.stopUISnapshotStream();
    jest.advanceTimersByTime(100);
    expect(sendMock(client)).not.toHaveBeenCalled();

    document.querySelector("main")!.appendChild(document.createElement("button"));
    await Promise.resolve();
    jest.advanceTimersByTime(100);
    expect(sendMock(client)).not.toHaveBeenCalled();
  });

  it("disconnect stops the managed stream", async () => {
    const client = makeMockPipecatClient();
    Object.assign(client, {
      _transport: { disconnect: jest.fn().mockResolvedValue(undefined) },
      _messageDispatcher: { disconnect: jest.fn() },
    });

    client.startUISnapshotStream({ debounceMs: 100 });
    await client.disconnect();

    jest.advanceTimersByTime(100);
    expect(sendMock(client)).not.toHaveBeenCalled();
  });
});

describe("PipecatClient.sendUIEvent", () => {
  it("sends a first-class ui-event RTVI message with event + payload", () => {
    const client = makeMockPipecatClient();

    client.sendUIEvent("nav_click", { view: "home" });

    expect(sendMock(client)).toHaveBeenCalledTimes(1);
    expectSentMessage(
      client,
      RTVIMessageType.UI_EVENT,
      { event: "nav_click", payload: { view: "home" } },
    );
  });

  it("allows payload to be omitted", () => {
    const client = makeMockPipecatClient();

    client.sendUIEvent("hello");

    expectSentMessage(
      client,
      RTVIMessageType.UI_EVENT,
      { event: "hello", payload: undefined },
    );
  });
});

describe("PipecatClient UI inbound events", () => {
  const command: UICommandData = {
    command: "toast",
    payload: { title: "Hi" },
  };
  const groupStarted: UIJobGroupData = {
    kind: "group_started",
    job_id: "t1",
    workers: ["w1", "w2"],
    label: "Doing stuff",
    cancellable: true,
    at: 1700,
  };
  const jobUpdate: UIJobGroupData = {
    kind: "job_update",
    job_id: "t1",
    worker_name: "w1",
    data: { kind: "tool_call", tool: "WebSearch" },
    at: 1701,
  };

  it("fires onUICommand callbacks and RTVIEvent.UICommand events", () => {
    const callback = jest.fn();
    const event = jest.fn();
    const client = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: { onUICommand: callback },
    });

    client.on(RTVIEvent.UICommand, event);
    (client.transport as TransportStub).handleMessage({
      id: "123",
      label: "rtvi-ai",
      type: RTVIMessageType.UI_COMMAND,
      data: command,
    } as RTVIMessage);

    expect(callback).toHaveBeenCalledWith(command);
    expect(event).toHaveBeenCalledWith(command);
  });

  it("fires onUIJobGroup callbacks and RTVIEvent.UIJobGroup events", () => {
    const callback = jest.fn();
    const event = jest.fn();
    const client = new PipecatClient({
      transport: TransportStub.create(),
      callbacks: { onUIJobGroup: callback },
    });

    client.on(RTVIEvent.UIJobGroup, event);
    for (const data of [groupStarted, jobUpdate]) {
      (client.transport as TransportStub).handleMessage({
        id: "123",
        label: "rtvi-ai",
        type: RTVIMessageType.UI_JOB_GROUP,
        data,
      } as RTVIMessage);
    }

    expect(callback.mock.calls.map((c) => c[0])).toEqual([
      groupStarted,
      jobUpdate,
    ]);
    expect(event.mock.calls.map((c) => c[0])).toEqual([
      groupStarted,
      jobUpdate,
    ]);
  });
});

describe("PipecatClient.sendDTMF", () => {
  it("sends a sequence as a single buttons message when the bot is on protocol 2.1.0+", () => {
    const client = makeMockPipecatClient();
    Object.assign(client, { _botVersion: [2, 1, 0] });

    client.sendDTMF("123#");

    expect(sendMock(client)).toHaveBeenCalledTimes(1);
    expectSentMessage(client, RTVIMessageType.DTMF, {
      buttons: ["1", "2", "3", "#"],
    });
  });

  it("sends a single key as a one-element buttons message on protocol 2.1.0+", () => {
    const client = makeMockPipecatClient();
    Object.assign(client, { _botVersion: [2, 1, 0] });

    client.sendDTMF("1");

    expect(sendMock(client)).toHaveBeenCalledTimes(1);
    expectSentMessage(client, RTVIMessageType.DTMF, { buttons: ["1"] });
  });

  it("fans out legacy button messages, one per key, for pre-2.1.0 bots", () => {
    const client = makeMockPipecatClient();
    Object.assign(client, { _botVersion: [2, 0, 0] });

    client.sendDTMF("12#");

    expect(sendMock(client)).toHaveBeenCalledTimes(3);
    expect(
      sendMock(client).mock.calls.map(
        (c) => (c[0] as RTVIMessage).data
      )
    ).toEqual([{ button: "1" }, { button: "2" }, { button: "#" }]);
  });

  it("throws when the bot predates DTMF support (protocol < 2.0.0 or unknown)", () => {
    const client = makeMockPipecatClient();

    expect(() => client.sendDTMF("42")).toThrow(/does not support DTMF/);

    Object.assign(client, { _botVersion: [1, 4, 0] });
    expect(() => client.sendDTMF("1")).toThrow(/does not support DTMF/);

    expect(sendMock(client)).not.toHaveBeenCalled();
  });

  it("throws on invalid input and sends nothing", () => {
    const client = makeMockPipecatClient();
    Object.assign(client, { _botVersion: [2, 1, 0] });

    expect(() => client.sendDTMF("12a#")).toThrow();
    expect(() => client.sendDTMF("")).toThrow();
    expect(sendMock(client)).not.toHaveBeenCalled();
  });
});

describe("PipecatClient.cancelUIJobGroup", () => {
  it("sends a first-class ui-cancel-job-group RTVI message with job_id", () => {
    const client = makeMockPipecatClient();

    client.cancelUIJobGroup("t1");

    expectSentMessage(
      client,
      RTVIMessageType.UI_CANCEL_JOB_GROUP,
      { job_id: "t1" },
    );
  });

  it("includes reason when provided", () => {
    const client = makeMockPipecatClient();

    client.cancelUIJobGroup("t1", "user clicked cancel");

    expectSentMessage(
      client,
      RTVIMessageType.UI_CANCEL_JOB_GROUP,
      { job_id: "t1", reason: "user clicked cancel" },
    );
  });
});
