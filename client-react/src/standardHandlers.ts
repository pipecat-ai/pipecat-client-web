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
 * Each hook accepts an options object so apps can tune common
 * behaviors (scroll block/inline, focus preventScroll, highlight
 * class + duration) without having to rewrite the handler.
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
import { findElementByRef } from "@pipecat-ai/client-js";
import { useCallback, useMemo } from "react";

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

type ScrollBehavior = "auto" | "instant" | "smooth";
type ScrollLogicalPosition = "start" | "center" | "end" | "nearest";

/** Options accepted by ``useStandardScrollToHandler``. */
export interface StandardScrollToOptions {
  /** ``scrollIntoView`` block position. @default "start" */
  block?: ScrollLogicalPosition;
  /** ``scrollIntoView`` inline position. @default "nearest" */
  inline?: ScrollLogicalPosition;
  /**
   * Fallback scroll behavior when the incoming ``payload.behavior``
   * is unset. @default "smooth"
   */
  defaultBehavior?: ScrollBehavior;
  /**
   * When set, scroll *inside* this element instead of relying on
   * ``scrollIntoView`` walking to the nearest scrollable ancestor.
   * Function form is evaluated on each scroll so it can account for
   * containers mounted after the hook.
   */
  container?: Element | null | (() => Element | null | undefined);
  /**
   * Pixel offsets applied after scrolling, typically to clear a
   * sticky header. Positive ``top`` scrolls *up* by that amount so
   * the target isn't hidden by a fixed header. Only applied when
   * ``container`` is set (since window-level offsets are usually
   * better solved with ``scroll-margin-top`` CSS).
   */
  offset?: { top?: number; left?: number };
}

/** Enable the default `scroll_to` handler: scrollIntoView on the target. */
export const useStandardScrollToHandler = (
  options: StandardScrollToOptions = {},
): void => {
  const {
    block = "start",
    inline = "nearest",
    defaultBehavior = "smooth",
    container,
    offset,
  } = options;
  // Freeze container lookup shape so the useCallback identity is stable.
  const resolveContainer = useMemo(() => {
    if (typeof container === "function") return container;
    if (container === undefined) return () => null;
    return () => container;
  }, [container]);

  const handler = useCallback(
    (payload: ScrollToPayload) => {
      const el = resolveTarget(payload);
      if (!el) return;
      const behavior: ScrollBehavior =
        payload.behavior === "instant" || payload.behavior === "smooth"
          ? (payload.behavior as ScrollBehavior)
          : defaultBehavior;

      const root = resolveContainer();
      if (root instanceof Element) {
        const rootRect = root.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const top =
          root.scrollTop + (elRect.top - rootRect.top) - (offset?.top ?? 0);
        const left =
          root.scrollLeft + (elRect.left - rootRect.left) - (offset?.left ?? 0);
        root.scrollTo({ top, left, behavior });
        return;
      }

      el.scrollIntoView({ behavior, block, inline });
    },
    [block, inline, defaultBehavior, resolveContainer, offset?.top, offset?.left],
  );
  useUICommandHandler<ScrollToPayload>("scroll_to", handler);
};

/** Options accepted by ``useStandardFocusHandler``. */
export interface StandardFocusOptions {
  /**
   * Pass ``{ preventScroll: true }`` to ``element.focus()`` so the
   * focus change doesn't also pan the viewport. Useful when focus
   * happens alongside an explicit ``scroll_to``. @default false
   */
  preventScroll?: boolean;
}

/** Enable the default `focus` handler: `.focus()` on the target. */
export const useStandardFocusHandler = (
  options: StandardFocusOptions = {},
): void => {
  const { preventScroll = false } = options;
  const handler = useCallback(
    (payload: FocusPayload) => {
      const el = resolveTarget(payload);
      if (el instanceof HTMLElement) el.focus({ preventScroll });
    },
    [preventScroll],
  );
  useUICommandHandler<FocusPayload>("focus", handler);
};

/** Options accepted by ``useStandardHighlightHandler``. */
export interface StandardHighlightOptions {
  /** CSS class toggled on the target for ``duration_ms``. @default "ui-highlight" */
  className?: string;
  /**
   * Fallback duration when ``payload.duration_ms`` is missing.
   * @default 1500
   */
  defaultDurationMs?: number;
  /**
   * When true, the target is scrolled into view before the class is
   * applied, so the flash is actually visible to the user even if
   * the target is currently offscreen. @default false
   */
  scrollIntoViewFirst?: boolean;
}

/**
 * Enable the default `highlight` handler: toggle a CSS class on the
 * target for `duration_ms`. Apps style the class themselves (e.g.
 * `.ui-highlight { outline: 2px solid gold; transition: outline
 * 0.25s; }`).
 */
export const useStandardHighlightHandler = (
  options: StandardHighlightOptions = {},
): void => {
  const {
    className = "ui-highlight",
    defaultDurationMs = 1500,
    scrollIntoViewFirst = false,
  } = options;
  const handler = useCallback(
    (payload: HighlightPayload) => {
      const el = resolveTarget(payload);
      if (!el) return;
      if (scrollIntoViewFirst) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      el.classList.add(className);
      const duration = payload.duration_ms ?? defaultDurationMs;
      window.setTimeout(() => {
        el.classList.remove(className);
      }, duration);
    },
    [className, defaultDurationMs, scrollIntoViewFirst],
  );
  useUICommandHandler<HighlightPayload>("highlight", handler);
};

/** Options accepted by ``useStandardCommandHandlers`` (one object per handler). */
export interface StandardCommandHandlerOptions {
  scrollTo?: StandardScrollToOptions;
  focus?: StandardFocusOptions;
  highlight?: StandardHighlightOptions;
}

/**
 * Enable all DOM-based default handlers (`scroll_to`, `focus`,
 * `highlight`) at once. Pass per-handler option objects to customize.
 */
export const useStandardCommandHandlers = (
  options: StandardCommandHandlerOptions = {},
): void => {
  useStandardScrollToHandler(options.scrollTo);
  useStandardFocusHandler(options.focus);
  useStandardHighlightHandler(options.highlight);
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
