/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */
import { useContext } from "react";

import { RTVICamStateContext } from "./RTVIClientState";

/**
 * Hook to control camera state
 */
export const useRTVIClientCamControl = () => useContext(RTVICamStateContext);
