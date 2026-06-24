/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { DTMFButton } from "@pipecat-ai/client-js";
import { useCallback } from "react";

import { usePipecatClient } from "./usePipecatClient";

/**
 * Returns a `sendTone` callable that sends a single DTMF tone to the server.
 *
 * The returned function is a no-op until the Pipecat client is available
 * from the ambient `PipecatClientProvider`.
 */
export const useDTMF = () => {
  const client = usePipecatClient();
  const sendTone = useCallback(
    (button: DTMFButton) => {
      if (!client) return;
      client.sendDTMF(button);
    },
    [client],
  );
  return { sendTone };
};
