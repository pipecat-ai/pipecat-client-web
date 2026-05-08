/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import React from "react";

import { useDefaultSelectTextHandler } from "../../src/defaultUICommandHandlers";
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
  payload: Record<string, unknown>,
) {
  act(() => {
    pipecat.emit({ command: "select_text", payload });
  });
}

function withHandler() {
  const Probe: React.FC = () => {
    useDefaultSelectTextHandler({ scrollIntoViewFirst: false });
    return null;
  };
  return Probe;
}

function setup(html: string) {
  const pipecat = makeMockPipecatClient();
  document.body.innerHTML = html;

  const Probe = withHandler();
  render(
    <PipecatClientProvider client={pipecat as never}>
      <Probe />
    </PipecatClientProvider>,
  );
  return pipecat;
}

describe("useDefaultSelectTextHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "debug").mockImplementation(() => {});
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("selects all text in a document element when no offsets are given", () => {
    const pipecat = setup(`<p id="p">First sentence here.</p>`);

    emit(pipecat, { target_id: "p" });

    const sel = window.getSelection()!;
    expect(sel.toString()).toBe("First sentence here.");
  });

  it("selects a sub-range using start_offset / end_offset on a document element", () => {
    const pipecat = setup(`<p id="p">First sentence here.</p>`);

    emit(pipecat, { target_id: "p", start_offset: 6, end_offset: 14 });

    const sel = window.getSelection()!;
    expect(sel.toString()).toBe("sentence");
  });

  it("walks descendant text nodes to find the right offset", () => {
    // The selection straddles a child element: "this part" is split
    // across an outer text node, an inline <span>, and another outer
    // text node. The walker needs to step through them.
    const pipecat = setup(
      `<p id="p">Read <span>this part</span> please.</p>`,
    );

    emit(pipecat, { target_id: "p", start_offset: 5, end_offset: 14 });

    const sel = window.getSelection()!;
    expect(sel.toString()).toBe("this part");
  });

  it("uses setSelectionRange on input/textarea targets", () => {
    const pipecat = setup(`<input id="i" value="hello world" />`);

    emit(pipecat, { target_id: "i", start_offset: 6, end_offset: 11 });

    const input = document.getElementById("i") as HTMLInputElement;
    expect(input.selectionStart).toBe(6);
    expect(input.selectionEnd).toBe(11);
  });

  it("calls el.select() on input/textarea when no offsets are given", () => {
    const pipecat = setup(`<input id="i" value="hello world" />`);

    const input = document.getElementById("i") as HTMLInputElement;
    const select = jest.spyOn(input, "select");

    emit(pipecat, { target_id: "i" });

    expect(select).toHaveBeenCalledTimes(1);
  });

  it("falls back to el.select() on input/textarea when offsets are inverted", () => {
    const pipecat = setup(`<input id="i" value="hello world" />`);

    const input = document.getElementById("i") as HTMLInputElement;
    const select = jest.spyOn(input, "select");

    emit(pipecat, { target_id: "i", start_offset: 9, end_offset: 2 });

    expect(select).toHaveBeenCalledTimes(1);
  });

  it("falls back to selecting all content when offsets are out of range", () => {
    const pipecat = setup(`<p id="p">Short.</p>`);

    emit(pipecat, { target_id: "p", start_offset: 1000, end_offset: 2000 });

    const sel = window.getSelection()!;
    // Out-of-range offsets shouldn't crash; the handler falls back to
    // selecting the entire element so the user still sees something.
    expect(sel.toString()).toBe("Short.");
  });

  it("is a no-op when neither ref nor target_id resolves", () => {
    const pipecat = setup(`<p id="p">Some text.</p>`);
    // Pre-existing selection so we can verify it isn't disturbed.
    const p = document.getElementById("p")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, 4);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    emit(pipecat, { target_id: "nope" });

    expect(sel.toString()).toBe("Some");
  });
});
