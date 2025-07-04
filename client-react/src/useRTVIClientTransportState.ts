/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useContext } from "react";

import { RTVITransportStateContext } from "./RTVIClientState";

export const useRTVIClientTransportState = () =>
  useContext(RTVITransportStateContext);
