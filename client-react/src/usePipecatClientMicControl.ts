import { useCallback, useEffect, useState } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { usePipecatClientTransportState } from "./usePipecatClientTransportState";

/**
 * Hook to control microphone state
 */
export const usePipecatClientMicControl = () => {
  const client = usePipecatClient();

  const [isMicEnabled, setIsMicEnabled] = useState(
    client?.isMicEnabled ?? false
  );

  const transportState = usePipecatClientTransportState();

  // Sync component state with client state initially
  useEffect(() => {
    if (
      !client ||
      transportState !== "initialized" ||
      typeof client.isMicEnabled !== "boolean"
    )
      return;
    setIsMicEnabled(client.isMicEnabled);
  }, [client, transportState]);

  const enableMic = useCallback(
    (enabled: boolean) => {
      setIsMicEnabled(enabled);
      client?.enableMic?.(enabled);
    },
    [client]
  );

  return {
    enableMic,
    isMicEnabled,
  };
};
