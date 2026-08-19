/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent, TransportState } from "@pipecat-ai/client-js";
import React, { createContext, useCallback, useState } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

export const PipecatClientCamStateContext = createContext<{
  enableCam: (enabled: boolean) => void;
  isCamEnabled: boolean;
}>({
  enableCam: () => {
    throw new Error(
      "PipecatClientCamStateContext: enableCam() called outside of provider"
    );
  },
  isCamEnabled: false,
});
export const PipecatClientMicStateContext = createContext<{
  enableMic: (enabled: boolean) => void;
  isMicEnabled: boolean;
}>({
  enableMic: () => {
    throw new Error(
      "PipecatClientMicStateContext: enableMic() called outside of provider"
    );
  },
  isMicEnabled: false,
});
export const PipecatClientScreenShareStateContext = createContext<{
  enableScreenShare: (enabled: boolean) => void;
  isScreenShareEnabled: boolean;
}>({
  enableScreenShare: () => {
    throw new Error(
      "PipecatClientScreenShareStateContext: enableScreenShare() called outside of provider"
    );
  },
  isScreenShareEnabled: false,
});
export const PipecatClientTransportStateContext =
  createContext<TransportState>("disconnected");

export const PipecatClientStateProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const client = usePipecatClient();
  const [isCamEnabled, setIsCamEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isScreenShareEnabled, setIsScreenShareEnabled] = useState(false);
  const [transportState, setTransportState] =
    useState<TransportState>("disconnected");

  useRTVIClientEvent(RTVIEvent.TransportStateChanged, (state) => {
    setTransportState(state);
    if (state === "initialized" && client) {
      setIsCamEnabled(client.isCamEnabled ?? false);
      setIsMicEnabled(client.isMicEnabled ?? false);
      setIsScreenShareEnabled(client.isSharingScreen ?? false);
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

  const enableScreenShare = useCallback(
    (enabled: boolean) => {
      client?.enableScreenShare?.(enabled);
    },
    [client]
  );

  useRTVIClientEvent(RTVIEvent.ScreenTrackStarted, (_track, participant) => {
    if (participant?.local) {
      setIsScreenShareEnabled(true);
    }
  });

  useRTVIClientEvent(RTVIEvent.ScreenTrackStopped, (_track, participant) => {
    if (participant?.local) {
      setIsScreenShareEnabled(false);
    }
  });

  // TrackStarted/Stopped fire for more than an enabled/disabled toggle — a
  // device switch is Stopped(old)+Started(new) with the enabled state never
  // conceptually changing, so treating "stopped" as false / "started" as
  // true would drift from reality whenever those causes interleave. Use the
  // event purely as a signal to re-check, and read the actual state off the
  // client (the source of truth) rather than inferring it from which event
  // fired.
  useRTVIClientEvent(RTVIEvent.TrackStarted, (track, participant) => {
    if (!participant?.local || !client) return;
    if (track.kind === "audio") setIsMicEnabled(client.isMicEnabled ?? false);
    if (track.kind === "video") setIsCamEnabled(client.isCamEnabled ?? false);
  });

  useRTVIClientEvent(RTVIEvent.TrackStopped, (track, participant) => {
    if (!participant?.local || !client) return;
    if (track.kind === "audio") setIsMicEnabled(client.isMicEnabled ?? false);
    if (track.kind === "video") setIsCamEnabled(client.isCamEnabled ?? false);
  });

  return (
    <PipecatClientTransportStateContext.Provider value={transportState}>
      <PipecatClientCamStateContext.Provider
        value={{ enableCam, isCamEnabled }}
      >
        <PipecatClientMicStateContext.Provider
          value={{ enableMic, isMicEnabled }}
        >
          <PipecatClientScreenShareStateContext.Provider
            value={{ enableScreenShare, isScreenShareEnabled }}
          >
            {children}
          </PipecatClientScreenShareStateContext.Provider>
        </PipecatClientMicStateContext.Provider>
      </PipecatClientCamStateContext.Provider>
    </PipecatClientTransportStateContext.Provider>
  );
};
