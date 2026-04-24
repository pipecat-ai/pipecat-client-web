/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { A11yNode } from "@pipecat-ai/client-js";
import { UI_SNAPSHOT_EVENT_NAME } from "@pipecat-ai/client-js";
import { useEffect } from "react";

import { snapshotDocument } from "./a11ySnapshotWalker";
import { useUIAgentClient } from "./useUIAgentClient";

function countNodes(node: A11yNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) count += countNodes(child);
  }
  return count;
}

/** Options for ``useA11ySnapshot``. */
export interface UseA11ySnapshotOptions {
  /**
   * Whether the hook is active. Set to ``false`` to stop emitting
   * snapshots without unmounting the component.
   *
   * @default true
   */
  enabled?: boolean;
  /**
   * Minimum interval between snapshot emissions in milliseconds.
   * Multiple mutations within this window coalesce into one snapshot.
   *
   * @default 300
   */
  debounceMs?: number;
  /**
   * Annotate each emitted node with ``"offscreen"`` in its state list
   * when its bounding rect sits entirely outside the viewport. Lets
   * the server distinguish "on the page" from "what the user is
   * looking at right now," and lets the agent decide whether to
   * ``ScrollTo`` a target before acting on it. Costs one
   * ``getBoundingClientRect`` per emitted node.
   *
   * @default true
   */
  trackViewport?: boolean;
  /**
   * When ``true``, log each emitted snapshot to the browser console
   * (node count, rough token estimate, and the raw tree). Useful for
   * debugging prompt behavior in dev / staging. Mirrors the server's
   * ``log_snapshots`` option on ``UIAgent``.
   *
   * @default false
   */
  logSnapshots?: boolean;
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
 * Behaviour:
 *
 * - Emits an initial snapshot shortly after mount.
 * - Re-emits on DOM mutations, ARIA attribute changes, focus
 *   changes, scroll-end, window resize, and tab visibility change,
 *   coalesced by ``debounceMs``.
 * - No-op until a ``UIAgentClient`` is available from the ambient
 *   ``UIAgentProvider`` (or the provider's Pipecat client is unset).
 *
 * Produces no local React state and returns nothing; the snapshot
 * flows through the existing ``UIAgentClient.sendEvent`` pipe.
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
    if (typeof document === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const emit = () => {
      timer = undefined;
      try {
        const snapshot = snapshotDocument(undefined, { trackViewport });
        client.sendEvent(UI_SNAPSHOT_EVENT_NAME, snapshot);
        if (logSnapshots) {
          const nodeCount = countNodes(snapshot.root);
          const serialized = JSON.stringify(snapshot);
          const estTokens = Math.round(serialized.length / 4);
          // Grouped so it collapses nicely in DevTools. The raw tree
          // is included last so it can be expanded on demand.
          console.groupCollapsed(
            `[useA11ySnapshot] emit: ${nodeCount} nodes, ~${estTokens} tokens`,
          );
          console.log("snapshot:", snapshot);
          console.groupEnd();
        }
      } catch {
        // Swallow walker errors so we don't crash the app from a
        // background snapshot attempt. Errors will show in DevTools
        // in development via the browser's error reporting.
      }
    };

    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(emit, debounceMs);
    };

    // Prime with an initial snapshot once React has mounted the tree.
    schedule();

    const observer = new MutationObserver(() => {
      schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "role",
        "aria-label",
        "aria-labelledby",
        "aria-expanded",
        "aria-selected",
        "aria-checked",
        "aria-disabled",
        "aria-level",
        "aria-hidden",
        "aria-colcount",
        "aria-rowcount",
        "data-a11y-exclude",
        "disabled",
        "hidden",
        "tabindex",
        "href",
      ],
    });

    const focusHandler = () => schedule();
    document.addEventListener("focusin", focusHandler);
    document.addEventListener("focusout", focusHandler);

    // Scrollend fires once when the scroll gesture settles. Firing at
    // rest avoids fighting the browser's animation frames during
    // active scrolling. ``capture: true`` catches scroll on any
    // scrollable ancestor, not just the window.
    const scrollEndHandler = () => schedule();
    window.addEventListener("scrollend", scrollEndHandler, { capture: true });

    // Resize changes the viewport, which shifts which nodes are
    // ``[offscreen]``. Debounced so a drag-resize doesn't thrash.
    const resizeHandler = () => schedule();
    window.addEventListener("resize", resizeHandler);

    // When the tab becomes visible again, take a fresh snapshot so
    // the server reflects the state the user is actually looking at.
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("focusin", focusHandler);
      document.removeEventListener("focusout", focusHandler);
      window.removeEventListener("scrollend", scrollEndHandler, {
        capture: true,
      });
      window.removeEventListener("resize", resizeHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [enabled, client, debounceMs, trackViewport, logSnapshots]);
}
