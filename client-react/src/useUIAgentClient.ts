/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useContext } from "react";

import { UIAgentContext } from "./UIAgentContext";

/**
 * Returns the `UIAgentClient` from the ambient `UIAgentProvider`,
 * or `undefined` if the provider is not mounted or the Pipecat client
 * has not been initialized yet.
 */
export const useUIAgentClient = () => {
  const { client } = useContext(UIAgentContext);
  return client;
};
