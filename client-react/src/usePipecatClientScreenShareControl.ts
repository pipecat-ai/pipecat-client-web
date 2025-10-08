/**
 * Copyright (c) 2025, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useContext } from "react";

import { PipecatClientScreenShareStateContext } from "./PipecatClientState";

/**
 * Hook to control screen share state using React Context
 * This provides a simpler interface for basic screen share control
 * For more advanced state management with Jotai atoms, use usePipecatClientScreenShare
 */
export const usePipecatClientScreenShareControl = () =>
  useContext(PipecatClientScreenShareStateContext);
