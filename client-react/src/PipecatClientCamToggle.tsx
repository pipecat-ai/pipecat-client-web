import React, { useCallback } from "react";

import { usePipecatClientCamControl } from "./usePipecatClientCamControl";

export interface PipecatClientCamToggleProps {
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
export const PipecatClientCamToggle: React.FC<PipecatClientCamToggleProps> = ({
  onCamEnabledChanged,
  disabled = false,
  children,
}) => {
  const { isCamEnabled, enableCam } = usePipecatClientCamControl();

  const handleToggleCam = useCallback(() => {
    if (disabled) return;

    const newEnabledState = !isCamEnabled;
    enableCam(newEnabledState);
    onCamEnabledChanged?.(newEnabledState);
  }, [disabled, enableCam, isCamEnabled, onCamEnabledChanged]);

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

export default PipecatClientCamToggle;
