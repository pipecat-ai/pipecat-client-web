/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  useUISnapshot,
  type UseUISnapshotOptions,
} from "./useUISnapshot";

/** @deprecated Use `UseUISnapshotOptions` instead. */
export type UseA11ySnapshotOptions = UseUISnapshotOptions;

/** @deprecated Use `useUISnapshot` instead. */
export const useA11ySnapshot = useUISnapshot;
