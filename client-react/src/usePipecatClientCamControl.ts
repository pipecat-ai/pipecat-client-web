import { useCallback, useEffect, useState } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { usePipecatClientTransportState } from "./usePipecatClientTransportState";

/**
 * Hook to control camera state
 */
export const usePipecatClientCamControl = () => {
  const client = usePipecatClient();

  const [isCamEnabled, setIsCamEnabled] = useState(
    client?.isCamEnabled ?? false
  );

  const transportState = usePipecatClientTransportState();

  // Sync component state with client state initially
  useEffect(() => {
    if (
      !client ||
      transportState !== "initialized" ||
      typeof client.isCamEnabled !== "boolean"
    )
      return;
    setIsCamEnabled(client.isCamEnabled);
  }, [client, transportState]);

  const enableCam = useCallback(
    (enabled: boolean) => {
      setIsCamEnabled(enabled);
      client?.enableCam?.(enabled);
    },
    [client]
  );

  return {
    enableCam,
    isCamEnabled,
  };
};
