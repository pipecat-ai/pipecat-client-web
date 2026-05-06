/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react";
import React from "react";

import { useA11ySnapshot } from "../src/useA11ySnapshot";
import { usePipecatClient } from "../src/usePipecatClient";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

function makeMockPipecatClient() {
  return {
    startA11ySnapshotStream: jest.fn(),
    stopA11ySnapshotStream: jest.fn(),
  };
}

describe("useA11ySnapshot", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("starts the managed client stream on mount", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const Probe: React.FC = () => {
      useA11ySnapshot({ debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    expect(pipecat.startA11ySnapshotStream).toHaveBeenCalledWith({
      debounceMs: 100,
      trackViewport: true,
      logSnapshots: false,
    });
  });

  it("stops the managed client stream on unmount", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const Probe: React.FC = () => {
      useA11ySnapshot({ debounceMs: 100 });
      return null;
    };

    const rendered = render(<Probe />);
    rendered.unmount();

    expect(pipecat.stopA11ySnapshotStream).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when enabled is false", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const Probe: React.FC = () => {
      useA11ySnapshot({ enabled: false, debounceMs: 100 });
      return null;
    };

    render(<Probe />);

    expect(pipecat.startA11ySnapshotStream).not.toHaveBeenCalled();
  });
});
