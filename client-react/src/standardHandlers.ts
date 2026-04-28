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
  ClickPayload,
  FocusPayload,
  HighlightPayload,
  NavigatePayload,
  ScrollToPayload,
  SelectTextPayload,
  SetInputValuePayload,
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

/** Options accepted by ``useStandardSelectTextHandler``. */
export interface StandardSelectTextOptions {
  /**
   * When true, the target is scrolled into view before the selection
   * is applied so the user actually sees what was selected. @default true
   */
  scrollIntoViewFirst?: boolean;
  /** ``scrollIntoView`` block position when scrolling first. @default "center" */
  block?: ScrollLogicalPosition;
}

/**
 * Walk descendant text nodes of ``el`` in document order and locate
 * the ``(textNode, offsetInNode)`` position that corresponds to
 * character offset ``charOffset`` over the concatenated text content.
 *
 * Callers are expected to pre-validate ``charOffset`` against
 * ``el.textContent.length``; this helper returns ``null`` if no text
 * node covers the offset.
 */
function findTextNodePosition(
  el: Element,
  charOffset: number,
): [Node, number] | null {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let node = walker.nextNode();
  while (node) {
    const len = (node.textContent ?? "").length;
    if (consumed + len >= charOffset) {
      return [node, charOffset - consumed];
    }
    consumed += len;
    node = walker.nextNode();
  }
  // Offset == total length: clamp to the end of the last text node
  // so an exclusive end-offset at the end of the content still
  // resolves cleanly.
  if (charOffset === consumed && consumed > 0) {
    const w = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    let next = w.nextNode();
    while (next) {
      last = next;
      next = w.nextNode();
    }
    if (last) return [last, (last.textContent ?? "").length];
  }
  return null;
}

/**
 * Enable the default ``select_text`` handler.
 *
 * Resolves the target by ref / target_id (same as the other
 * handlers). For ``<input>`` and ``<textarea>``, calls
 * ``setSelectionRange(start, end)``, or ``el.select()`` when offsets
 * are not provided. For document elements, builds a ``Range`` from
 * the descendant text nodes; with offsets absent, uses
 * ``Range.selectNodeContents(el)``.
 */
export const useStandardSelectTextHandler = (
  options: StandardSelectTextOptions = {},
): void => {
  const { scrollIntoViewFirst = true, block = "center" } = options;
  const handler = useCallback(
    (payload: SelectTextPayload) => {
      const el = resolveTarget(payload);
      if (!el) return;
      if (scrollIntoViewFirst) {
        el.scrollIntoView({ behavior: "smooth", block });
      }

      const start = payload.start_offset ?? null;
      const end = payload.end_offset ?? null;

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (start !== null && end !== null) {
          el.focus({ preventScroll: true });
          el.setSelectionRange(start, end);
        } else {
          el.select();
        }
        return;
      }

      const range = el.ownerDocument.createRange();
      if (start !== null && end !== null) {
        const totalLen = (el.textContent ?? "").length;
        const inRange =
          start >= 0 && end >= 0 && start <= end && end <= totalLen;
        if (!inRange) {
          // Stale or invalid offsets: fall back to selecting the
          // whole element rather than emit a broken range.
          range.selectNodeContents(el);
        } else {
          const startPos = findTextNodePosition(el, start);
          const endPos = findTextNodePosition(el, end);
          if (!startPos || !endPos) {
            range.selectNodeContents(el);
          } else {
            range.setStart(startPos[0], startPos[1]);
            range.setEnd(endPos[0], endPos[1]);
          }
        }
      } else {
        range.selectNodeContents(el);
      }
      const sel = el.ownerDocument.defaultView?.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    },
    [scrollIntoViewFirst, block],
  );
  useUICommandHandler<SelectTextPayload>("select_text", handler);
};

/** Options accepted by ``useStandardSetInputValueHandler``. */
export interface StandardSetInputValueOptions {
  /**
   * When true, fire ``focus()`` on the target before writing so the
   * user sees the cursor land in the field. The element is blurred
   * after the change events fire to avoid stealing keyboard focus
   * from the user mid-conversation. @default false
   */
  focusFirst?: boolean;
}

/**
 * Enable the default ``set_input_value`` handler.
 *
 * Resolves the target by ref / target_id, refuses on
 * ``disabled``, ``readonly``, or ``<input type="hidden">`` (silent
 * no-op so the agent can't bypass UI affordances the user is meant
 * to control), then assigns ``el.value`` and dispatches single-shot
 * ``input`` and ``change`` events so React-controlled inputs and
 * vanilla ``onChange`` listeners pick up the new value naturally.
 *
 * With ``replace: false`` the new text is appended to the current
 * value; the default replaces. The flag is ignored for native
 * ``<select>`` since a select either has the value or doesn't.
 *
 * Native ``<select>`` is supported in addition to text inputs and
 * textareas: programmatic ``option.click()`` doesn't reliably change
 * the selection, so the handler sets ``el.value`` and dispatches a
 * ``change`` event (selects don't fire ``input`` on programmatic
 * change). For custom comboboxes (ARIA listbox + popup), apps wire
 * their own command matching the library's interaction model.
 */
export const useStandardSetInputValueHandler = (
  options: StandardSetInputValueOptions = {},
): void => {
  const { focusFirst = false } = options;
  const handler = useCallback(
    (payload: SetInputValuePayload) => {
      const el = resolveTarget(payload);

      if (el instanceof HTMLSelectElement) {
        if (el.disabled) return;
        el.value = payload.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      // Refuse on fields the user can't edit themselves.
      if (el.disabled || el.readOnly) return;
      if (el instanceof HTMLInputElement && el.type === "hidden") return;

      const next =
        payload.replace === false ? (el.value ?? "") + payload.value : payload.value;
      if (focusFirst) el.focus({ preventScroll: true });
      el.value = next;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      if (focusFirst) el.blur();
    },
    [focusFirst],
  );
  useUICommandHandler<SetInputValuePayload>("set_input_value", handler);
};

/**
 * Enable the default ``click`` handler.
 *
 * Resolves the target by ref / target_id and calls
 * ``el.click()``. Refuses on elements that expose a ``disabled``
 * property in the truthy state (form controls, ``<button>``,
 * ``<a>`` with ``aria-disabled="true"``) so the agent can't bypass
 * UI affordances the user is meant to control.
 *
 * Use for checkboxes, radios, submit buttons, links, and any
 * app-specific clickable element. For native ``<select>``, prefer
 * ``set_input_value``.
 */
export const useStandardClickHandler = (): void => {
  const handler = useCallback((payload: ClickPayload) => {
    const el = resolveTarget(payload);
    if (!(el instanceof HTMLElement)) return;
    // Form controls and buttons expose a ``disabled`` property
    // directly. ``<a>`` and arbitrary elements with role="button"
    // can carry ``aria-disabled``; honor that too.
    const disabledProp = (el as { disabled?: unknown }).disabled;
    if (disabledProp === true) return;
    if (el.getAttribute("aria-disabled") === "true") return;
    el.click();
  }, []);
  useUICommandHandler<ClickPayload>("click", handler);
};

/** Options accepted by ``useStandardCommandHandlers`` (one object per handler). */
export interface StandardCommandHandlerOptions {
  scrollTo?: StandardScrollToOptions;
  focus?: StandardFocusOptions;
  highlight?: StandardHighlightOptions;
  selectText?: StandardSelectTextOptions;
  setInputValue?: StandardSetInputValueOptions;
}

/**
 * Enable all DOM-based default handlers (`scroll_to`, `focus`,
 * `highlight`, `select_text`, `set_input_value`, `click`) at once.
 * Pass per-handler option objects to customize.
 */
export const useStandardCommandHandlers = (
  options: StandardCommandHandlerOptions = {},
): void => {
  useStandardScrollToHandler(options.scrollTo);
  useStandardFocusHandler(options.focus);
  useStandardHighlightHandler(options.highlight);
  useStandardSelectTextHandler(options.selectText);
  useStandardSetInputValueHandler(options.setInputValue);
  useStandardClickHandler();
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
