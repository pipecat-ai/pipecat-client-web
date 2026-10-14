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
import { RTVIEvent } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import React from "react";

import { PipecatClientProvider } from "../../src/PipecatClientProvider";
import { usePipecatClientAudioElement } from "../../src/usePipecatClientAudioElement";

let mockTrack: { id: string; kind: string } | null = null;

jest.mock("../../src/usePipecatClientMediaTrack", () => ({
  usePipecatClientMediaTrack: () => mockTrack,
}));

class MockMediaStream {
  tracks: Array<{ id: string; kind: string }>;
  constructor(tracks: Array<{ id: string; kind: string }>) {
    this.tracks = tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

function makeMockPipecatClient() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on: jest.fn((event: string, handler: unknown) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler as (...args: unknown[]) => void);
    }),
    off: jest.fn((event: string, handler: unknown) => {
      listeners.get(event)?.delete(handler as (...args: unknown[]) => void);
    }),
    emit: (event: string, ...args: unknown[]) => {
      for (const l of listeners.get(event) ?? []) l(...args);
    },
  };
}

const Probe: React.FC = () => {
  const ref = usePipecatClientAudioElement();
  return <audio data-testid="bot-audio" ref={ref} autoPlay />;
};

function setup() {
  const pipecat = makeMockPipecatClient();
  const utils = render(
    <PipecatClientProvider client={pipecat as never}>
      <Probe />
    </PipecatClientProvider>,
  );
  const rerender = () =>
    utils.rerender(
      <PipecatClientProvider client={pipecat as never}>
        <Probe />
      </PipecatClientProvider>,
    );
  const audio = utils.getByTestId("bot-audio") as HTMLAudioElement;
  return { pipecat, audio, rerender, unmount: utils.unmount };
}

describe("usePipecatClientAudioElement", () => {
  let playMock: jest.Mock<() => Promise<void>>;
  let setSinkIdMock: jest.Mock<(deviceId: string) => Promise<void>>;
  let warnSpy: jest.SpiedFunction<typeof console.warn>;
  const srcObjects = new WeakMap<object, unknown>();

  beforeEach(() => {
    mockTrack = null;
    playMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    setSinkIdMock = jest
      .fn<(deviceId: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as Record<string, unknown>).MediaStream = MockMediaStream;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      writable: true,
      value: playMock,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      writable: true,
      value: setSinkIdMock,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      get() {
        return srcObjects.get(this) ?? null;
      },
      set(v: unknown) {
        srcObjects.set(this, v);
      },
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete (globalThis as Record<string, unknown>).MediaStream;
    jest.clearAllMocks();
  });

  it("attaches the bot track to the element and plays", () => {
    mockTrack = { id: "t1", kind: "audio" };
    const { audio } = setup();
    const stream = audio.srcObject as unknown as MockMediaStream;
    expect(stream).toBeInstanceOf(MockMediaStream);
    expect(stream.getAudioTracks()[0].id).toBe("t1");
    expect(playMock).toHaveBeenCalled();
  });

  it("does not reattach the same track", () => {
    mockTrack = { id: "t1", kind: "audio" };
    const { audio, rerender } = setup();
    const firstStream = audio.srcObject;
    playMock.mockClear();
    mockTrack = { id: "t1", kind: "audio" };
    rerender();
    expect(audio.srcObject).toBe(firstStream);
    expect(playMock).not.toHaveBeenCalled();
  });

  it("swaps streams when a new track arrives", () => {
    mockTrack = { id: "t1", kind: "audio" };
    const { audio, rerender } = setup();
    const firstStream = audio.srcObject;
    mockTrack = { id: "t2", kind: "audio" };
    rerender();
    expect(audio.srcObject).not.toBe(firstStream);
    expect(
      (audio.srcObject as unknown as MockMediaStream).getAudioTracks()[0].id,
    ).toBe("t2");
  });

  it("plays again on canplay", () => {
    const { audio } = setup();
    playMock.mockClear();
    act(() => {
      audio.dispatchEvent(new Event("canplay"));
    });
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("unlocks on the first user gesture, once", () => {
    setup();
    expect(playMock).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(playMock).toHaveBeenCalledTimes(1);
    act(() => {
      document.dispatchEvent(new Event("pointerdown"));
      document.dispatchEvent(new Event("touchend"));
      document.dispatchEvent(new Event("keydown"));
    });
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("removes unlock listeners on unmount", () => {
    const { unmount } = setup();
    unmount();
    act(() => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(playMock).not.toHaveBeenCalled();
  });

  it("ignores a rejected unlock play()", async () => {
    playMock.mockRejectedValue(new Error("NotAllowedError"));
    setup();
    await act(async () => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when attach-time play() rejects, except for AbortError", async () => {
    const notAllowed = new Error("denied");
    notAllowed.name = "NotAllowedError";
    playMock.mockRejectedValue(notAllowed);
    mockTrack = { id: "t1", kind: "audio" };
    const { rerender } = setup();
    await act(async () => {});
    expect(warnSpy).toHaveBeenCalledWith("Failed to play bot audio", notAllowed);

    warnSpy.mockClear();
    const abort = new Error("aborted");
    abort.name = "AbortError";
    playMock.mockRejectedValue(abort);
    mockTrack = { id: "t2", kind: "audio" };
    rerender();
    await act(async () => {});
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("routes output via setSinkId on SpeakerUpdated", () => {
    const { pipecat } = setup();
    act(() => {
      pipecat.emit(RTVIEvent.SpeakerUpdated, { deviceId: "speaker-2" });
    });
    expect(setSinkIdMock).toHaveBeenCalledWith("speaker-2");
  });
});
