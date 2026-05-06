/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react";
import React from "react";

import { usePipecatClient } from "../src/usePipecatClient";
import { useUIEventSender } from "../src/useUIEventSender";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

describe("useUIEventSender", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("sends ui-event through the ambient Pipecat client", () => {
    const sendUIEvent = jest.fn();
    mockUsePipecatClient.mockReturnValue({
      sendUIEvent,
    });

    let sender: (event: string, payload?: unknown) => void = () => {
      throw new Error("sender not yet bound");
    };

    const Probe: React.FC = () => {
      sender = useUIEventSender();
      return null;
    };

    render(<Probe />);

    act(() => {
      sender("nav_click", { view: "home" });
    });

    expect(sendUIEvent).toHaveBeenCalledTimes(1);
    expect(sendUIEvent).toHaveBeenCalledWith("nav_click", { view: "home" });
  });

  it("is a no-op when the Pipecat client is unavailable", () => {
    mockUsePipecatClient.mockReturnValue(undefined);

    let sender: (event: string, payload?: unknown) => void = () => {
      throw new Error("sender not yet bound");
    };

    const Probe: React.FC = () => {
      sender = useUIEventSender();
      return null;
    };

    render(<Probe />);

    expect(() => {
      act(() => {
        sender("hello");
      });
    }).not.toThrow();
  });
});
