/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { UIAgentClient } from "@pipecat-ai/client-js";
import { createContext } from "react";

export const UIAgentContext = createContext<{ client?: UIAgentClient }>({});
