/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { A11ySnapshotStreamerOptions } from "@pipecat-ai/client-js";
import { useEffect } from "react";

import { usePipecatClient } from "./usePipecatClient";

/** Options for ``useA11ySnapshot``. */
export interface UseA11ySnapshotOptions extends A11ySnapshotStreamerOptions {
  /**
   * Whether the hook is active. Set to ``false`` to stop emitting
   * snapshots without unmounting the component.
   *
   * @default true
   */
  enabled?: boolean;
}

/**
 * Capture a structured accessibility snapshot of the document and
 * send it to the server as a first-class ``ui-snapshot`` RTVI
 * message. The server-side ``UIAgent`` stores the latest
 * snapshot and, on demand, renders it into the LLM's context as
 * ``<ui_state>`` so the agent can reason about what's on screen.
 *
 * Usage: call once near the root of your app, inside a
 * ``PipecatClientProvider``.
 *
 * ```tsx
 * function App() {
 *   useA11ySnapshot();
 *   return <...>;
 * }
 * ```
 *
 * This hook is a thin lifecycle wrapper around
 * ``PipecatClient.startA11ySnapshotStream``.
 *
 * Behaviour:
 *
 * - Emits an initial snapshot shortly after mount.
 * - Re-emits on DOM mutations, ARIA attribute changes, focus
 *   changes, scroll-end, window resize, and tab visibility change,
 *   coalesced by ``debounceMs``.
 * - No-op until a ``PipecatClient`` is available from the ambient
 *   ``PipecatClientProvider``.
 */
export function useA11ySnapshot(options: UseA11ySnapshotOptions = {}): void {
  const {
    enabled = true,
    debounceMs = 300,
    trackViewport = true,
    logSnapshots = false,
  } = options;
  const client = usePipecatClient();

  useEffect(() => {
    if (!enabled || !client) return;
    client.startA11ySnapshotStream({
      debounceMs,
      trackViewport,
      logSnapshots,
    });
    return () => client.stopA11ySnapshotStream();
  }, [enabled, client, debounceMs, trackViewport, logSnapshots]);
}
