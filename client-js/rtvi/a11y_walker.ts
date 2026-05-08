/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * Framework-agnostic walker that produces an accessibility snapshot
 * from a DOM subtree. Pure browser APIs (no React, no framework
 * dependencies), so it works from any vanilla-JS runtime that has a
 * ``document``.
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

import type { A11yNode, A11ySelection, A11ySnapshot } from "../rtvi/ui";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const MAX_DEPTH = 10;
const MAX_NODES = 200;
const MAX_CHILDREN_PER_NODE = 50;
const NAME_MAX = 100;
// Tighter cap on emitted ``<option>`` children. Country / state pickers
// can have hundreds of entries; truncating at 20 keeps the snapshot
// useful without ballooning LLM context.
const MAX_SELECT_OPTIONS = 20;
// Selections benefit from preserving paragraph structure, but the agent
// only needs enough text to disambiguate the referent. 2000 chars is
// roughly 500 tokens — meaningful context without dominating the
// ``<ui_state>`` injection.
const SELECTION_TEXT_MAX = 2000;

// ---------------------------------------------------------------------------
// Ref registry: stable ``e{N}`` IDs per DOM node, persist as long as the
// node is mounted. WeakMap keeps us from leaking detached nodes.
// ---------------------------------------------------------------------------

const refMap = new WeakMap<Element, string>();
// Reverse index from ref string back to element, so command handlers
// (e.g. ``scroll_to``) can resolve a server-supplied ref like
// ``"e42"`` back to a live DOM node. Prefer ``WeakRef`` so entries
// can become stale after unmount, but fall back to a strong reference
// in older browsers / embedded webviews that do not implement it.
type RefEntry = WeakRef<Element> | Element;
const WeakRefCtor: (new (target: Element) => WeakRef<Element>) | undefined =
  typeof WeakRef === "undefined" ? undefined : WeakRef;
const refToElement = new Map<string, RefEntry>();
let refCounter = 0;

function getRef(el: Element): string {
  const existing = refMap.get(el);
  if (existing) return existing;
  const ref = `e${++refCounter}`;
  refMap.set(el, ref);
  refToElement.set(ref, WeakRefCtor ? new WeakRefCtor(el) : el);
  return ref;
}

/**
 * Resolve a ref string like ``"e42"`` back to a live DOM element.
 * Returns ``null`` if the ref was never assigned or the element has
 * since been garbage-collected. Command handlers use this to
 * act on nodes the server referenced from a snapshot.
 */
export function findElementByRef(ref: string): Element | null {
  const entry = refToElement.get(ref);
  if (!entry) return null;
  const el = "deref" in entry ? entry.deref() : entry;
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

/**
 * Inverse of ``findElementByRef``: return the snapshot ref the walker
 * has assigned to ``el``, if any. Returns ``null`` for elements the
 * walker has not yet visited (refs are assigned during snapshot
 * walking; an element only has a ref if it appeared in a previous
 * snapshot).
 *
 * Useful when an app needs to associate a user interaction (e.g.
 * the current text selection, a click on a non-tracked element) with
 * a snapshot-known node. Walk up ``el.parentElement`` looking for the
 * first ancestor that has a ref to find the closest snapshot-known
 * container.
 */
export function findRefForElement(el: Element): string | null {
  return refMap.get(el) ?? null;
}

/** Reset the ref counter and registry. Test-only helper. */
export function __resetRefsForTesting(): void {
  refCounter = 0;
  refToElement.clear();
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

const LEAF_ROLES = new Set([...INTERACTIVE_ROLES, "heading", "img"]);

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
    case "p":
      // Promote prose containers so paragraph-level deixis works:
      // selection anchors at the enclosing paragraph, and the agent
      // can address individual paragraphs by ref for select_text /
      // scroll_to / highlight. Pure-wrapper flattening would lose
      // both. Paragraphs are walked as non-leaf so inline links and
      // emphasis still nest underneath.
      return "paragraph";
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

  // Leaf interactive / heading / link roles, plus paragraphs, use
  // text from descendants. Paragraphs aren't leaves (they may carry
  // nested links / emphasis) but we want the prose preview as the
  // node's name so the LLM has the gist without expanding text
  // children. ``collectAccessibleText`` joins sibling children with
  // spaces so ``<span>Foo</span><span>Bar</span>`` yields ``"Foo Bar"``
  // rather than ``"FooBar"``.
  if (LEAF_ROLES.has(role) || role === "paragraph") {
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
    // Prefer the selected option's visible text; the raw ``value`` is
    // often a numeric id or sentinel that means nothing to a reader.
    const selected = el.selectedOptions[0];
    const text = selected?.text?.trim();
    if (text) return text;
    return el.value || undefined;
  }
  return undefined;
}

function getState(el: Element): string[] {
  const state: string[] = [];
  if (el.ownerDocument.activeElement === el) state.push("focused");
  if (el.getAttribute("aria-expanded") === "true") state.push("expanded");
  if (el.getAttribute("aria-selected") === "true") state.push("selected");
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
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
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
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
  inheritSkipTextNodes = false,
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
    // Inherit the caller's text-skip flag so e.g. a <span> inside a
    // <p> doesn't leak its text as a duplicate text-role node.
    return walkChildren(el, depth, budget, opts, {
      skipTextNodes: inheritSkipTextNodes,
    });
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
    // For paragraphs the text content is already in the node's
    // ``name``. Skip raw text-node children so the same prose
    // doesn't appear twice in ``<ui_state>``.
    const skipTextNodes = role === "paragraph";
    const children = walkChildren(el, depth + 1, budget, opts, { skipTextNodes });
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
  } else if (el instanceof HTMLSelectElement) {
    // Combobox is a leaf role, but for native ``<select>`` we synthesize
    // ``option`` children so the agent can see all available choices,
    // not just the one currently selected. Without this, an LLM has no
    // way to know what other values it could ask the user to pick.
    const options = collectSelectOptions(el, budget, node.ref);
    if (options.length > 0) node.children = options;
  }

  return [node];
}

function collectSelectOptions(
  select: HTMLSelectElement,
  budget: Budget,
  parentRef: string,
): A11yNode[] {
  const out: A11yNode[] = [];
  const all = select.options;
  let emitted = 0;
  for (let i = 0; i < all.length; i++) {
    if (budget.count >= MAX_NODES) break;
    const opt = all[i];
    if (opt.hidden) continue;
    if (opt.getAttribute("aria-hidden") === "true") continue;
    if (emitted >= MAX_SELECT_OPTIONS) {
      budget.count++;
      out.push({
        ref: `${parentRef}.more`,
        role: "ellipsis",
        name: `${all.length - emitted} more`,
      });
      break;
    }
    budget.count++;
    emitted++;
    const text = (opt.text || opt.value || "").trim();
    const optNode: A11yNode = {
      ref: getRef(opt),
      role: "option",
      name: truncate(text),
    };
    const state: string[] = [];
    if (opt.selected) state.push("selected");
    if (opt.disabled) state.push("disabled");
    if (state.length) optNode.state = state;
    out.push(optNode);
  }
  return out;
}

interface WalkChildrenOptions {
  /**
   * When ``true``, raw text-node children are not emitted. Used by
   * ``paragraph`` whose ``name`` already carries the prose; emitting
   * the same text again as ``- text "..."`` children would duplicate
   * it in ``<ui_state>``.
   */
  skipTextNodes?: boolean;
}

function walkChildren(
  el: Element,
  depth: number,
  budget: Budget,
  opts: WalkOptions,
  childOpts: WalkChildrenOptions = {},
): A11yNode[] {
  const out: A11yNode[] = [];
  // Iterate ``childNodes`` rather than ``children`` so we pick up
  // direct text nodes too (e.g. track titles sitting in a pure-wrapper
  // ``<div>`` next to a Play button). Without this, wrapper divs that
  // carry meaningful text lose it entirely when they get flattened.
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 3 /* TEXT_NODE */) {
      if (childOpts.skipTextNodes) continue;
      const text = collapseWhitespace(child.textContent ?? "");
      if (text) {
        if (budget.count >= MAX_NODES) break;
        budget.count++;
        out.push({ ref: "", role: "text", name: truncate(text) });
      }
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const nodes = walk(
        child as Element,
        depth,
        budget,
        opts,
        childOpts.skipTextNodes,
      );
      for (const n of nodes) out.push(n);
      if (budget.count >= MAX_NODES) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Look up a ref for ``el`` without assigning a new one.
 *
 * Selections frequently land on text nodes whose closest element
 * ancestor is a structural tag like ``<p>`` or ``<span>`` that the
 * walker treats as a pure wrapper and so doesn't ref. Climb the
 * ancestor chain until we find a walked element.
 *
 * Returns ``null`` when an ``aria-hidden="true"`` or
 * ``data-a11y-exclude`` ancestor is encountered before any
 * ref-bearing element, so selections inside subtrees the app has
 * explicitly hidden from accessibility don't leak into the snapshot.
 */
function findRefBearingAncestor(start: Element | null): Element | null {
  let el: Element | null = start;
  while (el) {
    if (
      el.getAttribute("aria-hidden") === "true" ||
      el.hasAttribute("data-a11y-exclude")
    ) {
      return null;
    }
    if (refMap.has(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function clampSelectionText(text: string): string {
  if (text.length <= SELECTION_TEXT_MAX) return text;
  return text.slice(0, SELECTION_TEXT_MAX - 1) + "…";
}

/**
 * Capture the user's current text selection as an ``A11ySelection``.
 *
 * Returns ``null`` when nothing is selected, the selection is
 * collapsed (a bare cursor position), or no ancestor of the
 * selection has been assigned a ref by the walker (e.g. selection
 * landed entirely inside an ``aria-hidden`` subtree).
 *
 * Input/textarea takes precedence over the document selection
 * because ``window.getSelection().toString()`` is empty for those
 * elements; we read ``selectionStart`` / ``selectionEnd`` directly
 * and surface them as offsets so a round-trip ``select_text``
 * command can reproduce the range.
 */
export function serializeSelection(): A11ySelection | null {
  if (typeof document === "undefined") return null;

  // Input / textarea: own selection model, distinct from
  // ``window.getSelection()``.
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (start !== null && end !== null && start !== end) {
      const ref = refMap.get(active);
      if (!ref) return null;
      const text = active.value.slice(start, end);
      if (!text) return null;
      return {
        ref,
        text: clampSelectionText(text),
        start_offset: start,
        end_offset: end,
      };
    }
  }

  // Document selection.
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const text = sel.toString();
  if (!text) return null;

  const range = sel.getRangeAt(0);
  let common: Node | null = range.commonAncestorContainer;
  // Climb to the nearest element node first.
  while (common && common.nodeType !== 1 /* ELEMENT_NODE */) {
    common = common.parentNode;
  }
  const anchor = findRefBearingAncestor(common as Element | null);
  if (!anchor) return null;
  const ref = refMap.get(anchor);
  if (!ref) return null;

  return {
    ref,
    text: clampSelectionText(text),
  };
}

// ---------------------------------------------------------------------------
// Walker entry point
// ---------------------------------------------------------------------------

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
  // Capture selection after the walk so refs are populated for
  // anything visible on the page.
  const selection = serializeSelection();
  return {
    root: {
      ref: getRef(el),
      role: "generic",
      ...(children.length > 0 ? { children } : {}),
    },
    captured_at: Date.now(),
    ...(selection ? { selection } : {}),
  };
}
