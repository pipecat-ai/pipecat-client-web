/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { Participant, RTVIEvent, Tracks } from "@pipecat-ai/client-js";
import { atom, useAtomValue } from "jotai";
import { atomFamily, useAtomCallback } from "jotai/utils";
import { PrimitiveAtom } from "jotai/vanilla";
import { useCallback, useEffect } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

type ParticipantType = keyof Tracks;
type TrackType = keyof Tracks["local"];

const localAudioTrackAtom = atom<MediaStreamTrack | null>(null);
const localVideoTrackAtom = atom<MediaStreamTrack | null>(null);
const localScreenAudioTrackAtom = atom<MediaStreamTrack | null>(null);
const localScreenVideoTrackAtom = atom<MediaStreamTrack | null>(null);
const botAudioTrackAtom = atom<MediaStreamTrack | null>(null);
const botVideoTrackAtom = atom<MediaStreamTrack | null>(null);

const trackAtom = atomFamily<
  { local: boolean; trackType: TrackType },
  PrimitiveAtom<MediaStreamTrack | null>
>(({ local, trackType }) => {
  if (local) {
    switch (trackType) {
      case "audio":
        return localAudioTrackAtom;
      case "screenAudio":
        return localScreenAudioTrackAtom;
      case "screenVideo":
        return localScreenVideoTrackAtom;
      case "video":
        return localVideoTrackAtom;
    }
  }
  return trackType === "audio" ? botAudioTrackAtom : botVideoTrackAtom;
});

export const usePipecatClientMediaTrack = (
  trackType: TrackType,
  participantType: ParticipantType
) => {
  const client = usePipecatClient();
  const track = useAtomValue(
    trackAtom({ local: participantType === "local", trackType })
  );

  const updateTrack = useAtomCallback(
    useCallback(
      (
        get,
        set,
        track: MediaStreamTrack,
        trackType: TrackType,
        local: boolean
      ) => {
        const atom = trackAtom({
          local,
          trackType,
        });
        const oldTrack = get(atom);
        if (oldTrack?.id === track.id) return;
        set(atom, track);
      },
      []
    )
  );

  useRTVIClientEvent(
    RTVIEvent.TrackStarted,
    useCallback(
      (track: MediaStreamTrack, participant?: Participant) => {
        updateTrack(
          track,
          track.kind as TrackType,
          Boolean(participant?.local)
        );
      },
      [updateTrack]
    )
  );

  useRTVIClientEvent(
    RTVIEvent.ScreenTrackStarted,
    useCallback(
      (track: MediaStreamTrack, participant?: Participant) => {
        const trackType =
          track.kind === "audio" ? "screenAudio" : "screenVideo";
        updateTrack(track, trackType, Boolean(participant?.local));
      },
      [updateTrack]
    )
  );

  useEffect(() => {
    if (!client) return;
    const tracks = client.tracks();
    const track = tracks?.[participantType]?.[trackType];
    if (!track) return;
    updateTrack(track, trackType, participantType === "local");
  }, [participantType, trackType, updateTrack, client]);

  return track;
};
