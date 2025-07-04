/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent, TransportState } from "@pipecat-ai/client-js";
import React, { createContext, useCallback, useState } from "react";

import { useRTVIClient } from "./useRTVIClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

export const RTVICamStateContext = createContext<{
  enableCam: (enabled: boolean) => void;
  isCamEnabled: boolean;
}>({
  enableCam: () => {
    throw new Error(
      "RTVICamStateContext: enableCam() called outside of provider"
    );
  },
  isCamEnabled: false,
});
export const RTVIMicStateContext = createContext<{
  enableMic: (enabled: boolean) => void;
  isMicEnabled: boolean;
}>({
  enableMic: () => {
    throw new Error(
      "RTVIMicStateContext: enableMic() called outside of provider"
    );
  },
  isMicEnabled: false,
});
export const RTVITransportStateContext =
  createContext<TransportState>("disconnected");

export const RTVIClientStateProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const client = useRTVIClient();
  const [isCamEnabled, setIsCamEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [transportState, setTransportState] =
    useState<TransportState>("disconnected");

  useRTVIClientEvent(RTVIEvent.TransportStateChanged, (state) => {
    setTransportState(state);
    if (state === "initialized" && client) {
      setIsCamEnabled(client.isCamEnabled ?? false);
      setIsMicEnabled(client.isMicEnabled ?? false);
    }
  });

  const enableCam = useCallback(
    (enabled: boolean) => {
      setIsCamEnabled(enabled);
      client?.enableCam?.(enabled);
    },
    [client]
  );

  const enableMic = useCallback(
    (enabled: boolean) => {
      setIsMicEnabled(enabled);
      client?.enableMic?.(enabled);
    },
    [client]
  );

  return (
    <RTVITransportStateContext.Provider value={transportState}>
      <RTVICamStateContext.Provider value={{ enableCam, isCamEnabled }}>
        <RTVIMicStateContext.Provider value={{ enableMic, isMicEnabled }}>
          {children}
        </RTVIMicStateContext.Provider>
      </RTVICamStateContext.Provider>
    </RTVITransportStateContext.Provider>
  );
};
