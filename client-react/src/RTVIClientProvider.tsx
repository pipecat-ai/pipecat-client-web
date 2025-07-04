/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIClient, RTVIEvent, RTVIEventHandler } from "@pipecat-ai/client-js";
import { createStore } from "jotai";
import { Provider as JotaiProvider } from "jotai/react";
import React, { createContext, useCallback, useEffect, useRef } from "react";

import { RTVIClientStateProvider } from "./RTVIClientState";
import { RTVIEventContext } from "./RTVIEventContext";

export interface Props {
  client: RTVIClient;
  jotaiStore?: React.ComponentProps<typeof JotaiProvider>["store"];
}

const defaultStore = createStore();

export const RTVIClientContext = createContext<{ client?: RTVIClient }>({});

type EventHandlersMap = {
  [E in RTVIEvent]?: Set<RTVIEventHandler<E>>;
};

export const RTVIClientProvider: React.FC<React.PropsWithChildren<Props>> = ({
  children,
  client,
  jotaiStore = defaultStore,
}) => {
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
      <RTVIClientContext.Provider value={{ client }}>
        <RTVIEventContext.Provider value={{ on, off }}>
          <RTVIClientStateProvider>{children}</RTVIClientStateProvider>
        </RTVIEventContext.Provider>
      </RTVIClientContext.Provider>
    </JotaiProvider>
  );
};
RTVIClientProvider.displayName = "RTVIClientProvider";
