/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  A11ySnapshotStreamer,
  type A11ySnapshotStreamerOptions,
} from "@pipecat-ai/client-js";
import { useEffect } from "react";

import { useUIAgentClient } from "./useUIAgentClient";

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
 * send it to the server as a reserved UI event
 * (``__ui_snapshot``). The server-side ``UIAgent`` stores the latest
 * snapshot and, on demand, renders it into the LLM's context as
 * ``<ui_state>`` so the agent can reason about what's on screen.
 *
 * Usage: call once near the root of your app, inside a
 * ``UIAgentProvider``.
 *
 * ```tsx
 * function App() {
 *   useA11ySnapshot();
 *   return <...>;
 * }
 * ```
 *
 * This hook is a thin lifecycle wrapper around the framework-agnostic
 * ``A11ySnapshotStreamer`` in ``@pipecat-ai/client-js``. Non-React
 * apps can instantiate the streamer directly; the behaviour and
 * options are identical.
 *
 * Behaviour:
 *
 * - Emits an initial snapshot shortly after mount.
 * - Re-emits on DOM mutations, ARIA attribute changes, focus
 *   changes, scroll-end, window resize, and tab visibility change,
 *   coalesced by ``debounceMs``.
 * - No-op until a ``UIAgentClient`` is available from the ambient
 *   ``UIAgentProvider`` (or the provider's Pipecat client is unset).
 */
export function useA11ySnapshot(options: UseA11ySnapshotOptions = {}): void {
  const {
    enabled = true,
    debounceMs = 300,
    trackViewport = true,
    logSnapshots = false,
  } = options;
  const client = useUIAgentClient();

  useEffect(() => {
    if (!enabled || !client) return;
    const streamer = new A11ySnapshotStreamer(client, {
      debounceMs,
      trackViewport,
      logSnapshots,
    });
    streamer.start();
    return () => streamer.stop();
  }, [enabled, client, debounceMs, trackViewport, logSnapshots]);
}
