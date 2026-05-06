/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * Framework-agnostic helper that drives accessibility-snapshot
 * streaming. Wraps the walker, a ``MutationObserver``, and the other
 * triggers (scrollend, resize, focus, visibilitychange) into a single
 * object with ``start()`` / ``stop()``. React apps use
 * ``useA11ySnapshot`` which is a thin wrapper around this; vanilla JS
 * or non-React apps instantiate the class directly.
 */

import { RTVIMessageType } from "../rtvi";
import { snapshotDocument } from "../rtvi/a11y_walker";
import type { PipecatClient } from "./client";

/** Options for ``A11ySnapshotStreamer``. */
export interface A11ySnapshotStreamerOptions {
  /**
   * Minimum interval between snapshot emissions, in milliseconds.
   * Multiple mutations within the window coalesce into one snapshot.
   *
   * @default 300
   */
  debounceMs?: number;
  /**
   * When ``true`` (default), annotate every emitted node with
   * ``"offscreen"`` in its state list if its bounding rect sits
   * entirely outside the viewport. Set to ``false`` to skip the
   * per-node layout measurement.
   *
   * @default true
   */
  trackViewport?: boolean;
  /**
   * When ``true``, log each emitted snapshot to the browser console
   * (node count, rough token estimate, raw tree). Mirrors the
   * server's ``log_snapshots`` flag on ``UIAgent``.
   *
   * @default false
   */
  logSnapshots?: boolean;
}

/**
 * Stream accessibility snapshots to a ``PipecatClient`` on DOM
 * mutations, focus changes, scroll-end, resize, and visibility
 * change. Fires an initial snapshot shortly after ``start()``.
 *
 * Usage (vanilla JS / any framework)::
 *
 *     const streamer = new A11ySnapshotStreamer(pipecatClient);
 *     streamer.start();
 *     // ...later
 *     streamer.stop();
 *
 * In React, ``useA11ySnapshot`` handles lifecycle for you.
 *
 * Idempotent: calling ``start()`` twice is safe; ``stop()`` detaches
 * all observers/listeners and cancels pending timers.
 */
export class A11ySnapshotStreamer {
  private client: PipecatClient;
  private debounceMs: number;
  private trackViewport: boolean;
  private logSnapshots: boolean;

  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private observer: MutationObserver | undefined;
  private focusHandler?: () => void;
  private scrollEndHandler?: () => void;
  private resizeHandler?: () => void;
  private visibilityHandler?: () => void;
  private selectionHandler?: () => void;

  constructor(client: PipecatClient, options: A11ySnapshotStreamerOptions = {}) {
    this.client = client;
    this.debounceMs = options.debounceMs ?? 300;
    this.trackViewport = options.trackViewport ?? true;
    this.logSnapshots = options.logSnapshots ?? false;
  }

  /**
   * Begin streaming. Safe to call multiple times; subsequent calls
   * are no-ops until ``stop()`` runs.
   */
  start(): void {
    if (this.running) return;
    if (typeof document === "undefined") return;
    this.running = true;

    // Prime with an initial snapshot once the caller has had a chance
    // to mount the UI.
    this.schedule();

    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.body, {
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

    this.focusHandler = () => this.schedule();
    document.addEventListener("focusin", this.focusHandler);
    document.addEventListener("focusout", this.focusHandler);

    // Scrollend fires once when a scroll gesture settles - no
    // debounce needed, and firing at rest avoids fighting the
    // browser's animation frames. ``capture: true`` catches scroll
    // on any scrollable ancestor, not just the window.
    this.scrollEndHandler = () => this.schedule();
    window.addEventListener("scrollend", this.scrollEndHandler, { capture: true });

    // Resize changes the viewport rect, which shifts which nodes are
    // ``[offscreen]``. Debounced via ``schedule`` so a drag-resize
    // doesn't thrash.
    this.resizeHandler = () => this.schedule();
    window.addEventListener("resize", this.resizeHandler);

    // Refresh state when the tab becomes visible again; ignore the
    // transition into ``hidden``.
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") this.schedule();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    // ``selectionchange`` fires throughout a drag-select; the existing
    // debounce coalesces the burst into a single snapshot once the
    // user stops moving. Snapshots end up carrying the latest
    // selection alongside the rest of the screen state.
    this.selectionHandler = () => this.schedule();
    document.addEventListener("selectionchange", this.selectionHandler);
  }

  /** Stop streaming. Safe to call before ``start()`` or multiple times. */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
    if (typeof document !== "undefined") {
      if (this.focusHandler) {
        document.removeEventListener("focusin", this.focusHandler);
        document.removeEventListener("focusout", this.focusHandler);
      }
      if (this.visibilityHandler) {
        document.removeEventListener("visibilitychange", this.visibilityHandler);
      }
      if (this.selectionHandler) {
        document.removeEventListener("selectionchange", this.selectionHandler);
      }
    }
    if (typeof window !== "undefined") {
      if (this.scrollEndHandler) {
        window.removeEventListener("scrollend", this.scrollEndHandler, {
          capture: true,
        });
      }
      if (this.resizeHandler) {
        window.removeEventListener("resize", this.resizeHandler);
      }
    }
    this.focusHandler = undefined;
    this.scrollEndHandler = undefined;
    this.resizeHandler = undefined;
    this.visibilityHandler = undefined;
    this.selectionHandler = undefined;
  }

  private schedule(): void {
    if (!this.running) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.emit(), this.debounceMs);
  }

  private emit(): void {
    this.timer = undefined;
    if (!this.running) return;
    try {
      const snapshot = snapshotDocument(undefined, {
        trackViewport: this.trackViewport,
      });
      // ui-snapshot is a first-class RTVI top-level type; bypass the
      // sendEvent path (which targets ui-event) and send the typed
      // message directly. The server expects { tree: A11ySnapshot }.
      this.client.sendRTVIMessage(RTVIMessageType.UI_SNAPSHOT, {
        tree: snapshot,
      });
      if (this.logSnapshots) {
        const nodeCount = countNodes(snapshot.root);
        const estTokens = Math.round(JSON.stringify(snapshot).length / 4);
        // Grouped so it collapses cleanly in DevTools. The raw tree
        // is included last so it can be expanded on demand.
        console.groupCollapsed(
          `[A11ySnapshotStreamer] emit: ${nodeCount} nodes, ~${estTokens} tokens`,
        );
        console.log("snapshot:", snapshot);
        console.groupEnd();
      }
    } catch {
      // Swallow walker errors so we don't crash the host app from a
      // background snapshot attempt. The browser's default error
      // reporting still surfaces them in DevTools.
    }
  }
}

function countNodes(node: { children?: { children?: unknown[] }[] }): number {
  let count = 1;
  const kids = (node as { children?: Array<{ children?: unknown[] }> }).children;
  if (kids) {
    for (const child of kids) {
      count += countNodes(child as Parameters<typeof countNodes>[0]);
    }
  }
  return count;
}
