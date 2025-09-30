/**
 * Copyright (c) 2025, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { Participant, RTVIEvent, Tracks } from "@pipecat-ai/client-js";
import { atom } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { memo, useCallback } from "react";

import { useRTVIClientEvent } from "./useRTVIClientEvent";

// Remote participants tracking
export const remoteParticipantIdsAtom = atom<string[]>([]);

// Bot ID mapping - maps the bot's UUID to our internal "bot" identifier
const botIdAtom = atom<string | null>(null);

const localParticipantAtom = atom<Participant | null>(null);
const botParticipantAtom = atom<Participant | null>(null);

export const participantAtom = atomFamily((participantId: string) =>
  atom<Participant | null>((get) => {
    // Handle special cases for local and bot participants
    if (participantId === "local") {
      return get(localParticipantAtom);
    }

    if (participantId === "bot") {
      return get(botParticipantAtom);
    }

    // For remote participants, return the stored value
    return get(remoteParticipantAtom(participantId));
  })
);

// Keep the original remoteParticipantAtom for internal use
const remoteParticipantAtom = atomFamily(() => atom<Participant | null>(null));

// Unified track atom family for all participants and track types
type TrackType = keyof Tracks["local"];
type TrackKey = `${string}:${TrackType}`;

export const trackAtom = atomFamily((key: TrackKey) => {
  // Create a unique atom for each participant/track combination
  // Key format: "participantId:trackType"
  void key; // Acknowledge the key parameter
  return atom<MediaStreamTrack | null>(null);
});

/**
 * Component that manages participant events globally.
 */
export const PipecatClientParticipantManager = memo(() => {
  const addParticipant = useAtomCallback(
    useCallback((get, set, participant: Participant) => {
      if (participant.local) {
        set(localParticipantAtom, participant);
        return;
      }

      if (participant.id === get(botIdAtom)) {
        set(botParticipantAtom, participant);
        return;
      }

      const currentIds = get(remoteParticipantIdsAtom);
      if (!currentIds.includes(participant.id)) {
        set(remoteParticipantIdsAtom, [...currentIds, participant.id]);
      }
      set(remoteParticipantAtom(participant.id), participant);
    }, [])
  );

  const removeParticipant = useAtomCallback(
    useCallback((get, set, participant: Participant) => {
      if (participant.local) {
        set(localParticipantAtom, null);
        return;
      }

      if (participant.id === get(botIdAtom)) {
        set(botParticipantAtom, null);
        return;
      }

      const currentIds = get(remoteParticipantIdsAtom);
      set(
        remoteParticipantIdsAtom,
        currentIds.filter((id) => id !== participant.id)
      );

      // Clean up participant data
      set(remoteParticipantAtom(participant.id), null);

      // Clean up all track types for this participant
      const trackTypes: TrackType[] = [
        "audio",
        "video",
        "screenAudio",
        "screenVideo",
      ];
      trackTypes.forEach((trackType) => {
        const atom = trackAtom(`${participant.id}:${trackType}`);
        set(atom, null);
      });
    }, [])
  );

  // Set up event listeners for participant events
  useRTVIClientEvent(
    RTVIEvent.ParticipantConnected,
    useCallback(
      (participant: Participant) => {
        addParticipant(participant);
      },
      [addParticipant]
    )
  );

  useRTVIClientEvent(
    RTVIEvent.ParticipantLeft,
    useCallback(
      (participant: Participant) => {
        removeParticipant(participant);
      },
      [removeParticipant]
    )
  );

  // Handle bot connection to map bot UUID to our internal "bot" identifier
  useRTVIClientEvent(
    RTVIEvent.BotConnected,
    useAtomCallback(
      useCallback((_get, set, participant: Participant) => {
        set(botIdAtom, participant.id);
      }, [])
    )
  );

  // Set up event listeners for media track events
  const handleTrackStarted = useAtomCallback(
    useCallback(
      (get, set, track: MediaStreamTrack, participant?: Participant) => {
        if (!participant) return;

        const trackType = track.kind as TrackType;
        // Map participant to our internal ID system
        let internalId: string;
        if (participant.local) {
          internalId = "local";
        } else {
          // Check if this is the bot by comparing with stored bot ID
          const botId = get(botIdAtom);
          internalId =
            botId && participant.id === botId ? "bot" : participant.id;
        }
        // Update track directly
        const atom = trackAtom(`${internalId}:${trackType}`);
        const oldTrack = get(atom);
        if (oldTrack?.id === track.id) return;
        set(atom, track);
      },
      []
    )
  );

  const handleScreenTrackStarted = useAtomCallback(
    useCallback(
      (get, set, track: MediaStreamTrack, participant?: Participant) => {
        if (!participant) return;

        const trackType =
          track.kind === "audio" ? "screenAudio" : "screenVideo";
        // Map participant to our internal ID system
        let internalId: string;
        if (participant.local) {
          internalId = "local";
        } else {
          // Check if this is the bot by comparing with stored bot ID
          const botId = get(botIdAtom);
          internalId =
            botId && participant.id === botId ? "bot" : participant.id;
        }
        // Update track directly
        const atom = trackAtom(`${internalId}:${trackType}`);
        const oldTrack = get(atom);
        if (oldTrack?.id === track.id) return;
        set(atom, track);
      },
      []
    )
  );

  useRTVIClientEvent(RTVIEvent.TrackStarted, handleTrackStarted);
  useRTVIClientEvent(RTVIEvent.ScreenTrackStarted, handleScreenTrackStarted);

  return null;
});

PipecatClientParticipantManager.displayName = "PipecatClientParticipantManager";
