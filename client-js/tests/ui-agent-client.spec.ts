/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { describe, expect, it, jest } from "@jest/globals";

import { UIAgentClient } from "./../client/ui-agent-client";
import { RTVIEvent, RTVIMessageType } from "./../rtvi";
import { type UITaskEnvelope } from "./../rtvi/ui";

type Listener = (data: unknown) => void;

interface MockPipecatClient {
  sendRTVIMessage: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  /** Synthetically fire an RTVI event of the given name. */
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
  const mock = {
    sendRTVIMessage: jest.fn(),
    on: jest.fn((event: unknown, handler: unknown) => {
      get(event as RTVIEvent).add(handler as Listener);
    }),
    off: jest.fn((event: unknown, handler: unknown) => {
      get(event as RTVIEvent).delete(handler as Listener);
    }),
    fire: (event: RTVIEvent, data: unknown) => {
      for (const l of get(event)) l(data);
    },
  };
  return mock as unknown as MockPipecatClient;
}

describe("UIAgentClient.sendEvent", () => {
  it("sends a first-class ui-event RTVI message with name + payload", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.sendEvent("nav_click", { view: "home" });

    expect(pipecat.sendRTVIMessage).toHaveBeenCalledTimes(1);
    expect(pipecat.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_EVENT,
      { name: "nav_click", payload: { view: "home" } },
    );
  });

  it("allows payload to be omitted", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.sendEvent("hello");

    expect(pipecat.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_EVENT,
      { name: "hello", payload: undefined },
    );
  });

  it("exposes the underlying Pipecat client", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    expect(ui.pipecatClient).toBe(pipecat);
  });
});

describe("UIAgentClient command dispatch", () => {
  function makeCommandData(name: string, payload: unknown = {}): unknown {
    // The data field of a ui-command RTVI message: { name, payload }.
    return { name, payload };
  }

  it("does not subscribe on construction", () => {
    const pipecat = makeMockPipecatClient();
    new UIAgentClient(pipecat as never);

    expect(pipecat.on).not.toHaveBeenCalled();
  });

  it("attach subscribes to RTVIEvent.UICommand and RTVIEvent.UITask", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.attach();

    expect(pipecat.on).toHaveBeenCalledWith(
      RTVIEvent.UICommand,
      expect.any(Function),
    );
    expect(pipecat.on).toHaveBeenCalledWith(
      RTVIEvent.UITask,
      expect.any(Function),
    );
  });

  it("invokes the registered handler with the payload once attached", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    pipecat.fire(RTVIEvent.UICommand, makeCommandData("toast", { title: "Hi" }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ title: "Hi" });
  });

  it("does nothing until attach is called", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    pipecat.fire(RTVIEvent.UICommand, makeCommandData("toast", { title: "Hi" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("detach function unsubscribes both listeners", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    const detach = ui.attach();
    detach();
    pipecat.fire(RTVIEvent.UICommand, makeCommandData("toast", { title: "Hi" }));

    expect(handler).not.toHaveBeenCalled();
    expect(pipecat.off).toHaveBeenCalledWith(
      RTVIEvent.UICommand,
      expect.any(Function),
    );
    expect(pipecat.off).toHaveBeenCalledWith(
      RTVIEvent.UITask,
      expect.any(Function),
    );
  });

  it("re-attaches after detach (StrictMode mount/cleanup/mount)", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    const detach1 = ui.attach();
    detach1();
    ui.attach();
    pipecat.fire(RTVIEvent.UICommand, makeCommandData("toast", { title: "Hi" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores ui-command payloads without a string name", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    pipecat.fire(RTVIEvent.UICommand, { payload: {} });
    pipecat.fire(RTVIEvent.UICommand, null);
    pipecat.fire(RTVIEvent.UICommand, "not an object");

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not dispatch when no handler is registered for the name", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    pipecat.fire(
      RTVIEvent.UICommand,
      makeCommandData("navigate", { view: "home" }),
    );

    expect(handler).not.toHaveBeenCalled();
  });

  it("unregisterCommandHandler stops dispatch for that name", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    ui.unregisterCommandHandler("toast");
    pipecat.fire(RTVIEvent.UICommand, makeCommandData("toast", { title: "Hi" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("latest registration for a name replaces the prior handler", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const first = jest.fn();
    const second = jest.fn();

    ui.registerCommandHandler("toast", first);
    ui.registerCommandHandler("toast", second);
    ui.attach();
    pipecat.fire(RTVIEvent.UICommand, makeCommandData("toast", {}));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("UIAgentClient task dispatch", () => {
  // ui-task envelopes are now the inner data of the ui-task RTVI
  // message; no top-level type field.
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
  const taskCompleted: UITaskEnvelope = {
    kind: "task_completed",
    task_id: "t1",
    agent_name: "w1",
    status: "completed",
    response: { ok: true },
    at: 1702,
  };
  const groupCompleted: UITaskEnvelope = {
    kind: "group_completed",
    task_id: "t1",
    at: 1703,
  };

  it("invokes every task listener with the typed envelope", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const a = jest.fn();
    const b = jest.fn();

    ui.addTaskListener(a);
    ui.addTaskListener(b);
    ui.attach();

    pipecat.fire(RTVIEvent.UITask, groupStarted);
    pipecat.fire(RTVIEvent.UITask, taskUpdate);
    pipecat.fire(RTVIEvent.UITask, taskCompleted);
    pipecat.fire(RTVIEvent.UITask, groupCompleted);

    const envelopes = [groupStarted, taskUpdate, taskCompleted, groupCompleted];
    expect(a.mock.calls.map((c) => c[0])).toEqual(envelopes);
    expect(b.mock.calls.map((c) => c[0])).toEqual(envelopes);
  });

  it("does nothing until attach is called", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const listener = jest.fn();

    ui.addTaskListener(listener);
    pipecat.fire(RTVIEvent.UITask, groupStarted);

    expect(listener).not.toHaveBeenCalled();
  });

  it("removeTaskListener stops dispatch for that listener", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const listener = jest.fn();

    ui.addTaskListener(listener);
    ui.attach();
    ui.removeTaskListener(listener);
    pipecat.fire(RTVIEvent.UITask, groupStarted);

    expect(listener).not.toHaveBeenCalled();
  });

  it("removeAllTaskListeners drops every listener", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const a = jest.fn();
    const b = jest.fn();

    ui.addTaskListener(a);
    ui.addTaskListener(b);
    ui.attach();
    ui.removeAllTaskListeners();
    pipecat.fire(RTVIEvent.UITask, groupStarted);

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("ignores ui-task envelopes whose kind is not a string", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const listener = jest.fn();

    ui.addTaskListener(listener);
    ui.attach();
    pipecat.fire(RTVIEvent.UITask, {});
    pipecat.fire(RTVIEvent.UITask, { kind: 42 });

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not invoke command handlers for ui-task envelopes", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const command = jest.fn();
    const task = jest.fn();

    ui.registerCommandHandler("toast", command);
    ui.addTaskListener(task);
    ui.attach();
    pipecat.fire(RTVIEvent.UITask, groupStarted);

    expect(command).not.toHaveBeenCalled();
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe("UIAgentClient.cancelTask", () => {
  it("sends a first-class ui-cancel-task RTVI message with task_id", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.cancelTask("t1");

    expect(pipecat.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_CANCEL_TASK,
      { task_id: "t1" },
    );
  });

  it("includes reason when provided", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.cancelTask("t1", "user clicked cancel");

    expect(pipecat.sendRTVIMessage).toHaveBeenCalledWith(
      RTVIMessageType.UI_CANCEL_TASK,
      { task_id: "t1", reason: "user clicked cancel" },
    );
  });
});
