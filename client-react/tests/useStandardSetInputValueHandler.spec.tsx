/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react";
import React from "react";

import { useStandardSetInputValueHandler } from "../src/standardHandlers";
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
    pipecat.emit({ type: "ui.command", name: "set_input_value", payload });
  });
}

const Probe: React.FC = () => {
  useStandardSetInputValueHandler();
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

describe("useStandardSetInputValueHandler", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
    document.body.innerHTML = "";
  });

  it("writes value into an input and dispatches input + change events", () => {
    const pipecat = setup(`<input id="i" value="old" />`);
    const input = document.getElementById("i") as HTMLInputElement;
    const inputEvents: string[] = [];
    input.addEventListener("input", () => inputEvents.push("input"));
    input.addEventListener("change", () => inputEvents.push("change"));

    emit(pipecat, { target_id: "i", value: "new" });

    expect(input.value).toBe("new");
    expect(inputEvents).toEqual(["input", "change"]);
  });

  it("appends when replace is false", () => {
    const pipecat = setup(`<input id="i" value="hello" />`);
    emit(pipecat, { target_id: "i", value: " world", replace: false });

    const input = document.getElementById("i") as HTMLInputElement;
    expect(input.value).toBe("hello world");
  });

  it("works on textarea", () => {
    const pipecat = setup(`<textarea id="t">stale</textarea>`);
    emit(pipecat, { target_id: "t", value: "fresh content" });

    const ta = document.getElementById("t") as HTMLTextAreaElement;
    expect(ta.value).toBe("fresh content");
  });

  it("refuses on disabled inputs", () => {
    const pipecat = setup(`<input id="i" value="locked" disabled />`);
    emit(pipecat, { target_id: "i", value: "tried" });

    const input = document.getElementById("i") as HTMLInputElement;
    expect(input.value).toBe("locked");
  });

  it("refuses on readonly inputs", () => {
    const pipecat = setup(`<input id="i" value="locked" readonly />`);
    emit(pipecat, { target_id: "i", value: "tried" });

    const input = document.getElementById("i") as HTMLInputElement;
    expect(input.value).toBe("locked");
  });

  it("refuses on hidden inputs", () => {
    const pipecat = setup(`<input id="i" type="hidden" value="secret" />`);
    emit(pipecat, { target_id: "i", value: "leaked" });

    const input = document.getElementById("i") as HTMLInputElement;
    expect(input.value).toBe("secret");
  });

  it("is a no-op on non-input targets", () => {
    const pipecat = setup(`<div id="d">text</div>`);
    emit(pipecat, { target_id: "d", value: "anything" });

    expect(document.getElementById("d")!.textContent).toBe("text");
  });

  it("is a no-op when ref/target_id resolves to nothing", () => {
    const pipecat = setup(`<input id="i" value="kept" />`);
    emit(pipecat, { target_id: "nope", value: "tried" });

    const input = document.getElementById("i") as HTMLInputElement;
    expect(input.value).toBe("kept");
  });
});
