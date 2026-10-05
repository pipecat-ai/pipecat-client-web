/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */
import {
  type BotCapabilities,
  type BotReadyData,
  RTVIEvent,
} from "@pipecat-ai/client-js";
import { atom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import React, { useCallback, useEffect } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

/**
 * Module-scoped jotai atom holding the bot's capabilities. Owned by
 * PipecatClientBotCapabilitiesProvider, which seeds it from
 * `client.botCapabilities` and follows RTVIEvent.BotReady and
 * RTVIEvent.Disconnected. useBotCapabilities only reads.
 */
const botCapabilitiesAtom = atom<BotCapabilities | undefined>(undefined);

/**
 * Provider that mirrors the underlying PipecatClient's bot capabilities into
 * the shared jotai atom. Rendered automatically by PipecatClientProvider; not
 * exported, so apps don't need to wire it up themselves.
 */
export const PipecatClientBotCapabilitiesProvider: React.FC<
  React.PropsWithChildren
> = ({ children }) => {
  const client = usePipecatClient();

  const setBotCapabilities = useAtomCallback(
    useCallback((_get, set, capabilities: BotCapabilities | undefined) => {
      set(botCapabilitiesAtom, capabilities);
    }, [])
  );

  // Seed from the current client, so consumers that mount after bot-ready, or
  // after the client is swapped, see the current value.
  useEffect(() => {
    setBotCapabilities(client?.botCapabilities);
  }, [client, setBotCapabilities]);

  useRTVIClientEvent(
    RTVIEvent.BotReady,
    useCallback(
      (data: BotReadyData) => {
        setBotCapabilities(data.capabilities);
      },
      [setBotCapabilities]
    )
  );

  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useCallback(() => {
      setBotCapabilities(undefined);
    }, [setBotCapabilities])
  );

  return <>{children}</>;
};

/**
 * Returns what the bot does in the session, from its `bot-ready` message.
 *
 * Undefined until the bot is ready, after disconnecting, and for bots that
 * don't send capabilities (RTVI protocol older than 2.2.0). Within the object,
 * a missing field means the bot can't tell, so keep the default UI for it.
 *
 * Safe to call from any component rendered inside PipecatClientProvider —
 * the subscription is owned by PipecatClientBotCapabilitiesProvider, which is
 * mounted automatically.
 */
export const useBotCapabilities = (): BotCapabilities | undefined =>
  useAtomValue(botCapabilitiesAtom);
