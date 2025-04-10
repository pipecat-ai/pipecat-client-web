import React, { useState, useCallback, useEffect } from "react";
import { useRTVIClient } from "./useRTVIClient";

export interface RTVIClientCamToggleProps {
  /**
   * Callback fired when camera state changes
   */
  onCamEnabledChanged?: (enabled: boolean) => void;

  /**
   * Optional prop to disable the cam toggle.
   * When disabled, changes are not applied to the client.
   * @default false
   */
  disabled?: boolean;

  /**
   * Render prop that provides state and handlers to the children
   */
  children: (props: {
    disabled?: boolean;
    isCamEnabled: boolean;
    onClick: () => void;
  }) => React.ReactNode;
}

/**
 * Headless component for controlling camera state
 */
export const RTVIClientCamToggle: React.FC<RTVIClientCamToggleProps> = ({
  onCamEnabledChanged,
  disabled = false,
  children,
}) => {
  const client = useRTVIClient();

  const [isCamEnabled, setIsCamEnabled] = useState(
    client?.isCamEnabled ?? false
  );

  // Sync component state with client state initially
  useEffect(() => {
    if (!client) return;
    setIsCamEnabled(client.isCamEnabled);
  }, [client]);

  const handleToggleCam = useCallback(() => {
    if (disabled) return;

    const newEnabledState = !isCamEnabled;
    setIsCamEnabled(newEnabledState);

    if (client) {
      client.enableCam(newEnabledState);
    }

    if (onCamEnabledChanged) {
      onCamEnabledChanged(newEnabledState);
    }
  }, [client, disabled, isCamEnabled, onCamEnabledChanged]);

  return (
    <>
      {children({
        isCamEnabled,
        onClick: handleToggleCam,
        disabled,
      })}
    </>
  );
};

export default RTVIClientCamToggle;
