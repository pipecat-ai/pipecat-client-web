/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react";
import React from "react";

import { usePipecatClient } from "../../src/usePipecatClient";
import { useUISnapshot } from "../../src/useUISnapshot";

jest.mock("../../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

function makeMockPipecatClient() {
  return {
    startUISnapshotStream: jest.fn(),
    stopUISnapshotStream: jest.fn(),
  };
}

describe("useUISnapshot", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("starts the managed client stream on mount", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const Probe: React.FC = () => {
      useUISnapshot({ debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    expect(pipecat.startUISnapshotStream).toHaveBeenCalledWith({
      debounceMs: 100,
      trackViewport: true,
      logSnapshots: false,
    });
  });

  it("stops the managed client stream on unmount", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const Probe: React.FC = () => {
      useUISnapshot({ debounceMs: 100 });
      return null;
    };

    const rendered = render(<Probe />);
    rendered.unmount();

    expect(pipecat.stopUISnapshotStream).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when enabled is false", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const Probe: React.FC = () => {
      useUISnapshot({ enabled: false, debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    expect(pipecat.startUISnapshotStream).not.toHaveBeenCalled();
  });

  it("stops and restarts when enabled toggles false then true", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const Probe: React.FC<{ enabled: boolean }> = ({ enabled }) => {
      useUISnapshot({ enabled, debounceMs: 100 });
      return null;
    };

    const rendered = render(<Probe enabled={true} />);
    expect(pipecat.startUISnapshotStream).toHaveBeenCalledTimes(1);

    rendered.rerender(<Probe enabled={false} />);
    expect(pipecat.stopUISnapshotStream).toHaveBeenCalledTimes(1);

    rendered.rerender(<Probe enabled={true} />);
    expect(pipecat.startUISnapshotStream).toHaveBeenCalledTimes(2);
  });
});
