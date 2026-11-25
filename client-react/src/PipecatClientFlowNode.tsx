/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */
import { type FlowNodeEnteredData, RTVIEvent } from "@pipecat-ai/client-js";
import { atom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import React, { useCallback, useEffect } from "react";

import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

/**
 * Module-scoped jotai atom holding the node the bot's conversation flow is
 * in. Owned by PipecatClientFlowNodeProvider, which seeds it from
 * `client.flowNode` and follows RTVIEvent.FlowNodeEntered and
 * RTVIEvent.Disconnected. usePipecatFlowNode only reads.
 */
const flowNodeAtom = atom<FlowNodeEnteredData | null>(null);

/**
 * Provider that mirrors the underlying PipecatClient's flow node into the
 * shared jotai atom. Rendered automatically by PipecatClientProvider; not
 * exported, so apps don't need to wire it up themselves.
 */
export const PipecatClientFlowNodeProvider: React.FC<
  React.PropsWithChildren
> = ({ children }) => {
  const client = usePipecatClient();

  const setFlowNode = useAtomCallback(
    useCallback((_get, set, node: FlowNodeEnteredData | null) => {
      set(flowNodeAtom, node);
    }, [])
  );

  // Seed from the current client, so consumers that mount after the flow
  // entered a node, or after the client is swapped, see the current value.
  useEffect(() => {
    setFlowNode(client?.flowNode ?? null);
  }, [client, setFlowNode]);

  useRTVIClientEvent(RTVIEvent.FlowNodeEntered, setFlowNode);

  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useCallback(() => {
      setFlowNode(null);
    }, [setFlowNode])
  );

  return <>{children}</>;
};

/**
 * Returns the node the bot's conversation flow, built with Pipecat Flows, is
 * in (RTVI 2.4.0+): the data of its latest `flow-node-entered` message, with
 * the node's name, the node the flow left, the function that moved it there,
 * their metadata and, for a node of a subflow, the node that runs the
 * subflow.
 *
 * Null until the flow enters its first node, after disconnecting, and for
 * bots that don't run a flow.
 *
 * Safe to call from any component rendered inside PipecatClientProvider —
 * the subscription is owned by PipecatClientFlowNodeProvider, which is
 * mounted automatically.
 */
export const usePipecatFlowNode = (): FlowNodeEnteredData | null =>
  useAtomValue(flowNodeAtom);
