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
import { useCallback, useEffect, useState } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

/**
 * Returns what the bot does in the session, from its `bot-ready` message.
 *
 * Undefined until the bot is ready, after disconnecting, and for bots that
 * don't send capabilities (RTVI protocol older than 2.2.0). Within the object,
 * a missing field means the bot can't tell, so keep the default UI for it.
 */
export const useBotCapabilities = (): BotCapabilities | undefined => {
  const client = usePipecatClient();
  const [capabilities, setCapabilities] = useState<BotCapabilities | undefined>(
    () => client?.botCapabilities,
  );

  // A component can mount, or the provider can swap clients, after bot-ready.
  useEffect(() => {
    setCapabilities(client?.botCapabilities);
  }, [client]);

  useRTVIClientEvent(
    RTVIEvent.BotReady,
    useCallback((data: BotReadyData) => {
      setCapabilities(data.capabilities);
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useCallback(() => {
      setCapabilities(undefined);
    }, []),
  );

  return capabilities;
};
