/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * Internal walker that produces an accessibility snapshot from a DOM
 * subtree.
 *
 * Shape and filtering inspired by Playwright's accessibility snapshot
 * and the Playwright MCP server's LLM-facing format. The goal is a
 * compact, semantically meaningful tree the server can render as
 * ``<ui_state>`` for LLM context, not a raw DOM dump.
 *
 * Viewport awareness: when ``trackViewport`` is enabled (default),
 * every emitted node that's fully outside the viewport rect gets
 * ``"offscreen"`` in its ``state`` list. The agent reads this to
 * distinguish "on the page" from "what the user is currently
 * looking at" and can decide whether to ``ScrollTo`` before acting.
 * Computing this calls ``getBoundingClientRect`` per node, which
 * forces layout once for the walk (~1ms for typical pages).
 */

import type { A11yNode, A11ySnapshot } from "@pipecat-ai/client-js";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MAX_DEPTH = 10;
const MAX_NODES = 200;
const MAX_CHILDREN_PER_NODE = 50;
const NAME_MAX = 100;

// ---------------------------------------------------------------------------
// Ref registry: stable ``e{N}`` IDs per DOM node, persist as long as the
// node is mounted. WeakMap keeps us from leaking detached nodes.
// ---------------------------------------------------------------------------

const refMap = new WeakMap<Element, string>();
// Reverse index from ref string back to element, so command handlers
// (e.g. ``scroll_to``) can resolve a server-supplied ref like
// ``"e42"`` back to a live DOM node. ``WeakRef`` lets the entry
// become stale when the element unmounts; lookups check liveness.
const refToElement = new Map<string, WeakRef<Element>>();
let refCounter = 0;

function getRef(el: Element): string {
  const existing = refMap.get(el);
  if (existing) return existing;
  const ref = `e${++refCounter}`;
  refMap.set(el, ref);
  refToElement.set(ref, new WeakRef(el));
  return ref;
}

/**
 * Resolve a ref string like ``"e42"`` back to a live DOM element.
 * Returns ``null`` if the ref was never assigned or the element has
 * since been garbage-collected. Command handlers use this to
 * act on nodes the server referenced from a snapshot.
 */
export function findElementByRef(ref: string): Element | null {
  const weakRef = refToElement.get(ref);
  if (!weakRef) return null;
  const el = weakRef.deref();
  if (!el) {
    refToElement.delete(ref);
    return null;
  }
  if (!el.isConnected) {
    refToElement.delete(ref);
    return null;
  }
  return el;
}

/** Reset the ref counter and registry. Test-only helper. */
export function __resetRefsForTesting(): void {
  refCounter = 0;
  refToElement.clear();
  // WeakMap has no clear(); replace it.
  // (The outer `refMap` const references this module-level variable;
  // for tests that want a clean counter, calling this before building
  // fresh DOM is enough — the old WeakMap entries GC out with their
  // detached nodes.)
}

// ---------------------------------------------------------------------------
// Inclusion / exclusion
// ---------------------------------------------------------------------------

const EXCLUDED_TAGS = new Set([
  "script",
  "style",
  "link",
  "meta",
  "noscript",
  "template",
]);

function isExcluded(el: Element): boolean {
  if (EXCLUDED_TAGS.has(el.tagName.toLowerCase())) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  // Explicit app-level opt-out for PII / sensitive subtrees. Skips the
  // element and its descendants entirely, without needing to also
  // hide it from screen readers (unlike aria-hidden).
  if (el.hasAttribute("data-a11y-exclude")) return true;
  if ((el as HTMLElement).hidden) return true;
  // offsetParent == null is a fast-ish check for display:none for most
  // elements (doesn't catch position:fixed hidden or visibility:hidden,
  // but catches the common case). Full getComputedStyle is ~10x slower
  // and we're running on every mutation.
  if (el instanceof HTMLElement && el.offsetParent === null && el.tagName !== "BODY") {
    // One false positive: position: fixed with display: block looks
    // like offsetParent=null but is still visible. Fall back to
    // getComputedStyle only for those.
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return true;
    // If fixed/sticky and rendered, let it through.
  }
  return false;
}

// ---------------------------------------------------------------------------
// Role derivation
// ---------------------------------------------------------------------------

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "textbox",
  "combobox",
  "switch",
  "menuitem",
  "tab",
]);

const LEAF_ROLES = new Set([
  ...INTERACTIVE_ROLES,
  "heading",
  "img",
]);

function hasAccessibleName(el: Element): boolean {
  if (el.hasAttribute("aria-label")) return true;
  if (el.hasAttribute("aria-labelledby")) return true;
  if ((el.textContent ?? "").trim().length > 0) return true;
  return false;
}

/**
 * Derive an ARIA-style role for an element. Returns ``null`` if the
 * element is a "pure wrapper" (no semantic value on its own); the
 * walker will flatten its children into the parent's list rather than
 * emitting a node.
 */
function getRole(el: Element): string | null {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;

  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "main":
    case "nav":
    case "header":
    case "aside":
    case "footer":
      return tag;
    case "article":
    case "section":
      return hasAccessibleName(el) ? "region" : null;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "a":
      return el.hasAttribute("href") ? "link" : null;
    case "button":
      return "button";
    case "input": {
      const type = (el as HTMLInputElement).type;
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button" || type === "reset") return "button";
      if (type === "hidden") return null;
      return "textbox";
    }
    case "select":
      return "combobox";
    case "textarea":
      return "textbox";
    case "label":
      return null; // consumed by its associated input
    case "img":
      return el.getAttribute("alt") !== null ? "img" : null;
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "table":
      return "table";
    case "tr":
      return "row";
    case "th":
      return "columnheader";
    case "td":
      return "cell";
    default: {
      // Promote anonymous containers that carry aria/tabindex/click.
      if (
        el.hasAttribute("aria-label") ||
        el.hasAttribute("aria-labelledby") ||
        el.hasAttribute("tabindex")
      ) {
        return "generic";
      }
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Name / value / state / level
// ---------------------------------------------------------------------------

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max = NAME_MAX): string {
  const collapsed = collapseWhitespace(s);
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1) + "…";
}

function resolveLabelledBy(el: Element): string | undefined {
  const ids = el.getAttribute("aria-labelledby");
  if (!ids) return undefined;
  const parts: string[] = [];
  for (const id of ids.split(/\s+/)) {
    if (!id) continue;
    const target = el.ownerDocument.getElementById(id);
    if (target) parts.push(collectAccessibleText(target));
  }
  const joined = parts.filter(Boolean).join(" ");
  return joined || undefined;
}

/**
 * Collect the accessible text content of an element by walking its
 * descendant text nodes and joining them with a single space across
 * element boundaries. This fixes the common case where a button
 * contains multiple ``<span>`` children whose text would otherwise
 * concatenate without a separator (``textContent`` returns
 * ``"FooBar"`` for ``<span>Foo</span><span>Bar</span>``).
 *
 * Skips aria-hidden and ``EXCLUDED_TAGS`` descendants.
 */
function collectAccessibleText(el: Element): string {
  const parts: string[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3 /* TEXT_NODE */) {
      const t = (child.textContent ?? "").trim();
      if (t) parts.push(t);
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const childEl = child as Element;
      if (EXCLUDED_TAGS.has(childEl.tagName.toLowerCase())) continue;
      if (childEl.getAttribute("aria-hidden") === "true") continue;
      const sub = collectAccessibleText(childEl);
      if (sub) parts.push(sub);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function getName(el: Element, role: string): string | undefined {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return truncate(ariaLabel);

  const labelled = resolveLabelledBy(el);
  if (labelled) return truncate(labelled);

  const tag = el.tagName.toLowerCase();

  // Form controls: prefer associated <label>.
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const id = el.getAttribute("id");
    if (id) {
      // Iterate labels rather than using a CSS attribute selector so we
      // avoid needing CSS.escape (which isn't available in jsdom).
      const labels = el.ownerDocument.getElementsByTagName("label");
      for (let i = 0; i < labels.length; i++) {
        if (labels[i].htmlFor === id && labels[i].textContent) {
          return truncate(labels[i].textContent ?? "");
        }
      }
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel?.textContent) return truncate(wrappingLabel.textContent);
    // Fall back to placeholder for inputs.
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) return truncate(placeholder);
    return undefined;
  }

  // img: alt text.
  if (tag === "img") {
    const alt = el.getAttribute("alt");
    return alt ? truncate(alt) : undefined;
  }

  // Leaf interactive / heading / link roles use text from descendants.
  // Use ``collectAccessibleText`` so sibling children (e.g. multiple
  // ``<span>`` inside a button) are joined with spaces rather than
  // concatenated by ``textContent``.
  if (LEAF_ROLES.has(role)) {
    const text = collectAccessibleText(el);
    return text ? truncate(text) : undefined;
  }

  return undefined;
}

function getValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) {
    if (el.type === "password") return undefined;
    if (el.type === "checkbox" || el.type === "radio" || el.type === "hidden") return undefined;
    return el.value || undefined;
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value || undefined;
  }
  if (el instanceof HTMLSelectElement) {
    return el.value || undefined;
  }
  return undefined;
}

function getState(el: Element): string[] {
  const state: string[] = [];
  if (el.ownerDocument.activeElement === el) state.push("focused");
  if (el.getAttribute("aria-expanded") === "true") state.push("expanded");
  if (el.getAttribute("aria-selected") === "true") state.push("selected");
  if (
    el.hasAttribute("disabled") ||
    el.getAttribute("aria-disabled") === "true"
  ) {
    state.push("disabled");
  }
  const ariaChecked = el.getAttribute("aria-checked");
  if (ariaChecked === "true") state.push("checked");
  if (el instanceof HTMLInputElement) {
    if ((el.type === "checkbox" || el.type === "radio") && el.checked) {
      if (!state.includes("checked")) state.push("checked");
    }
  }
  return state;
}

/**
 * Return ``true`` when the element's bounding rect does not
 * intersect the current viewport at all. Any intersection, even
 * partial, counts as visible (matches user intuition). Elements
 * with zero-size rects (``width === 0 && height === 0``) are
 * treated as offscreen.
 */
function isOffscreen(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  if (rect.bottom <= 0) return true;
  if (rect.top >= viewportHeight) return true;
  if (rect.right <= 0) return true;
  if (rect.left >= viewportWidth) return true;
  return false;
}

function getLevel(el: Element, role: string): number | undefined {
  if (role !== "heading") return undefined;
  const tag = el.tagName.toLowerCase();
  const m = tag.match(/^h([1-6])$/);
  if (m) return parseInt(m[1], 10);
  const aria = el.getAttribute("aria-level");
  if (aria) {
    const parsed = parseInt(aria, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function getAriaIntAttr(el: Element, name: string): number | undefined {
  const raw = el.getAttribute(name);
  if (!raw) return undefined;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return undefined;
  return parsed;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

interface Budget {
  count: number;
}

interface WalkOptions {
  trackViewport: boolean;
}

function walk(
  el: Element,
  depth: number,
  budget: Budget,
  opts: WalkOptions,
): A11yNode[] {
  if (isExcluded(el)) return [];
  if (budget.count >= MAX_NODES) return [];

  if (depth > MAX_DEPTH) {
    budget.count++;
    return [
      {
        ref: getRef(el),
        role: "ellipsis",
        name: "<truncated: max depth>",
      },
    ];
  }

  const role = getRole(el);

  if (role === null) {
    // Pure wrapper: inline children into the parent's child list.
    return walkChildren(el, depth, budget, opts);
  }

  budget.count++;

  const node: A11yNode = { ref: getRef(el), role };
  const name = getName(el, role);
  if (name) node.name = name;
  const value = getValue(el);
  if (value !== undefined) node.value = value;
  const state = getState(el);
  if (opts.trackViewport && isOffscreen(el)) state.push("offscreen");
  if (state.length) node.state = state;
  const level = getLevel(el, role);
  if (level !== undefined) node.level = level;
  const colcount = getAriaIntAttr(el, "aria-colcount");
  if (colcount !== undefined) node.colcount = colcount;
  const rowcount = getAriaIntAttr(el, "aria-rowcount");
  if (rowcount !== undefined) node.rowcount = rowcount;

  if (!LEAF_ROLES.has(role)) {
    const children = walkChildren(el, depth + 1, budget, opts);
    if (children.length > 0) {
      if (children.length > MAX_CHILDREN_PER_NODE) {
        const kept = children.slice(0, MAX_CHILDREN_PER_NODE);
        kept.push({
          ref: `${node.ref}.more`,
          role: "ellipsis",
          name: `${children.length - MAX_CHILDREN_PER_NODE} more`,
        });
        node.children = kept;
      } else {
        node.children = children;
      }
    }
  }

  return [node];
}

function walkChildren(
  el: Element,
  depth: number,
  budget: Budget,
  opts: WalkOptions,
): A11yNode[] {
  const out: A11yNode[] = [];
  // Iterate ``childNodes`` rather than ``children`` so we pick up
  // direct text nodes too (e.g. track titles sitting in a pure-wrapper
  // ``<div>`` next to a Play button). Without this, wrapper divs that
  // carry meaningful text lose it entirely when they get flattened.
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3 /* TEXT_NODE */) {
      const text = collapseWhitespace(child.textContent ?? "");
      if (text) {
        if (budget.count >= MAX_NODES) break;
        budget.count++;
        out.push({ ref: "", role: "text", name: truncate(text) });
      }
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const nodes = walk(child as Element, depth, budget, opts);
      for (const n of nodes) out.push(n);
      if (budget.count >= MAX_NODES) break;
    }
  }
  return out;
}

export interface SnapshotOptions {
  /**
   * When ``true`` (default), each emitted node gets ``"offscreen"``
   * in its state list if its bounding rect sits entirely outside the
   * viewport. Set to ``false`` to skip the per-node layout
   * measurement (e.g. on very large pages where layout cost
   * outweighs the viewport signal).
   */
  trackViewport?: boolean;
}

/**
 * Produce an accessibility snapshot of a DOM subtree.
 *
 * @param root - Element to walk. Defaults to ``document.body``.
 * @param options - Snapshot options; see ``SnapshotOptions``.
 * @returns Snapshot with a ``generic`` root containing the walked
 *     children, plus a client-side capture timestamp.
 */
export function snapshotDocument(
  root?: Element,
  options: SnapshotOptions = {},
): A11ySnapshot {
  const el = root ?? (typeof document !== "undefined" ? document.body : null);
  if (!el) {
    return {
      root: { ref: "e0", role: "generic" },
      captured_at: Date.now(),
    };
  }
  const opts: WalkOptions = { trackViewport: options.trackViewport ?? true };
  const budget: Budget = { count: 0 };
  const children = walkChildren(el, 0, budget, opts);
  return {
    root: {
      ref: getRef(el),
      role: "generic",
      ...(children.length > 0 ? { children } : {}),
    },
    captured_at: Date.now(),
  };
}
