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

// ---------------------------------------------------------------------------
// Task lifecycle protocol
// ---------------------------------------------------------------------------

/**
 * Discriminator written into the `data` field of an `RTVIServerMessage`
 * carrying a UI task lifecycle event.
 *
 * The server emits `{ type: "ui.task", kind, ... }`; the client
 * dispatcher filters on this value before invoking task listeners.
 */
export const UI_TASK_MESSAGE_TYPE = "ui.task";

/**
 * Reserved UI event name for cancelling an in-flight user task group.
 *
 * Sent from client to server with payload
 * `{ task_id: string, reason?: string }`. The server's `UIAgent`
 * routes this to `cancel_task` when the matching group was registered
 * with `cancellable: true`.
 *
 * Underscore-prefixed to signal SDK-internal.
 */
export const UI_CANCEL_TASK_EVENT_NAME = "__cancel_task";

/**
 * Status of a worker within a task group.
 *
 * Mirrors `pipecat_subagents.agents.task_context.TaskStatus`. Tasks
 * are surfaced to the client as `"running"` from the moment the
 * group_started envelope arrives. The terminal status is set when
 * `task_completed` arrives.
 */
export type TaskStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "failed"
  | "error";

/** Group dispatched: the worker list is now known. */
export interface UITaskGroupStartedEnvelope {
  type: typeof UI_TASK_MESSAGE_TYPE;
  kind: "group_started";
  /** Shared identifier for every task in the group. */
  task_id: string;
  /** Worker agent names in dispatch order. */
  agents: string[];
  /** Optional human-readable label set by the server. */
  label?: string | null;
  /** Whether the client may request cancellation via `cancelTask`. */
  cancellable: boolean;
  /** Epoch ms when the group started. */
  at: number;
}

/** Per-worker progress: `data` is whatever the worker passed to `send_task_update`. */
export interface UITaskUpdateEnvelope {
  type: typeof UI_TASK_MESSAGE_TYPE;
  kind: "task_update";
  task_id: string;
  /** The worker that produced this update. */
  agent_name: string;
  /** Worker-defined payload. Forwarded verbatim. */
  data: unknown;
  at: number;
}

/** Per-worker terminal: status + final response. */
export interface UITaskCompletedEnvelope {
  type: typeof UI_TASK_MESSAGE_TYPE;
  kind: "task_completed";
  task_id: string;
  agent_name: string;
  status: TaskStatus;
  /** Worker's final response payload. */
  response?: unknown;
  at: number;
}

/** Group terminal: every worker has responded (or the group was cancelled). */
export interface UITaskGroupCompletedEnvelope {
  type: typeof UI_TASK_MESSAGE_TYPE;
  kind: "group_completed";
  task_id: string;
  at: number;
}

/** Discriminated union of every `ui.task` envelope kind. */
export type UITaskEnvelope =
  | UITaskGroupStartedEnvelope
  | UITaskUpdateEnvelope
  | UITaskCompletedEnvelope
  | UITaskGroupCompletedEnvelope;

/**
 * Signature for a listener passed to `UIAgentClient.addTaskListener`.
 *
 * Receives every `ui.task` envelope in arrival order. Switch on
 * `envelope.kind` to react to specific lifecycle phases. The React
 * `useUITasks` hook is the recommended consumer for app code; this
 * lower-level listener is for hosts that want to drive their own
 * state.
 */
export type UITaskListener = (envelope: UITaskEnvelope) => void;

/**
 * One node in the accessibility snapshot tree.
 *
 * Shape is modeled on Playwright's accessibility snapshot and the
 * Playwright MCP server's LLM-facing serialization. Portable across
 * web, iOS (UIAccessibility), and Android (AccessibilityNodeInfo).
 *
 * Stability: this is the v1 wire format. Field names and semantics
 * are versioned via the SDK's package version; consumer servers
 * (e.g. `pipecat-subagents`'s `UIAgent`) track compatible client
 * releases in their own changelogs.
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
  /**
   * Short state tags. Known values: ``"focused"``, ``"selected"``,
   * ``"expanded"``, ``"checked"``, ``"disabled"``, ``"offscreen"``.
   * Apps may add their own, but should stick to single lowercase
   * words so they render cleanly as ``[tag]`` in ``<ui_state>``.
   */
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
