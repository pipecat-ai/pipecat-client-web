/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import React from "react";

import {
  useDefaultFocusHandler,
  useDefaultHighlightHandler,
  useDefaultScrollToHandler,
} from "../../src/defaultUICommandHandlers";
import { PipecatClientProvider } from "../../src/PipecatClientProvider";

function makeMockPipecatClient() {
  const listeners: Set<(data: unknown) => void> = new Set();
  return {
    on: jest.fn((event: string, handler: unknown) => {
      if (event === RTVIEvent.UICommand) {
        listeners.add(handler as (data: unknown) => void);
      }
    }),
    off: jest.fn((event: string, handler: unknown) => {
      if (event === RTVIEvent.UICommand) {
        listeners.delete(handler as (data: unknown) => void);
      }
    }),
    emit: (data: unknown) => {
      for (const l of listeners) l(data);
    },
  };
}

function emit(
  pipecat: ReturnType<typeof makeMockPipecatClient>,
  command: string,
  payload: Record<string, unknown>,
) {
  act(() => {
    pipecat.emit({ command, payload });
  });
}

describe("default scroll/focus/highlight handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("scrolls a target into view", () => {
    const pipecat = makeMockPipecatClient();
    document.body.innerHTML = `<button id="target">Go</button>`;
    const target = document.getElementById("target") as HTMLElement;
    const scrollIntoView = jest.fn();
    target.scrollIntoView = scrollIntoView;

    const Probe: React.FC = () => {
      useDefaultScrollToHandler({ block: "center", inline: "nearest" });
      return null;
    };

    render(
      <PipecatClientProvider client={pipecat as never}>
        <Probe />
      </PipecatClientProvider>,
    );

    emit(pipecat, "scroll_to", { target_id: "target", behavior: "instant" });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "instant",
      block: "center",
      inline: "nearest",
    });
  });

  it("scrolls within a configured container with offsets", () => {
    const pipecat = makeMockPipecatClient();
    document.body.innerHTML = `
      <div id="container"><button id="target">Go</button></div>
    `;
    const container = document.getElementById("container") as HTMLElement;
    const target = document.getElementById("target") as HTMLElement;
    container.scrollTop = 20;
    container.scrollLeft = 5;
    container.scrollTo = jest.fn();
    container.getBoundingClientRect = jest.fn(
      () => ({ top: 100, left: 50 }) as DOMRect,
    );
    target.getBoundingClientRect = jest.fn(
      () => ({ top: 160, left: 90 }) as DOMRect,
    );

    const Probe: React.FC = () => {
      useDefaultScrollToHandler({
        container,
        offset: { top: 10, left: 3 },
        defaultBehavior: "auto",
      });
      return null;
    };

    render(
      <PipecatClientProvider client={pipecat as never}>
        <Probe />
      </PipecatClientProvider>,
    );

    emit(pipecat, "scroll_to", { target_id: "target" });

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 70,
      left: 42,
      behavior: "auto",
    });
  });

  it("focuses with preventScroll when configured", () => {
    const pipecat = makeMockPipecatClient();
    document.body.innerHTML = `<button id="target">Go</button>`;
    const target = document.getElementById("target") as HTMLElement;
    const focus = jest.spyOn(target, "focus");

    const Probe: React.FC = () => {
      useDefaultFocusHandler({ preventScroll: true });
      return null;
    };

    render(
      <PipecatClientProvider client={pipecat as never}>
        <Probe />
      </PipecatClientProvider>,
    );

    emit(pipecat, "focus", { target_id: "target" });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("clears the previous highlight timer before re-firing", () => {
    jest.useFakeTimers();
    const pipecat = makeMockPipecatClient();
    document.body.innerHTML = `<button id="first">One</button><button id="second">Two</button>`;
    const first = document.getElementById("first") as HTMLElement;
    const second = document.getElementById("second") as HTMLElement;

    const Probe: React.FC = () => {
      useDefaultHighlightHandler({ className: "flash", defaultDurationMs: 1000 });
      return null;
    };

    render(
      <PipecatClientProvider client={pipecat as never}>
        <Probe />
      </PipecatClientProvider>,
    );

    emit(pipecat, "highlight", { target_id: "first" });
    expect(first.classList.contains("flash")).toBe(true);

    emit(pipecat, "highlight", { target_id: "second" });
    expect(first.classList.contains("flash")).toBe(false);
    expect(second.classList.contains("flash")).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(second.classList.contains("flash")).toBe(false);
  });

  it("cleans up highlight state on unmount", () => {
    jest.useFakeTimers();
    const pipecat = makeMockPipecatClient();
    document.body.innerHTML = `<button id="target">Go</button>`;
    const target = document.getElementById("target") as HTMLElement;

    const Probe: React.FC = () => {
      useDefaultHighlightHandler({ className: "flash", defaultDurationMs: 1000 });
      return null;
    };

    const rendered = render(
      <PipecatClientProvider client={pipecat as never}>
        <Probe />
      </PipecatClientProvider>,
    );

    emit(pipecat, "highlight", { target_id: "target" });
    expect(target.classList.contains("flash")).toBe(true);

    rendered.unmount();

    expect(target.classList.contains("flash")).toBe(false);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(target.classList.contains("flash")).toBe(false);
  });
});
