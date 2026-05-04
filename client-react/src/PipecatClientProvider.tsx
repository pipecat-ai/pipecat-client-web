/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  PipecatClient,
  RTVIEvent,
  RTVIEventHandler,
  setAboutClient,
} from "@pipecat-ai/client-js";
import { createStore } from "jotai";
import { Provider as JotaiProvider } from "jotai/react";
import React, { createContext, useCallback, useEffect, useRef } from "react";

import {
  name as packageName,
  version as packageVersion,
} from "../package.json";
import { PipecatConversationProvider } from "./conversation/PipecatConversationProvider";
import { PipecatClientMediaStateProvider } from "./PipecatClientMediaState";
import { PipecatClientStateProvider } from "./PipecatClientState";
import { RTVIEventContext } from "./RTVIEventContext";

export interface Props {
  client: PipecatClient;
  jotaiStore?: React.ComponentProps<typeof JotaiProvider>["store"];
  /**
   * Call `client.initDevices()` automatically when the provider mounts, if
   * the client still needs init (i.e. no device has reached 'granted' yet).
   *
   * Defaults to `false` to preserve the safe behavior of not requesting
   * device permissions before the user takes a deliberate action. Apps that
   * already gathered consent (e.g. via signup flow, or a "join" button that
   * itself triggers initDevices) can opt in by setting this to `true`.
   */
  autoInitDevices?: boolean;
}

const defaultStore = createStore();

export const PipecatClientContext = createContext<{ client?: PipecatClient }>(
  {}
);

type EventHandlersMap = {
  [E in RTVIEvent]?: Set<RTVIEventHandler<E>>;
};

export const PipecatClientProvider: React.FC<
  React.PropsWithChildren<Props>
> = ({ children, client, jotaiStore = defaultStore, autoInitDevices = false }) => {
  useEffect(() => {
    setAboutClient({
      library: packageName,
      library_version: packageVersion,
    });
  }, []);

  // Opt-in auto-init. Skip if the client has already initialized — covers
  // hot-reload and provider remounts. Errors propagate via the client's
  // own DeviceError event / MediaState classifier; we don't surface them
  // here.
  useEffect(() => {
    if (!autoInitDevices || !client) return;
    if (!client.needsInit()) return;
    void client.initDevices().catch(() => {
      // Intentionally swallowed — consumers observe failures via
      // RTVIEvent.DeviceError, RTVIEvent.MediaStateUpdated, or the client's
      // mediaState getter.
    });
  }, [autoInitDevices, client]);

  const eventHandlersMap = useRef<EventHandlersMap>({});

  useEffect(() => {
    if (!client) return;

    const allEvents = Object.values(RTVIEvent).filter((value) =>
      isNaN(Number(value))
    ) as RTVIEvent[];

    const allHandlers: Partial<
      Record<
        RTVIEvent,
        (
          ...args: Parameters<Exclude<RTVIEventHandler<RTVIEvent>, undefined>>
        ) => void
      >
    > = {};

    allEvents.forEach((event) => {
      type E = typeof event;
      type Handler = Exclude<RTVIEventHandler<E>, undefined>; // Remove undefined
      type Payload = Parameters<Handler>; // Will always be a tuple

      const handler = (...payload: Payload) => {
        const handlers = eventHandlersMap.current[event] as
          | Set<Handler>
          | undefined;
        if (!handlers) return;
        handlers.forEach((h) => {
          (
            h as (
              ...args: Parameters<Exclude<RTVIEventHandler<E>, undefined>>
            ) => void
          )(...payload);
        });
      };

      allHandlers[event] = handler;

      client.on(event, handler);
    });

    return () => {
      allEvents.forEach((event) => {
        client.off(event, allHandlers[event]);
      });
    };
  }, [client]);

  const on = useCallback(
    <E extends RTVIEvent>(event: E, handler: RTVIEventHandler<E>) => {
      if (!eventHandlersMap.current[event]) {
        eventHandlersMap.current[event] = new Set();
      }
      eventHandlersMap.current[event]!.add(handler);
    },
    []
  );

  const off = useCallback(
    <E extends RTVIEvent>(event: E, handler: RTVIEventHandler<E>) => {
      eventHandlersMap.current[event]?.delete(handler);
    },
    []
  );

  return (
    <JotaiProvider store={jotaiStore}>
      <PipecatClientContext.Provider value={{ client }}>
        <RTVIEventContext.Provider value={{ on, off }}>
          <PipecatClientStateProvider>
            <PipecatClientMediaStateProvider>
              <PipecatConversationProvider>
                {children}
              </PipecatConversationProvider>
            </PipecatClientMediaStateProvider>
          </PipecatClientStateProvider>
        </RTVIEventContext.Provider>
      </PipecatClientContext.Provider>
    </JotaiProvider>
  );
};
PipecatClientProvider.displayName = "PipecatClientProvider";
