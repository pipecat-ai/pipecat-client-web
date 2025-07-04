/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useContext } from "react";

import { RTVIMicStateContext } from "./RTVIClientState";

/**
 * Hook to control microphone state
 */
export const useRTVIClientMicControl = () => useContext(RTVIMicStateContext);
