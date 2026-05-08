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
} from "@pipecat-ai/client-js";
import { findElementByRef } from "@pipecat-ai/client-js";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  type UICommandHandler,
  useUICommandHandler,
} from "./useUICommandHandler";

type ProcessGlobal = typeof globalThis & {
  process?: { env?: { NODE_ENV?: string } };
};

function debugRefusal(
  command: string,
  reason: string,
  payload: unknown,
): void {
  const env = (globalThis as ProcessGlobal).process?.env?.NODE_ENV;
  if (env === "production") return;
  console.debug(`[Pipecat UI] ${command} refused: ${reason}`, payload);
}

/**
 * Resolve a command payload's target element. Prefers the snapshot
 * `ref` (so the server can reference nodes it saw in
 * `<ui_state>`), then falls back to `document.getElementById` on
 * `target_id`.
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
    if (typeof document === "undefined") return null;
    return document.getElementById(payload.target_id);
  }
  return null;
}

type ScrollBehaviorOption = "auto" | "instant" | "smooth";
type ScrollLogicalPositionOption = "start" | "center" | "end" | "nearest";

/** Options accepted by `useDefaultScrollToHandler`. */
export interface DefaultScrollToOptions {
  /** `scrollIntoView` block position. @default "start" */
  block?: ScrollLogicalPositionOption;
  /** `scrollIntoView` inline position. @default "nearest" */
  inline?: ScrollLogicalPositionOption;
  /**
   * Fallback scroll behavior when the incoming `payload.behavior`
   * is unset. @default "smooth"
   */
  defaultBehavior?: ScrollBehaviorOption;
  /**
   * When set, scroll *inside* this element instead of relying on
   * `scrollIntoView` walking to the nearest scrollable ancestor.
   * Function form is evaluated on each scroll so it can account for
   * containers mounted after the hook.
   */
  container?: Element | null | (() => Element | null | undefined);
  /**
   * Pixel offsets applied after scrolling, typically to clear a
   * sticky header. Positive `top` scrolls *up* by that amount so
   * the target isn't hidden by a fixed header. Only applied when
   * `container` is set (since window-level offsets are usually
   * better solved with `scroll-margin-top` CSS).
   */
  offset?: { top?: number; left?: number };
}

/** Enable the default `scroll_to` handler: scrollIntoView on the target. */
export const useDefaultScrollToHandler = (
  options: DefaultScrollToOptions = {},
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
      if (!el) {
        debugRefusal("scroll_to", "target not found", payload);
        return;
      }
      const behavior: ScrollBehaviorOption =
        payload.behavior === "instant" || payload.behavior === "smooth"
          ? (payload.behavior as ScrollBehaviorOption)
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

/** Options accepted by `useDefaultFocusHandler`. */
export interface DefaultFocusOptions {
  /**
   * Pass `{ preventScroll: true }` to `element.focus()` so the
   * focus change doesn't also pan the viewport. Useful when focus
   * happens alongside an explicit `scroll_to`. @default false
   */
  preventScroll?: boolean;
}

/** Enable the default `focus` handler: `.focus()` on the target. */
export const useDefaultFocusHandler = (
  options: DefaultFocusOptions = {},
): void => {
  const { preventScroll = false } = options;
  const handler = useCallback(
    (payload: FocusPayload) => {
      const el = resolveTarget(payload);
      if (!(el instanceof HTMLElement)) {
        debugRefusal("focus", "target not found or not focusable", payload);
        return;
      }
      el.focus({ preventScroll });
    },
    [preventScroll],
  );
  useUICommandHandler<FocusPayload>("focus", handler);
};

/** Options accepted by `useDefaultHighlightHandler`. */
export interface DefaultHighlightOptions {
  /** CSS class toggled on the target for `duration_ms`. @default "ui-highlight" */
  className?: string;
  /**
   * Fallback duration when `payload.duration_ms` is missing.
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
export const useDefaultHighlightHandler = (
  options: DefaultHighlightOptions = {},
): void => {
  const {
    className = "ui-highlight",
    defaultDurationMs = 1500,
    scrollIntoViewFirst = false,
  } = options;
  const activeEl = useRef<Element | null>(null);
  const activeClassName = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const clearHighlight = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (activeEl.current && activeClassName.current) {
      activeEl.current.classList.remove(activeClassName.current);
    }
    activeEl.current = null;
    activeClassName.current = null;
  }, []);

  useEffect(() => clearHighlight, [clearHighlight]);

  const handler = useCallback(
    (payload: HighlightPayload) => {
      const el = resolveTarget(payload);
      if (!el) {
        debugRefusal("highlight", "target not found", payload);
        return;
      }
      clearHighlight();
      if (scrollIntoViewFirst) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      el.classList.add(className);
      activeEl.current = el;
      activeClassName.current = className;
      const duration = payload.duration_ms ?? defaultDurationMs;
      timer.current = window.setTimeout(() => {
        el.classList.remove(className);
        if (activeEl.current === el && activeClassName.current === className) {
          activeEl.current = null;
          activeClassName.current = null;
          timer.current = undefined;
        }
      }, duration);
    },
    [className, clearHighlight, defaultDurationMs, scrollIntoViewFirst],
  );
  useUICommandHandler<HighlightPayload>("highlight", handler);
};

/** Options accepted by `useDefaultSelectTextHandler`. */
export interface DefaultSelectTextOptions {
  /**
   * When true, the target is scrolled into view before the selection
   * is applied so the user actually sees what was selected. @default true
   */
  scrollIntoViewFirst?: boolean;
  /** `scrollIntoView` block position when scrolling first. @default "center" */
  block?: ScrollLogicalPositionOption;
}

/**
 * Walk descendant text nodes of `el` in document order and locate
 * the `(textNode, offsetInNode)` position that corresponds to
 * character offset `charOffset` over the concatenated text content.
 *
 * Callers are expected to pre-validate `charOffset` against
 * `el.textContent.length`; this helper returns `null` if no text
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
 * Enable the default `select_text` handler.
 *
 * Resolves the target by ref / target_id (same as the other
 * handlers). For `<input>` and `<textarea>`, calls
 * `setSelectionRange(start, end)`, or `el.select()` when offsets
 * are not provided. For document elements, builds a `Range` from
 * the descendant text nodes; with offsets absent, uses
 * `Range.selectNodeContents(el)`.
 */
export const useDefaultSelectTextHandler = (
  options: DefaultSelectTextOptions = {},
): void => {
  const { scrollIntoViewFirst = true, block = "center" } = options;
  const handler = useCallback(
    (payload: SelectTextPayload) => {
      const el = resolveTarget(payload);
      if (!el) {
        debugRefusal("select_text", "target not found", payload);
        return;
      }
      if (scrollIntoViewFirst) {
        el.scrollIntoView({ behavior: "smooth", block });
      }

      const start = payload.start_offset ?? null;
      const end = payload.end_offset ?? null;

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (start !== null && end !== null) {
          const inRange =
            start >= 0 && end >= 0 && start <= end && end <= el.value.length;
          if (inRange) {
            el.focus({ preventScroll: true });
            el.setSelectionRange(start, end);
          } else {
            debugRefusal("select_text", "invalid input offsets", payload);
            el.select();
          }
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

/** Options accepted by `useDefaultSetInputValueHandler`. */
export interface DefaultSetInputValueOptions {
  /**
   * When true, fire `focus()` on the target before writing so the
   * user sees the cursor land in the field. The element is blurred
   * after the change events fire to avoid stealing keyboard focus
   * from the user mid-conversation. @default false
   */
  focusFirst?: boolean;
}

/**
 * Enable the default `set_input_value` handler.
 *
 * Resolves the target by ref / target_id, refuses on
 * `disabled`, `readonly`, or `<input type="hidden">` (silent
 * no-op so the agent can't bypass UI affordances the user is meant
 * to control), then assigns `el.value` and dispatches single-shot
 * `input` and `change` events so React-controlled inputs and
 * vanilla `onChange` listeners pick up the new value naturally.
 *
 * With `replace: false` the new text is appended to the current
 * value; the default replaces. The flag is ignored for native
 * `<select>` since a select either has the value or doesn't.
 *
 * Native `<select>` is supported in addition to text inputs and
 * textareas: programmatic `option.click()` doesn't reliably change
 * the selection, so the handler sets `el.value` and dispatches a
 * `change` event (selects don't fire `input` on programmatic
 * change). For custom comboboxes (ARIA listbox + popup), apps wire
 * their own command matching the library's interaction model.
 */
export const useDefaultSetInputValueHandler = (
  options: DefaultSetInputValueOptions = {},
): void => {
  const { focusFirst = false } = options;
  const handler = useCallback(
    (payload: SetInputValuePayload) => {
      const el = resolveTarget(payload);

      if (el instanceof HTMLSelectElement) {
        if (el.disabled) {
          debugRefusal("set_input_value", "select is disabled", payload);
          return;
        }
        el.value = payload.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLTextAreaElement)
      ) {
        debugRefusal("set_input_value", "target not found or not editable", payload);
        return;
      }
      // Refuse on fields the user can't edit themselves.
      if (el.disabled) {
        debugRefusal("set_input_value", "field is disabled", payload);
        return;
      }
      if (el.readOnly) {
        debugRefusal("set_input_value", "field is readonly", payload);
        return;
      }
      if (el instanceof HTMLInputElement && el.type === "hidden") {
        debugRefusal("set_input_value", "input is hidden", payload);
        return;
      }

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
 * Enable the default `click` handler.
 *
 * Resolves the target by ref / target_id and calls
 * `el.click()`. Refuses on elements that expose a `disabled`
 * property in the truthy state (form controls, `<button>`,
 * `<a>` with `aria-disabled="true"`) so the agent can't bypass
 * UI affordances the user is meant to control.
 *
 * Use for checkboxes, radios, submit buttons, links, and any
 * app-specific clickable element. For native `<select>`, prefer
 * `set_input_value`. Text inputs, textareas, and selects use
 * `set_input_value`; checkboxes and radios use `click`.
 */
export const useDefaultClickHandler = (): void => {
  const handler = useCallback((payload: ClickPayload) => {
    const el = resolveTarget(payload);
    if (!(el instanceof HTMLElement)) {
      debugRefusal("click", "target not found or not clickable", payload);
      return;
    }
    // Form controls and buttons expose a `disabled` property
    // directly. `<a>` and arbitrary elements with role="button"
    // can carry `aria-disabled`; honor that too.
    const disabledProp = (el as { disabled?: unknown }).disabled;
    if (disabledProp === true) {
      debugRefusal("click", "target is disabled", payload);
      return;
    }
    if (el.getAttribute("aria-disabled") === "true") {
      debugRefusal("click", "target is aria-disabled", payload);
      return;
    }
    el.click();
  }, []);
  useUICommandHandler<ClickPayload>("click", handler);
};

/** Options accepted by `useDefaultUICommandHandlers` (one object per handler). */
export interface DefaultUICommandHandlerOptions {
  scrollTo?: DefaultScrollToOptions;
  focus?: DefaultFocusOptions;
  highlight?: DefaultHighlightOptions;
  selectText?: DefaultSelectTextOptions;
  setInputValue?: DefaultSetInputValueOptions;
}

/**
 * Enable all DOM-based default handlers (`scroll_to`, `focus`,
 * `highlight`, `select_text`, `set_input_value`, `click`) at once.
 * Pass per-handler option objects to customize.
 */
export const useDefaultUICommandHandlers = (
  options: DefaultUICommandHandlerOptions = {},
): void => {
  useDefaultScrollToHandler(options.scrollTo);
  useDefaultFocusHandler(options.focus);
  useDefaultHighlightHandler(options.highlight);
  useDefaultSelectTextHandler(options.selectText);
  useDefaultSetInputValueHandler(options.setInputValue);
  useDefaultClickHandler();
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
