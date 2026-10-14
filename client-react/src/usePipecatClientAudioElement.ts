/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent } from "@pipecat-ai/client-js";
import { RefObject, useCallback, useEffect, useRef } from "react";

import { usePipecatClientMediaTrack } from "./usePipecatClientMediaTrack";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

// Trusted events that grant user activation, per the HTML spec. Listened to
// on document so the unlock works regardless of where the user interacts.
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"] as const;

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Binds an `<audio>` element to the bot's audio track and keeps it audible
 * across browser autoplay restrictions. Attach the returned ref to an
 * `<audio autoPlay>` element rendered by the same component:
 *
 * ```tsx
 * const ref = usePipecatClientAudioElement();
 * return <audio ref={ref} autoPlay />;
 * ```
 *
 * The hook:
 * - attaches the bot's audio track to the element (deduped by track id, so an
 *   already-playing stream is not torn down)
 * - routes output to the selected speaker via `setSinkId` on `SpeakerUpdated`
 * - starts playback explicitly instead of relying only on the `autoPlay`
 *   attribute. Since iOS/Safari 27, a hidden `<audio>` whose MediaStream is
 *   attached after the user-gesture window is no longer autoplayed.
 * - unlocks the element on the first user interaction: iOS Safari may refuse
 *   even an explicit `play()` outside a user gesture unless the element was
 *   previously played from one, so `play()` is also called synchronously from
 *   the first trusted gesture on the page. With no source attached this makes
 *   no sound, and on an already-playing element it is a no-op.
 *
 * `PipecatClientAudio` is a thin wrapper around this hook; use the hook
 * directly when rendering your own `<audio>` element (e.g. to control
 * volume).
 */
export const usePipecatClientAudioElement =
  (): RefObject<HTMLAudioElement> => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const botAudioTrack = usePipecatClientMediaTrack("audio", "bot");

    const play = useCallback(() => {
      audioRef.current?.play().catch((err: unknown) => {
        // AbortError means the source changed while play() was pending (e.g.
        // the track was swapped), not a real failure.
        if (isAbortError(err)) return;
        console.warn("Failed to play bot audio", err);
      });
    }, []);

    useEffect(() => {
      const el = audioRef.current;
      if (!el || !botAudioTrack) return;
      const existing = el.srcObject as MediaStream | null;
      if (existing) {
        const oldTrack = existing.getAudioTracks()[0];
        if (oldTrack && oldTrack.id === botAudioTrack.id) return;
      }
      el.srcObject = new MediaStream([botAudioTrack]);
      play();
    }, [botAudioTrack, play]);

    // Covers the element not being playable yet when the track is attached.
    useEffect(() => {
      const el = audioRef.current;
      if (!el) return;
      el.addEventListener("canplay", play);
      return () => {
        el.removeEventListener("canplay", play);
      };
    }, [play]);

    useEffect(() => {
      const removeListeners = () => {
        UNLOCK_EVENTS.forEach((ev) => {
          document.removeEventListener(ev, unlock, true);
        });
      };
      const unlock = () => {
        const el = audioRef.current;
        if (!el) return;
        removeListeners();
        // May stay pending until a source is attached, or reject when the
        // pending call is aborted by the source attaching; both are fine —
        // the element is unlocked either way.
        el.play().catch(() => undefined);
      };
      UNLOCK_EVENTS.forEach((ev) => {
        document.addEventListener(ev, unlock, true);
      });
      return removeListeners;
    }, []);

    useRTVIClientEvent(
      RTVIEvent.SpeakerUpdated,
      useCallback((speaker: MediaDeviceInfo) => {
        const el = audioRef.current;
        if (!el) return;
        if (typeof el.setSinkId !== "function") return;
        el.setSinkId(speaker.deviceId).catch((err: unknown) => {
          console.warn("Failed to set audio output device", err);
        });
      }, [])
    );

    return audioRef;
  };
