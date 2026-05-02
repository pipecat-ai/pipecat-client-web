/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useContext } from "react";

import { UITasksContext } from "./UITasksContext";
import type { UITasksAPI } from "./uiTasksTypes";

/**
 * Read the current task groups and the cancel callback from the
 * ambient `UITasksProvider`.
 *
 * When no provider is mounted, returns a stable empty-state object
 * (`groups: []`, `cancelTask` is a no-op). This keeps app code free
 * of conditional checks for the common rendering case.
 *
 * Returns groups in arrival order (oldest first); reverse in your
 * render path if you want newest-first.
 */
export const useUITasks = (): UITasksAPI => {
  return useContext(UITasksContext);
};
