/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { DTMFButton } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import React from "react";

import { useDTMF } from "../../src/useDTMF";
import { usePipecatClient } from "../../src/usePipecatClient";

jest.mock("../../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

describe("useDTMF", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("sends a tone through the ambient Pipecat client", () => {
    const sendDTMF = jest.fn();
    mockUsePipecatClient.mockReturnValue({
      sendDTMF,
    });

    let sendTone: (button: DTMFButton) => void = () => {
      throw new Error("sendTone not yet bound");
    };

    const Probe: React.FC = () => {
      ({ sendTone } = useDTMF());
      return null;
    };

    render(<Probe />);

    act(() => {
      sendTone("1");
    });

    expect(sendDTMF).toHaveBeenCalledTimes(1);
    expect(sendDTMF).toHaveBeenCalledWith("1");
  });

  it("passes a multi-key sequence through to sendDTMF", () => {
    const sendDTMF = jest.fn();
    mockUsePipecatClient.mockReturnValue({
      sendDTMF,
    });

    let sendTone: (dtmf: DTMFButton | string) => void = () => {
      throw new Error("sendTone not yet bound");
    };

    const Probe: React.FC = () => {
      ({ sendTone } = useDTMF());
      return null;
    };

    render(<Probe />);

    act(() => {
      sendTone("123#");
    });

    expect(sendDTMF).toHaveBeenCalledTimes(1);
    expect(sendDTMF).toHaveBeenCalledWith("123#");
  });

  it("is a no-op when the Pipecat client is unavailable", () => {
    mockUsePipecatClient.mockReturnValue(undefined);

    let sendTone: (button: DTMFButton) => void = () => {
      throw new Error("sendTone not yet bound");
    };

    const Probe: React.FC = () => {
      ({ sendTone } = useDTMF());
      return null;
    };

    render(<Probe />);

    expect(() => {
      act(() => {
        sendTone("#");
      });
    }).not.toThrow();
  });
});
