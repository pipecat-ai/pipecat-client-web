/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent } from "@pipecat-ai/client-js";
import { useCallback, useEffect, useRef } from "react";

import { usePipecatClientMediaTrack } from "./usePipecatClientMediaTrack";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

export const PipecatClientAudio = () => {
  const botAudioRef = useRef<HTMLAudioElement>(null);
  const botAudioTrack = usePipecatClientMediaTrack("audio", "bot");

  useEffect(() => {
    if (!botAudioRef.current || !botAudioTrack) return;
    if (botAudioRef.current.srcObject) {
      const oldTrack = (
        botAudioRef.current.srcObject as MediaStream
      ).getAudioTracks()[0];
      if (oldTrack.id === botAudioTrack.id) return;
    }
    botAudioRef.current.srcObject = new MediaStream([botAudioTrack]);
  }, [botAudioTrack]);

  useRTVIClientEvent(
    RTVIEvent.SpeakerUpdated,
    useCallback((speaker: MediaDeviceInfo) => {
      if (!botAudioRef.current) return;
      if (typeof botAudioRef.current.setSinkId !== "function") return;
      botAudioRef.current.setSinkId(speaker.deviceId);
    }, [])
  );

  return (
    <>
      <audio ref={botAudioRef} autoPlay />
    </>
  );
};
PipecatClientAudio.displayName = "PipecatClientAudio";
