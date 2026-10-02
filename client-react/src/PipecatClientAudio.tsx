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

  // Start playback explicitly instead of relying only on the autoPlay
  // attribute. Since iOS/Safari 27, a hidden <audio> whose MediaStream is
  // attached after the user-gesture window is no longer autoplayed, but an
  // explicit play() is not subject to that block. Safe to call repeatedly.
  const playBotAudio = useCallback(() => {
    botAudioRef.current?.play().catch((error) => {
      console.warn("Failed to play bot audio", error);
    });
  }, []);

  useEffect(() => {
    if (!botAudioRef.current || !botAudioTrack) return;
    if (botAudioRef.current.srcObject) {
      const oldTrack = (
        botAudioRef.current.srcObject as MediaStream
      ).getAudioTracks()[0];
      if (oldTrack.id === botAudioTrack.id) return;
    }
    botAudioRef.current.srcObject = new MediaStream([botAudioTrack]);
    playBotAudio();
  }, [botAudioTrack, playBotAudio]);

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
      <audio ref={botAudioRef} autoPlay onCanPlay={playBotAudio} />
    </>
  );
};
PipecatClientAudio.displayName = "PipecatClientAudio";
