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
import { PipecatClientParticipantManager } from "./PipecatClientParticipantManager";
import { PipecatClientStateProvider } from "./PipecatClientState";
import { RTVIEventContext } from "./RTVIEventContext";

export interface Props {
  client: PipecatClient;
  jotaiStore?: React.ComponentProps<typeof JotaiProvider>["store"];
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
> = ({ children, client, jotaiStore = defaultStore }) => {
  useEffect(() => {
    setAboutClient({
      library: packageName,
      library_version: packageVersion,
    });
  }, []);

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
            {children}
            <PipecatClientParticipantManager />
          </PipecatClientStateProvider>
        </RTVIEventContext.Provider>
      </PipecatClientContext.Provider>
    </JotaiProvider>
  );
};
PipecatClientProvider.displayName = "PipecatClientProvider";
