/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { createContext } from "react";

import type { TaskGroup, UITasksAPI } from "./uiTasksTypes";

const NO_OP_API: UITasksAPI = {
  groups: [] as TaskGroup[],
  cancelTask: () => {},
};

/**
 * Context populated by `UITasksProvider`.
 *
 * When the provider isn't mounted, the default value is a stable
 * empty-state object so consumers can render without conditional
 * checks.
 */
export const UITasksContext = createContext<UITasksAPI>(NO_OP_API);
