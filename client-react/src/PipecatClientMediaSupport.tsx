/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */
import { MediaSupport, RTVIEvent } from "@pipecat-ai/client-js";
import { atom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import React, { useCallback, useEffect } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

/**
 * Module-scoped jotai atom holding the current MediaSupport. Owned by
 * PipecatClientMediaSupportProvider, which seeds it from
 * `client.mediaSupport` and writes to it on every
 * RTVIEvent.MediaSupportUpdated. useMediaSupport only reads.
 */
const mediaSupportAtom = atom<MediaSupport>({});

/**
 * Provider that mirrors the underlying PipecatClient's MediaSupport into the
 * shared jotai atom. Rendered automatically by PipecatClientProvider; not
 * exported, so apps don't need to wire it up themselves.
 */
export const PipecatClientMediaSupportProvider: React.FC<
  React.PropsWithChildren
> = ({ children }) => {
  const client = usePipecatClient();

  const setMediaSupport = useAtomCallback(
    useCallback((_get, set, support: MediaSupport) => {
      set(mediaSupportAtom, support);
    }, [])
  );

  // Seed from the current client snapshot, so consumers that mount after
  // MediaSupportUpdated has fired, or after the client is swapped, see the
  // current value.
  useEffect(() => {
    setMediaSupport(client?.mediaSupport ?? {});
  }, [client, setMediaSupport]);

  useRTVIClientEvent(
    RTVIEvent.MediaSupportUpdated,
    useCallback(
      (next: MediaSupport) => {
        setMediaSupport(next);
      },
      [setMediaSupport]
    )
  );

  return <>{children}</>;
};

/**
 * Whether each kind of media (mic, cam, screenShare, botAudio, botVideo) can
 * flow in the session, combining what the transport supports with the bot's
 * capabilities. Re-renders the consumer whenever it changes.
 *
 * `false` rules a kind of media out, so the matching UI can be hidden; a
 * missing or `undefined` value means it isn't ruled out, so the UI should be
 * shown.
 *
 * Safe to call from any component rendered inside PipecatClientProvider —
 * the subscription is owned by PipecatClientMediaSupportProvider, which is
 * mounted automatically.
 */
export const useMediaSupport = (): MediaSupport =>
  useAtomValue(mediaSupportAtom);
