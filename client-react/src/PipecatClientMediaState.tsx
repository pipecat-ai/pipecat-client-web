/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */
import { MediaState, RTVIEvent } from "@pipecat-ai/client-js";
import { atom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import React, { useCallback, useEffect } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

const DEFAULT_MEDIA_STATE: MediaState = {
  mic: { state: "uninitialized" },
  cam: { state: "uninitialized" },
};

/**
 * Module-scoped jotai atom holding the current per-device MediaState.
 * Owned by PipecatClientMediaStateProvider — that's the single point that
 * seeds it from `client.mediaState` and writes to it on every
 * RTVIEvent.MediaStateUpdated. Hooks (useMediaState,
 * usePipecatClientMediaDevices) only read.
 */
const mediaStateAtom = atom<MediaState>(DEFAULT_MEDIA_STATE);

/**
 * Provider that mirrors the underlying PipecatClient's MediaState into the
 * shared jotai atom. Rendered automatically by PipecatClientProvider; not
 * exported, so apps don't need to wire it up themselves.
 *
 * Centralizing the subscription here means consumer hooks stay thin — they
 * just read the atom, with no per-hook seed effect — and a hook that mounts
 * after initDevices() has run still sees the current state immediately.
 */
export const PipecatClientMediaStateProvider: React.FC<
  React.PropsWithChildren
> = ({ children }) => {
  const client = usePipecatClient();

  const setMediaState = useAtomCallback(
    useCallback((_get, set, state: MediaState) => {
      set(mediaStateAtom, state);
    }, [])
  );

  // Seed from the current client snapshot. Covers the late-mount case
  // (useMediaState consumers that mount after MediaStateUpdated has already
  // fired) and the client-swap case (e.g. an app rebuilding its
  // PipecatClient with new options).
  useEffect(() => {
    setMediaState(client?.mediaState ?? DEFAULT_MEDIA_STATE);
  }, [client, setMediaState]);

  useRTVIClientEvent(
    RTVIEvent.MediaStateUpdated,
    useCallback(
      (next: MediaState) => {
        setMediaState(next);
      },
      [setMediaState]
    )
  );

  return <>{children}</>;
};

/**
 * Subscribe to the per-device MediaState reported by the underlying
 * PipecatClient. Returns a snapshot that re-renders the consumer whenever
 * mic or cam transitions.
 *
 * Safe to call from any component rendered inside PipecatClientProvider —
 * the subscription is owned by PipecatClientMediaStateProvider, which is
 * mounted automatically.
 */
export const useMediaState = (): MediaState => useAtomValue(mediaStateAtom);
