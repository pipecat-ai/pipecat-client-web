/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent } from "@pipecat-ai/client-js";
import React, { useCallback, useEffect, useRef } from "react";

import { usePipecatClientMediaTrack } from "./usePipecatClientMediaTrack";
import { usePipecatClientParticipantIds } from "./usePipecatClientParticipantIds";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

interface AudioElementProps
  extends React.AudioHTMLAttributes<HTMLAudioElement> {
  participantId: string;
  track: MediaStreamTrack | null;
}

const AudioElement = ({
  participantId,
  track,
  ...props
}: AudioElementProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current || !track) return;
    if (audioRef.current.srcObject) {
      const oldTrack = (
        audioRef.current.srcObject as MediaStream
      ).getAudioTracks()[0];
      if (oldTrack.id === track.id) return;
    }
    audioRef.current.srcObject = new MediaStream([track]);
  }, [track]);

  useRTVIClientEvent(
    RTVIEvent.SpeakerUpdated,
    useCallback((speaker: MediaDeviceInfo) => {
      if (!audioRef.current) return;
      if (typeof audioRef.current.setSinkId !== "function") return;
      audioRef.current.setSinkId(speaker.deviceId);
    }, [])
  );

  return (
    <audio
      ref={audioRef}
      autoPlay
      data-participant-id={participantId}
      {...props}
    />
  );
};

/**
 * Component for individual participant audio
 */
const ParticipantAudio = ({ participantId }: { participantId: string }) => {
  // Determine participant type and get appropriate tracks
  const isLocal = participantId === "local";
  const isBot = participantId === "bot";
  const isRemote = !isLocal && !isBot;

  const audioTrack = usePipecatClientMediaTrack(
    "audio",
    isLocal ? "local" : isBot ? "bot" : "remote",
    isRemote ? participantId : undefined
  );

  const screenAudioTrack = usePipecatClientMediaTrack(
    "screenAudio",
    isLocal ? "local" : "remote",
    isRemote ? participantId : undefined
  );

  return (
    <>
      <AudioElement
        data-bot={isBot}
        data-local={isLocal}
        data-remote={isRemote}
        data-track-type="audio"
        participantId={participantId}
        track={audioTrack}
      />
      {screenAudioTrack && (
        <AudioElement
          data-bot={isBot}
          data-local={isLocal}
          data-remote={isRemote}
          data-track-type="screenAudio"
          participantId={`${participantId}-screen`}
          track={screenAudioTrack}
        />
      )}
    </>
  );
};

/**
 * Component that renders all participant audio.
 */
export const PipecatClientAudio = () => {
  const { participantIds } = usePipecatClientParticipantIds(false, true);

  return (
    <>
      {/* All participant audio */}
      {participantIds.map((participantId) => (
        <ParticipantAudio key={participantId} participantId={participantId} />
      ))}
    </>
  );
};
PipecatClientAudio.displayName = "PipecatClientAudio";
