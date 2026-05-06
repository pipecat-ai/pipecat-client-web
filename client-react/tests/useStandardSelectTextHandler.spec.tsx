/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react";
import React from "react";

import { useStandardSelectTextHandler } from "../src/standardHandlers";
import { usePipecatClient } from "../src/usePipecatClient";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

function makeMockPipecatClient() {
  const listeners: Set<(data: unknown) => void> = new Set();
  return {
    sendRTVIMessage: jest.fn(),
    registerUICommandHandler: jest.fn((command: string, handler: unknown) => {
      const listener = (data: unknown) => {
        if (
          data &&
          typeof data === "object" &&
          (data as { command?: unknown }).command === command
        ) {
          (handler as (payload: unknown) => void)(
            (data as { payload?: unknown }).payload,
          );
        }
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
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
    pipecat.emit({ command: "select_text", payload });
  });
}

function withHandler() {
  const Probe: React.FC = () => {
    useStandardSelectTextHandler({ scrollIntoViewFirst: false });
    return null;
  };
  return Probe;
}

describe("useStandardSelectTextHandler", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  it("selects all text in a document element when no offsets are given", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = `<p id="p">First sentence here.</p>`;

    const Probe = withHandler();
    render(<Probe />);

    emit(pipecat, { target_id: "p" });

    const sel = window.getSelection()!;
    expect(sel.toString()).toBe("First sentence here.");
  });

  it("selects a sub-range using start_offset / end_offset on a document element", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = `<p id="p">First sentence here.</p>`;

    const Probe = withHandler();
    render(<Probe />);

    emit(pipecat, { target_id: "p", start_offset: 6, end_offset: 14 });

    const sel = window.getSelection()!;
    expect(sel.toString()).toBe("sentence");
  });

  it("walks descendant text nodes to find the right offset", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    // The selection straddles a child element: "this part" is split
    // across an outer text node, an inline <span>, and another outer
    // text node. The walker needs to step through them.
    document.body.innerHTML = `<p id="p">Read <span>this part</span> please.</p>`;

    const Probe = withHandler();
    render(<Probe />);

    emit(pipecat, { target_id: "p", start_offset: 5, end_offset: 14 });

    const sel = window.getSelection()!;
    expect(sel.toString()).toBe("this part");
  });

  it("uses setSelectionRange on input/textarea targets", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = `<input id="i" value="hello world" />`;

    const Probe = withHandler();
    render(<Probe />);

    emit(pipecat, { target_id: "i", start_offset: 6, end_offset: 11 });

    const input = document.getElementById("i") as HTMLInputElement;
    expect(input.selectionStart).toBe(6);
    expect(input.selectionEnd).toBe(11);
  });

  it("calls el.select() on input/textarea when no offsets are given", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = `<input id="i" value="hello world" />`;

    const Probe = withHandler();
    render(<Probe />);

    const input = document.getElementById("i") as HTMLInputElement;
    const select = jest.spyOn(input, "select");

    emit(pipecat, { target_id: "i" });

    expect(select).toHaveBeenCalledTimes(1);
  });

  it("falls back to selecting all content when offsets are out of range", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = `<p id="p">Short.</p>`;

    const Probe = withHandler();
    render(<Probe />);

    emit(pipecat, { target_id: "p", start_offset: 1000, end_offset: 2000 });

    const sel = window.getSelection()!;
    // Out-of-range offsets shouldn't crash; the handler falls back to
    // selecting the entire element so the user still sees something.
    expect(sel.toString()).toBe("Short.");
  });

  it("is a no-op when neither ref nor target_id resolves", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);
    document.body.innerHTML = `<p id="p">Some text.</p>`;
    // Pre-existing selection so we can verify it isn't disturbed.
    const p = document.getElementById("p")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, 4);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const Probe = withHandler();
    render(<Probe />);

    emit(pipecat, { target_id: "nope" });

    expect(sel.toString()).toBe("Some");
  });
});
