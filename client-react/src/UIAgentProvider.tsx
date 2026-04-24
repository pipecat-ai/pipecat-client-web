/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  type PipecatClient,
  UIAgentClient,
} from "@pipecat-ai/client-js";
import React, { useEffect, useMemo } from "react";

import { UIAgentContext } from "./UIAgentContext";
import { usePipecatClient } from "./usePipecatClient";

interface UIAgentProviderProps {
  /**
   * The Pipecat client to bind the UI agent to.
   *
   * When omitted, the provider reads the client from the ambient
   * `PipecatClientProvider` via `usePipecatClient`. When set, the prop
   * takes precedence and the context is ignored.
   *
   * Pass this explicitly when the host provides the client via a
   * render prop (for example, `PipecatAppBase` from
   * `@pipecat-ai/voice-ui-kit`) so the UI agent binds to the exact
   * same client instance without relying on React-context identity,
   * which can break under bundler dep-optimization that creates a
   * second copy of `PipecatClientContext`.
   */
  client?: PipecatClient;
}

/**
 * Wraps its children with a `UIAgentClient` bound to a Pipecat client.
 *
 * The client subscribes to the Pipecat client's `RTVIEvent.ServerMessage`
 * stream to dispatch UI commands. On unmount (or when the underlying
 * Pipecat client changes), the subscription is torn down via the detach
 * function returned from `client.attach()`.
 */
export const UIAgentProvider: React.FC<
  React.PropsWithChildren<UIAgentProviderProps>
> = ({ client: clientProp, children }) => {
  const contextClient = usePipecatClient();
  const pipecatClient = clientProp ?? contextClient;

  const client = useMemo(
    () => (pipecatClient ? new UIAgentClient(pipecatClient) : undefined),
    [pipecatClient],
  );

  useEffect(() => {
    if (!client) return;
    // `client.attach()` subscribes to RTVIEvent.ServerMessage and
    // returns a detach function. Returning it here as the effect
    // cleanup means subscription lifecycle follows React mount/unmount,
    // including `StrictMode`'s double-invoke in development.
    return client.attach();
  }, [client]);

  return (
    <UIAgentContext.Provider value={{ client }}>
      {children}
    </UIAgentContext.Provider>
  );
};
UIAgentProvider.displayName = "UIAgentProvider";
