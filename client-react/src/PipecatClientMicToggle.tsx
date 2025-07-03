import React, { useCallback } from "react";

import { usePipecatClientMicControl } from "./usePipecatClientMicControl";

export interface PipecatClientMicToggleProps {
  /**
   * Callback fired when microphone state changes
   */
  onMicEnabledChanged?: (enabled: boolean) => void;

  /**
   * Optional prop to disable the mic toggle.
   * When disabled, changes are not applied to the client.
   * @default false
   */
  disabled?: boolean;

  /**
   * Render prop that provides state and handlers to the children
   */
  children: (props: {
    disabled?: boolean;
    isMicEnabled: boolean;
    onClick: () => void;
  }) => React.ReactNode;
}

/**
 * Headless component for controlling microphone state
 */
export const PipecatClientMicToggle: React.FC<PipecatClientMicToggleProps> = ({
  onMicEnabledChanged,
  disabled = false,
  children,
}) => {
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();

  const handleToggleMic = useCallback(() => {
    if (disabled) return;

    const newEnabledState = !isMicEnabled;
    enableMic(newEnabledState);
    onMicEnabledChanged?.(newEnabledState);
  }, [disabled, enableMic, isMicEnabled, onMicEnabledChanged]);

  return (
    <>
      {children({
        isMicEnabled,
        onClick: handleToggleMic,
        disabled,
      })}
    </>
  );
};

export default PipecatClientMicToggle;
