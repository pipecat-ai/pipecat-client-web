/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * RTVI client-message type used for UI events sent from client to server.
 *
 * Kept as a string constant so developers can use it directly with
 * `PipecatClient.sendClientMessage` if they choose not to use `UIAgentClient`.
 */
export const UI_EVENT_MESSAGE_TYPE = "ui.event";

/**
 * Discriminator written into the `data` field of the `RTVIServerMessage`
 * carrying a UI command.
 *
 * The server emits `{ type: "ui.command", name, payload }`; the client
 * dispatcher filters on this value before invoking the registered
 * handler.
 */
export const UI_COMMAND_MESSAGE_TYPE = "ui.command";

/**
 * Shape of the payload sent over the wire for a UI event.
 *
 * The outer RTVI envelope is `{ t: "ui.event", d: UIEventEnvelope }`;
 * `UIEventEnvelope` is the `d` field contents.
 */
export interface UIEventEnvelope<T = unknown> {
  /** App-defined event name. */
  name: string;
  /** App-defined payload. Schemaless by design. */
  payload: T;
}

/**
 * Shape of the `data` field inside an `RTVIServerMessage` carrying a
 * UI command. The outer `RTVIEvent.ServerMessage` handler receives an
 * object of this shape.
 */
export interface UICommandEnvelope<T = unknown> {
  type: typeof UI_COMMAND_MESSAGE_TYPE;
  /** App-defined command name. */
  name: string;
  /** App-defined payload. */
  payload: T;
}

/**
 * Signature for a handler passed to
 * `UIAgentClient.registerCommandHandler`.
 */
export type UICommandHandler<T = unknown> = (
  payload: T,
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Standard command payload types (mirror pipecat_subagents.agents.ui_commands)
// ---------------------------------------------------------------------------

/** Payload for the built-in `toast` command. */
export interface ToastPayload {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  image_url?: string | null;
  duration_ms?: number | null;
}

/** Payload for the built-in `navigate` command. */
export interface NavigatePayload {
  view: string;
  params?: Record<string, unknown> | null;
}

/** Payload for the built-in `scroll_to` command. */
export interface ScrollToPayload {
  /**
   * Snapshot ref (e.g. ``"e42"``) assigned by the a11y walker. When
   * set, the standard handler resolves this first; use when the server
   * is referencing an element it saw in ``<ui_state>``.
   */
  ref?: string | null;
  /**
   * Element id (``document.getElementById``). Used as a fallback when
   * ``ref`` is not set or no longer resolves.
   */
  target_id?: string | null;
  /** Typically `"smooth"` or `"instant"`. Clients may ignore. */
  behavior?: string | null;
}

/** Payload for the built-in `highlight` command. */
export interface HighlightPayload {
  ref?: string | null;
  target_id?: string | null;
  duration_ms?: number | null;
}

/** Payload for the built-in `focus` command. */
export interface FocusPayload {
  ref?: string | null;
  target_id?: string | null;
}

// ---------------------------------------------------------------------------
// Structural awareness: a11y snapshot
// ---------------------------------------------------------------------------

/**
 * Reserved UI event name carrying an accessibility snapshot from the
 * client to the server. `UIAgent` recognizes this name and stores the
 * payload in `_latest_snapshot` without dispatching to `@on_ui_event`
 * handlers or injecting a `<ui_event>` developer message.
 *
 * Underscore-prefixed to signal SDK-internal and avoid colliding with
 * app-defined event names.
 */
export const UI_SNAPSHOT_EVENT_NAME = "__ui_snapshot";

/**
 * One node in the accessibility snapshot tree.
 *
 * Shape is modeled on Playwright's accessibility snapshot and the
 * Playwright MCP server's LLM-facing serialization. Portable across
 * web, iOS (UIAccessibility), and Android (AccessibilityNodeInfo).
 */
export interface A11yNode {
  /**
   * Stable reference id of the form ``e{N}``. The same DOM node keeps
   * the same ref across snapshots for as long as it is mounted. Lets
   * the LLM cross-reference elements between turns ("the button I
   * mentioned earlier").
   */
  ref: string;
  /** ARIA role (explicit or tag-derived). */
  role: string;
  /** Accessible name, truncated to 100 chars. */
  name?: string;
  /** Current value for inputs (omitted for passwords), progress, etc. */
  value?: string;
  /** Short state tags: "focused", "expanded", "checked", "disabled", "selected". */
  state?: string[];
  /** Heading level, 1-6. */
  level?: number;
  /**
   * Column count for grid-like containers. Populated from
   * ``aria-colcount`` on the element. Lets the LLM compute
   * row/column positions from the flat reading order of children.
   */
  colcount?: number;
  /**
   * Row count for grid-like containers. Populated from
   * ``aria-rowcount`` on the element.
   */
  rowcount?: number;
  /** Child nodes. */
  children?: A11yNode[];
}

/**
 * Shape of the payload inside a `__ui_snapshot` UI event.
 *
 * A full tree is sent on each update; the server keeps the latest and
 * renders it into `<ui_state>...</ui_state>` when an agent injects it.
 */
export interface A11ySnapshot {
  /** The root of the accessibility tree (usually `document.body`'s node). */
  root: A11yNode;
  /** Client-side timestamp (ms since epoch) when the snapshot was taken. */
  captured_at: number;
}
