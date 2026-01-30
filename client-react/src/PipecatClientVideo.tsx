/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import React, { forwardRef, useEffect, useRef } from "react";

import useMergedRef from "./useMergedRef";
import { usePipecatClientMediaTrack } from "./usePipecatClientMediaTrack";

interface PipecatClientVideoInterface {
  aspectRatio: number;
  height: number;
  width: number;
}

export interface Props extends Omit<
  React.VideoHTMLAttributes<HTMLVideoElement>,
  "onResize"
> {
  participant: "local" | "bot";

  /**
   * Defines the video track type to display. Default: 'video'.
   */
  trackType?: "screenVideo" | "video";

  /**
   * Defines whether the video should be fully contained or cover the box. Default: 'contain'.
   */
  fit?: "contain" | "cover";
  /**
   * Forces the video to be mirrored, if set.
   */
  mirror?: boolean;

  /**
   * Optional callback, which is triggered whenever the video's rendered width or height changes.
   * Returns the video's native width, height and aspectRatio.
   */
  onResize?(dimensions: PipecatClientVideoInterface): void;
}

export const PipecatClientVideo = forwardRef<HTMLVideoElement, Props>(
  function VoiceClientVideo(
    {
      participant = "local",
      fit = "contain",
      mirror,
      onResize,
      style = {},
      trackType = "video",
      ...props
    },
    ref
  ) {
    const videoTrack: MediaStreamTrack | null = usePipecatClientMediaTrack(
      trackType,
      participant
    );

    const videoEl = useRef<HTMLVideoElement>(null);
    const videoRef = useMergedRef<HTMLVideoElement>(videoEl, ref);

    /**
     * Handle canplay & picture-in-picture events.
     */
    useEffect(function setupVideoEvents() {
      const video = videoEl.current;
      if (!video) return;

      const playVideo = () => {
        const promise = video.play();
        if (promise !== undefined) {
          promise
            .then(() => {
              // All good, playback started.
              video.controls = false;
            })
            .catch((error) => {
              // Auto-play was prevented. Show video controls, so user can play video manually.
              video.controls = true;
              console.warn("Failed to play video", error);
            });
        }
      };

      const handleCanPlay = () => {
        if (!video.paused) return;
        playVideo();
      };
      const handleEnterPIP = () => {
        video.style.transform = "scale(1)";
      };
      const handleLeavePIP = () => {
        video.style.transform = "";
        setTimeout(() => {
          if (video.paused) playVideo();
        }, 100);
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") return;
        if (!video.paused) return;
        playVideo();
      };
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("enterpictureinpicture", handleEnterPIP);
      video.addEventListener("leavepictureinpicture", handleLeavePIP);

      // Videos can be paused if media was played in another app on iOS.
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("enterpictureinpicture", handleEnterPIP);
        video.removeEventListener("leavepictureinpicture", handleLeavePIP);
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      };
    }, []);

    /**
     * Update srcObject.
     */
    useEffect(
      function updateSrcObject() {
        const video = videoEl.current;
        if (!video || !videoTrack) return;
        video.srcObject = new MediaStream([videoTrack]);
        video.load();
        return () => {
          // clean up when unmounted
          video.srcObject = null;
          video.load();
        };
      },
      [videoTrack, videoTrack?.id]
    );

    /**
     * Add optional event listener for resize event so the parent component
     * can know the video's native aspect ratio.
     */
    useEffect(
      function reportVideoDimensions() {
        const video = videoEl.current;
        if (!onResize || !video) return;

        let frame: ReturnType<typeof requestAnimationFrame>;
        function handleResize() {
          if (frame) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const video = videoEl.current;
            if (!video || document.hidden) return;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;
            if (videoWidth && videoHeight) {
              onResize?.({
                aspectRatio: videoWidth / videoHeight,
                height: videoHeight,
                width: videoWidth,
              });
            }
          });
        }

        handleResize();
        video.addEventListener("loadedmetadata", handleResize);
        video.addEventListener("resize", handleResize);

        return () => {
          if (frame) cancelAnimationFrame(frame);
          video.removeEventListener("loadedmetadata", handleResize);
          video.removeEventListener("resize", handleResize);
        };
      },
      [onResize]
    );

    return (
      <video
        autoPlay
        muted
        playsInline
        ref={videoRef}
        style={{
          objectFit: fit,
          transform: mirror ? "scale(-1, 1)" : "",
          ...style,
        }}
        {...props}
      />
    );
  }
);
PipecatClientVideo.displayName = "PipecatClientVideo";
