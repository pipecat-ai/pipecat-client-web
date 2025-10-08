/**
 * Copyright (c) 2025, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import React, { useCallback, useEffect } from "react";

import { usePipecatClientScreenShareControl } from "./usePipecatClientScreenShareControl";

export interface PipecatClientScreenShareToggleProps {
  /**
   * Callback when screen share state changes
   */
  onScreenShareEnabledChanged?: (enabled: boolean) => void;

  /**
   * Optional prop to disable the screen share toggle.
   * When disabled, changes are not applied to the client.
   * @default false
   */
  disabled?: boolean;

  /**
   * Render prop that provides state and handlers to the children
   */
  children: (props: {
    disabled?: boolean;
    isScreenShareEnabled: boolean;
    onClick: () => void;
  }) => React.ReactNode;
}

/**
 * Headless component for controlling screen share state
 */
export const PipecatClientScreenShareToggle: React.FC<
  PipecatClientScreenShareToggleProps
> = ({ onScreenShareEnabledChanged, disabled = false, children }) => {
  const { enableScreenShare, isScreenShareEnabled } =
    usePipecatClientScreenShareControl();

  const handleToggleScreenShare = useCallback(() => {
    if (disabled) return;
    enableScreenShare(!isScreenShareEnabled);
  }, [disabled, enableScreenShare, isScreenShareEnabled]);

  useEffect(() => {
    onScreenShareEnabledChanged?.(isScreenShareEnabled);
  }, [isScreenShareEnabled, onScreenShareEnabledChanged]);

  return (
    <>
      {children({
        isScreenShareEnabled,
        onClick: handleToggleScreenShare,
        disabled,
      })}
    </>
  );
};

export default PipecatClientScreenShareToggle;
