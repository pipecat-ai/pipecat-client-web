/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { Tracks } from "@pipecat-ai/client-js";
import { useAtomValue } from "jotai";
import { useMemo } from "react";

import { trackAtom } from "./PipecatClientParticipantManager";

type ParticipantType = keyof Tracks | "remote";
type TrackType = keyof Tracks["local"];

/**
 * Hook to get individual participant media track
 */
export const usePipecatClientMediaTrack = (
  trackType: TrackType,
  participantType: ParticipantType,
  participantId?: string
) => {
  // Memoize the track key to prevent infinite re-renders
  const trackKey = useMemo((): `${string}:${TrackType}` => {
    let actualParticipantId: string;

    if (participantType === "local") {
      actualParticipantId = "local";
    } else if (participantType === "bot") {
      actualParticipantId = "bot";
    } else if (participantType === "remote" && participantId) {
      actualParticipantId = participantId;
    } else {
      // Fallback for invalid combinations
      actualParticipantId = "local";
    }

    return `${actualParticipantId}:${trackType}`;
  }, [trackType, participantType, participantId]);

  const track = useAtomValue(trackAtom(trackKey));

  return track;
};
