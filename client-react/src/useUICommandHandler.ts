/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { UICommandHandler } from "@pipecat-ai/client-js";
import { useEffect } from "react";

import { useUIAgentClient } from "./useUIAgentClient";

/**
 * Register a handler for a named UI command.
 *
 * The handler is registered on mount and unregistered on unmount. If
 * the handler reference changes between renders, the registration is
 * refreshed. Pass a stable reference (via `useCallback`) to avoid
 * per-render churn.
 *
 * @param name - App-defined command name, matching what the server
 *     emits via `UIAgent.send_command`.
 * @param handler - Callback invoked with the command payload.
 */
export const useUICommandHandler = <T = unknown>(
  name: string,
  handler: UICommandHandler<T>,
): void => {
  const client = useUIAgentClient();
  useEffect(() => {
    if (!client) return;
    client.registerCommandHandler(name, handler);
    return () => {
      client.unregisterCommandHandler(name);
    };
  }, [client, name, handler]);
};
