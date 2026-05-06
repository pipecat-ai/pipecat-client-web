/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useCallback } from "react";

import { useUIAgentClient } from "./useUIAgentClient";

/**
 * Returns a callable that sends a named UI event to the server.
 *
 * The returned function is a no-op until the Pipecat client is available
 * from the ambient `PipecatClientProvider`.
 */
export const useUIEventSender = () => {
  const client = useUIAgentClient();
  return useCallback(
    <T = unknown>(event: string, payload?: T) => {
      if (!client) return;
      client.sendEvent(event, payload);
    },
    [client],
  );
};
