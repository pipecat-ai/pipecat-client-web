import React, { useState, useCallback, useEffect } from "react";
import { useRTVIClient } from "./useRTVIClient";

export interface RTVIClientMicToggleProps {
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
export const RTVIClientMicToggle: React.FC<RTVIClientMicToggleProps> = ({
  onMicEnabledChanged,
  disabled = false,
  children,
}) => {
  const client = useRTVIClient();

  const [isMicEnabled, setIsMicEnabled] = useState(
    client?.isMicEnabled ?? false
  );

  // Sync component state with client state initially
  useEffect(() => {
    if (!client) return;
    setIsMicEnabled(client.isMicEnabled);
  }, [client]);

  const handleToggleMic = useCallback(() => {
    if (disabled) return;

    const newEnabledState = !isMicEnabled;
    setIsMicEnabled(newEnabledState);

    if (client) {
      client.enableMic(newEnabledState);
    }

    if (onMicEnabledChanged) {
      onMicEnabledChanged(newEnabledState);
    }
  }, [client, disabled, isMicEnabled, onMicEnabledChanged]);

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

export default RTVIClientMicToggle;
