/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { createContext } from "react";

import type { UIJobGroupsAPI } from "./uiJobGroupsTypes";

const NO_OP_API: UIJobGroupsAPI = {
  groups: [],
  cancelJobGroup: () => {},
  dismissJobGroup: () => {},
  clearCompleted: () => {},
};

/**
 * Context populated by `UIJobGroupsProvider`.
 *
 * When the provider isn't mounted, the default value is a stable
 * empty-state object so consumers can render without conditional
 * checks.
 */
export const UIJobGroupsContext = createContext<UIJobGroupsAPI>(NO_OP_API);
