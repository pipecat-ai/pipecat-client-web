/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { describe, expect, it, jest } from "@jest/globals";

import { UIAgentClient } from "./../client/ui-agent-client";
import { RTVIEvent } from "./../rtvi";
import {
  UI_COMMAND_MESSAGE_TYPE,
  UI_EVENT_MESSAGE_TYPE,
} from "./../rtvi/ui";

type ServerMessageListener = (data: unknown) => void;

interface MockPipecatClient {
  sendClientMessage: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  /** Synthetically fire an RTVIEvent.ServerMessage. */
  emitServerMessage: (data: unknown) => void;
}

function makeMockPipecatClient(): MockPipecatClient {
  const listeners: Set<ServerMessageListener> = new Set();
  const mock = {
    sendClientMessage: jest.fn(),
    on: jest.fn((event: unknown, handler: unknown) => {
      if (event === RTVIEvent.ServerMessage) {
        listeners.add(handler as ServerMessageListener);
      }
    }),
    off: jest.fn((event: unknown, handler: unknown) => {
      if (event === RTVIEvent.ServerMessage) {
        listeners.delete(handler as ServerMessageListener);
      }
    }),
    emitServerMessage: (data: unknown) => {
      for (const l of listeners) l(data);
    },
  };
  return mock as unknown as MockPipecatClient;
}

describe("UIAgentClient.sendEvent", () => {
  it("wraps name + payload in a ui.event client message", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.sendEvent("nav_click", { view: "home" });

    expect(pipecat.sendClientMessage).toHaveBeenCalledTimes(1);
    expect(pipecat.sendClientMessage).toHaveBeenCalledWith(
      UI_EVENT_MESSAGE_TYPE,
      { name: "nav_click", payload: { view: "home" } },
    );
  });

  it("allows payload to be omitted", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.sendEvent("hello");

    expect(pipecat.sendClientMessage).toHaveBeenCalledWith(
      UI_EVENT_MESSAGE_TYPE,
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
  function makeEnvelope(name: string, payload: unknown = {}): unknown {
    return { type: UI_COMMAND_MESSAGE_TYPE, name, payload };
  }

  it("does not subscribe on construction", () => {
    const pipecat = makeMockPipecatClient();
    new UIAgentClient(pipecat as never);

    expect(pipecat.on).not.toHaveBeenCalled();
  });

  it("attach subscribes to RTVIEvent.ServerMessage", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);

    ui.attach();

    expect(pipecat.on).toHaveBeenCalledWith(
      RTVIEvent.ServerMessage,
      expect.any(Function),
    );
  });

  it("invokes the registered handler with the payload once attached", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    pipecat.emitServerMessage(makeEnvelope("toast", { title: "Hi" }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ title: "Hi" });
  });

  it("does nothing until attach is called", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    pipecat.emitServerMessage(makeEnvelope("toast", { title: "Hi" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("detach function unsubscribes the listener", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    const detach = ui.attach();
    detach();
    pipecat.emitServerMessage(makeEnvelope("toast", { title: "Hi" }));

    expect(handler).not.toHaveBeenCalled();
    expect(pipecat.off).toHaveBeenCalledWith(
      RTVIEvent.ServerMessage,
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
    pipecat.emitServerMessage(makeEnvelope("toast", { title: "Hi" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores server messages whose type is not ui.command", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    pipecat.emitServerMessage({ type: "other", name: "toast", payload: {} });
    pipecat.emitServerMessage({ name: "toast", payload: {} });
    pipecat.emitServerMessage(null);
    pipecat.emitServerMessage("not an object");

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not dispatch when no handler is registered for the name", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    pipecat.emitServerMessage(makeEnvelope("navigate", { view: "home" }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("unregisterCommandHandler stops dispatch for that name", () => {
    const pipecat = makeMockPipecatClient();
    const ui = new UIAgentClient(pipecat as never);
    const handler = jest.fn();

    ui.registerCommandHandler("toast", handler);
    ui.attach();
    ui.unregisterCommandHandler("toast");
    pipecat.emitServerMessage(makeEnvelope("toast", { title: "Hi" }));

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
    pipecat.emitServerMessage(makeEnvelope("toast", {}));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
