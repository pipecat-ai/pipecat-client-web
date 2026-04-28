/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react";
import React from "react";

import { useStandardClickHandler } from "../src/standardHandlers";
import { UIAgentProvider } from "../src/UIAgentProvider";
import { usePipecatClient } from "../src/usePipecatClient";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

function makeMockPipecatClient() {
  const listeners: Set<(data: unknown) => void> = new Set();
  return {
    sendClientMessage: jest.fn(),
    on: jest.fn((event: unknown, handler: unknown) => {
      if (event === "serverMessage") {
        listeners.add(handler as (data: unknown) => void);
      }
    }),
    off: jest.fn((event: unknown, handler: unknown) => {
      if (event === "serverMessage") {
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
  payload: Record<string, unknown>,
) {
  act(() => {
    pipecat.emit({ type: "ui.command", name: "click", payload });
  });
}

const Probe: React.FC = () => {
  useStandardClickHandler();
  return null;
};

function setup(html: string) {
  const pipecat = makeMockPipecatClient();
  mockUsePipecatClient.mockReturnValue(pipecat);
  document.body.innerHTML = html;
  render(
    <UIAgentProvider>
      <Probe />
    </UIAgentProvider>,
  );
  return pipecat;
}

describe("useStandardClickHandler", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
    document.body.innerHTML = "";
  });

  it("clicks a button by target_id", () => {
    const pipecat = setup(`<button id="b">Submit</button>`);
    const btn = document.getElementById("b") as HTMLButtonElement;
    const click = jest.spyOn(btn, "click");

    emit(pipecat, { target_id: "b" });

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("toggles a checkbox via click", () => {
    const pipecat = setup(`<input id="c" type="checkbox" />`);
    const cb = document.getElementById("c") as HTMLInputElement;
    expect(cb.checked).toBe(false);

    emit(pipecat, { target_id: "c" });

    expect(cb.checked).toBe(true);
  });

  it("refuses to click disabled controls", () => {
    const pipecat = setup(`<button id="b" disabled>Submit</button>`);
    const btn = document.getElementById("b") as HTMLButtonElement;
    const click = jest.spyOn(btn, "click");

    emit(pipecat, { target_id: "b" });

    expect(click).not.toHaveBeenCalled();
  });

  it("refuses to click aria-disabled elements", () => {
    const pipecat = setup(
      `<a id="a" href="/x" role="button" aria-disabled="true">Go</a>`,
    );
    const a = document.getElementById("a") as HTMLAnchorElement;
    const click = jest.spyOn(a, "click");

    emit(pipecat, { target_id: "a" });

    expect(click).not.toHaveBeenCalled();
  });

  it("is a no-op when the target does not resolve", () => {
    const pipecat = setup(`<button id="b">Submit</button>`);
    const btn = document.getElementById("b") as HTMLButtonElement;
    const click = jest.spyOn(btn, "click");

    emit(pipecat, { target_id: "nope" });

    expect(click).not.toHaveBeenCalled();
  });
});
