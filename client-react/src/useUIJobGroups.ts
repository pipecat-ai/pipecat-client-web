/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { useContext } from "react";

import { UIJobGroupsContext } from "./UIJobGroupsContext";
import type { UIJobGroupsAPI } from "./uiJobGroupsTypes";

/**
 * Read the current job groups and the cancel callback from the
 * ambient `UIJobGroupsProvider`.
 *
 * When no provider is mounted, returns a stable empty-state object
 * (`groups: []`, `cancelJobGroup` is a no-op). This keeps app code free
 * of conditional checks for the common rendering case.
 *
 * Returns groups in arrival order (oldest first); reverse in your
 * render path if you want newest-first.
 */
export const useUIJobGroups = (): UIJobGroupsAPI => {
  return useContext(UIJobGroupsContext);
};
