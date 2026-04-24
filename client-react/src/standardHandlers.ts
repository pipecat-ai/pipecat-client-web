/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * Opt-in React hooks that install default handlers for the built-in
 * command vocabulary.
 *
 * The DOM-based defaults (`scroll_to`, `focus`, `highlight`) resolve
 * elements by snapshot ref first (via the a11y walker's registry),
 * then fall back to `document.getElementById(target_id)`. Apps that
 * prefer a different resolution strategy should register their own
 * handler via `useUICommandHandler` instead.
 *
 * `toast` and `navigate` are intentionally not auto-wired because both
 * are app-shaped (which toast library, which router). The exported
 * `useToastHandler` / `useNavigateHandler` are typed sugar over
 * `useUICommandHandler<ToastPayload>` etc., for apps that want the
 * types without re-importing the payload interface.
 */

import type {
  FocusPayload,
  HighlightPayload,
  NavigatePayload,
  ScrollToPayload,
  ToastPayload,
  UICommandHandler,
} from "@pipecat-ai/client-js";
import { useCallback } from "react";

import { findElementByRef } from "./a11ySnapshotWalker";
import { useUICommandHandler } from "./useUICommandHandler";

/**
 * Resolve a command payload's target element. Prefers the snapshot
 * ``ref`` (so the server can reference nodes it saw in
 * ``<ui_state>``), then falls back to ``document.getElementById`` on
 * ``target_id``.
 */
function resolveTarget(payload: {
  ref?: string | null;
  target_id?: string | null;
}): Element | null {
  if (payload.ref) {
    const el = findElementByRef(payload.ref);
    if (el) return el;
  }
  if (payload.target_id) {
    return document.getElementById(payload.target_id);
  }
  return null;
}

/** Enable the default `scroll_to` handler: scrollIntoView on the target. */
export const useStandardScrollToHandler = (): void => {
  const handler = useCallback((payload: ScrollToPayload) => {
    const el = resolveTarget(payload);
    if (!el) return;
    const behavior: "auto" | "instant" | "smooth" =
      payload.behavior === "instant" || payload.behavior === "smooth"
        ? payload.behavior
        : "smooth";
    el.scrollIntoView({ behavior });
  }, []);
  useUICommandHandler<ScrollToPayload>("scroll_to", handler);
};

/** Enable the default `focus` handler: `.focus()` on the target. */
export const useStandardFocusHandler = (): void => {
  const handler = useCallback((payload: FocusPayload) => {
    const el = resolveTarget(payload);
    if (el instanceof HTMLElement) el.focus();
  }, []);
  useUICommandHandler<FocusPayload>("focus", handler);
};

/**
 * Enable the default `highlight` handler: toggle a CSS class on the
 * target for `duration_ms`. Apps style the class themselves (e.g.
 * `.ui-highlight { outline: 2px solid gold; transition: outline
 * 0.25s; }`).
 *
 * @param className - CSS class to toggle. Defaults to `"ui-highlight"`.
 * @param defaultDurationMs - Fallback when `payload.duration_ms` is
 *     missing. Defaults to 1500.
 */
export const useStandardHighlightHandler = (
  className = "ui-highlight",
  defaultDurationMs = 1500,
): void => {
  const handler = useCallback(
    (payload: HighlightPayload) => {
      const el = resolveTarget(payload);
      if (!el) return;
      el.classList.add(className);
      const duration = payload.duration_ms ?? defaultDurationMs;
      window.setTimeout(() => {
        el.classList.remove(className);
      }, duration);
    },
    [className, defaultDurationMs],
  );
  useUICommandHandler<HighlightPayload>("highlight", handler);
};

/**
 * Enable all DOM-based default handlers (`scroll_to`, `focus`,
 * `highlight`) at once.
 */
export const useStandardCommandHandlers = (): void => {
  useStandardScrollToHandler();
  useStandardFocusHandler();
  useStandardHighlightHandler();
};

/**
 * Typed sugar for `useUICommandHandler<ToastPayload>("toast", handler)`.
 * Wire a toast renderer of your choice; the SDK doesn't ship one.
 */
export const useToastHandler = (handler: UICommandHandler<ToastPayload>): void => {
  useUICommandHandler<ToastPayload>("toast", handler);
};

/**
 * Typed sugar for `useUICommandHandler<NavigatePayload>("navigate", handler)`.
 * Wire into your router of choice; the SDK doesn't ship one.
 */
export const useNavigateHandler = (
  handler: UICommandHandler<NavigatePayload>,
): void => {
  useUICommandHandler<NavigatePayload>("navigate", handler);
};
