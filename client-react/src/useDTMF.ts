/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { DTMFButton } from "@pipecat-ai/client-js";
import { useCallback } from "react";

import { usePipecatClient } from "./usePipecatClient";

/**
 * Returns a `sendTone` callable that sends DTMF tones to the server.
 * Accepts a single key or a sequence of keys (e.g. "123#").
 *
 * The returned function is a no-op until the Pipecat client is available
 * from the ambient `PipecatClientProvider`.
 */
export const useDTMF = () => {
  const client = usePipecatClient();
  const sendTone = useCallback(
    (dtmf: DTMFButton | string) => {
      if (!client) return;
      client.sendDTMF(dtmf);
    },
    [client],
  );
  return { sendTone };
};
