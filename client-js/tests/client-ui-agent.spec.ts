/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { describe, expect, it, jest } from "@jest/globals";

import { PipecatClient } from "./../client/client";
import { RTVIEvent, RTVIMessageType } from "./../rtvi";
import { type UITaskEnvelope } from "./../rtvi/ui";

type Listener = (data: unknown) => void;

interface MockPipecatClient extends PipecatClient {
  sendRTVIMessage: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  fire: (event: RTVIEvent, data: unknown) => void;
}

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
  mock.sendRTVIMessage = jest.fn();
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

describe("PipecatClient.sendUIEvent", () => {
  it("sends a first-class ui-event RTVI message with event + payload", () => {
    const client = makeMockPipecatClient();

    client.sendUIEvent("nav_click", { view: "home" });

    expect(client.sendRTVIMessage).toHaveBeenCalledTimes(1);
    expect(client.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_EVENT,
      { event: "nav_click", payload: { view: "home" } },
    );
  });

  it("allows payload to be omitted", () => {
    const client = makeMockPipecatClient();

    client.sendUIEvent("hello");

    expect(client.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_EVENT,
      { event: "hello", payload: undefined },
    );
  });
});

describe("PipecatClient.registerUICommandHandler", () => {
  function makeCommandData(command: string, payload: unknown = {}): unknown {
    return { command, payload };
  }

  it("subscribes to RTVIEvent.UICommand", () => {
    const client = makeMockPipecatClient();

    client.registerUICommandHandler("toast", jest.fn());

    expect(client.on).toHaveBeenCalledWith(
      RTVIEvent.UICommand,
      expect.any(Function),
    );
  });

  it("invokes matching command handlers with the payload", () => {
    const client = makeMockPipecatClient();
    const handler = jest.fn();

    client.registerUICommandHandler("toast", handler);
    client.fire(RTVIEvent.UICommand, makeCommandData("toast", { title: "Hi" }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ title: "Hi" });
  });

  it("does not dispatch when the command does not match", () => {
    const client = makeMockPipecatClient();
    const handler = jest.fn();

    client.registerUICommandHandler("toast", handler);
    client.fire(
      RTVIEvent.UICommand,
      makeCommandData("navigate", { view: "home" }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores invalid ui-command payloads", () => {
    const client = makeMockPipecatClient();
    const handler = jest.fn();

    client.registerUICommandHandler("toast", handler);
    client.fire(RTVIEvent.UICommand, null);
    client.fire(RTVIEvent.UICommand, "not an object");
    client.fire(RTVIEvent.UICommand, { payload: {} });

    expect(handler).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function for the exact listener", () => {
    const client = makeMockPipecatClient();
    const handler = jest.fn();

    const unsubscribe = client.registerUICommandHandler("toast", handler);
    unsubscribe();
    client.fire(RTVIEvent.UICommand, makeCommandData("toast", { title: "Hi" }));

    expect(handler).not.toHaveBeenCalled();
    expect(client.off).toHaveBeenCalledWith(
      RTVIEvent.UICommand,
      expect.any(Function),
    );
  });

  it("allows multiple handlers for the same command", () => {
    const client = makeMockPipecatClient();
    const first = jest.fn();
    const second = jest.fn();

    client.registerUICommandHandler("toast", first);
    client.registerUICommandHandler("toast", second);
    client.fire(RTVIEvent.UICommand, makeCommandData("toast", {}));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("PipecatClient.addUITaskListener", () => {
  const groupStarted: UITaskEnvelope = {
    kind: "group_started",
    task_id: "t1",
    agents: ["w1", "w2"],
    label: "Doing stuff",
    cancellable: true,
    at: 1700,
  };
  const taskUpdate: UITaskEnvelope = {
    kind: "task_update",
    task_id: "t1",
    agent_name: "w1",
    data: { kind: "tool_call", tool: "WebSearch" },
    at: 1701,
  };

  it("invokes every task listener with typed envelopes", () => {
    const client = makeMockPipecatClient();
    const a = jest.fn();
    const b = jest.fn();

    client.addUITaskListener(a);
    client.addUITaskListener(b);
    client.fire(RTVIEvent.UITask, groupStarted);
    client.fire(RTVIEvent.UITask, taskUpdate);

    expect(a.mock.calls.map((c) => c[0])).toEqual([groupStarted, taskUpdate]);
    expect(b.mock.calls.map((c) => c[0])).toEqual([groupStarted, taskUpdate]);
  });

  it("ignores ui-task envelopes whose kind is not a string", () => {
    const client = makeMockPipecatClient();
    const listener = jest.fn();

    client.addUITaskListener(listener);
    client.fire(RTVIEvent.UITask, {});
    client.fire(RTVIEvent.UITask, { kind: 42 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function for the exact listener", () => {
    const client = makeMockPipecatClient();
    const listener = jest.fn();

    const unsubscribe = client.addUITaskListener(listener);
    unsubscribe();
    client.fire(RTVIEvent.UITask, groupStarted);

    expect(listener).not.toHaveBeenCalled();
    expect(client.off).toHaveBeenCalledWith(
      RTVIEvent.UITask,
      expect.any(Function),
    );
  });
});

describe("PipecatClient.cancelUITask", () => {
  it("sends a first-class ui-cancel-task RTVI message with task_id", () => {
    const client = makeMockPipecatClient();

    client.cancelUITask("t1");

    expect(client.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_CANCEL_TASK,
      { task_id: "t1" },
    );
  });

  it("includes reason when provided", () => {
    const client = makeMockPipecatClient();

    client.cancelUITask("t1", "user clicked cancel");

    expect(client.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_CANCEL_TASK,
      { task_id: "t1", reason: "user clicked cancel" },
    );
  });
});
