/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

// ---------------------------------------------------------------------------
// Built-in command payload types (mirror pipecat_subagents.agents.ui_commands)
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
   * set, the default handler resolves this first; use when the server
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

/**
 * Payload for the built-in `click` command.
 *
 * Closes the form-fill loop for non-text inputs (checkboxes,
 * radios) and exposes the rest of the action vocabulary (submit
 * buttons, links, app-specific clickable nodes). The standard
 * handler refuses on `disabled` targets.
 *
 * For native `<select>`, prefer `set_input_value` (clicking
 * options doesn't reliably change the selection); for custom
 * comboboxes, apps wire their own command matching the library's
 * interaction model.
 */
export interface ClickPayload {
  ref?: string | null;
  target_id?: string | null;
}

/**
 * Payload for the built-in `set_input_value` command.
 *
 * Asks the client to write `value` into a text input, textarea, or
 * native `<select>`. The default handler refuses to write into
 * `disabled`, `readonly`, or `<input type="hidden">` targets so the
 * agent can't bypass UI affordances the user is meant to control.
 *
 * For text inputs and textareas, `replace: false` appends the value
 * to whatever is already in the field; the default replaces. The
 * flag is ignored for native `<select>` (a select either has the
 * value or doesn't; "appending" is meaningless).
 */
export interface SetInputValuePayload {
  ref?: string | null;
  target_id?: string | null;
  value: string;
  /** When omitted, defaults to `true` (replace existing value). */
  replace?: boolean | null;
}

/**
 * Payload for the built-in `select_text` command.
 *
 * Mirror of the read-side {@link A11ySelection}: the agent asks the
 * client to make a text selection on the page so the user can see
 * what content the agent is referring to. With `start_offset` /
 * `end_offset` omitted, the entire target's text is selected.
 *
 * Document elements use a `Range` over descendant text nodes and the
 * default handler walks them to convert character offsets into
 * `(textNode, offsetInNode)` pairs. `<input>` and `<textarea>`
 * targets use `setSelectionRange(start, end)` (or `el.select()` when
 * offsets are absent).
 */
export interface SelectTextPayload {
  ref?: string | null;
  target_id?: string | null;
  /** Character offset within the target where the selection starts. */
  start_offset?: number | null;
  /** End character offset, exclusive. */
  end_offset?: number | null;
}

// ---------------------------------------------------------------------------
// Structural awareness: a11y snapshot
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Task lifecycle protocol
// ---------------------------------------------------------------------------

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
 * Signature for a UI task lifecycle listener.
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
 * The user's current text selection, when one exists.
 *
 * Lets the agent ground deictic references like "this paragraph",
 * "what I selected", or "the highlighted text" against actual on-page
 * content rather than re-asking the user to repeat it.
 *
 * Document selections (selecting text across paragraphs, headings,
 * etc.) carry the closest common-ancestor element's ``ref`` plus the
 * full selected text. Offsets are not provided for document
 * selections because they would require walking text-node positions
 * inside the ancestor; the agent reasons over the ``text`` field.
 *
 * Input/textarea selections do carry ``start_offset`` and
 * ``end_offset`` (taken straight from
 * ``HTMLInputElement.selectionStart`` / ``selectionEnd``) so a
 * round-trip ``select_text`` command can reproduce the exact range.
 */
export interface A11ySelection {
  /**
   * Ref of the element that carries the selection. For document
   * selections this is the closest common-ancestor element with a
   * ref; for input/textarea it is the input element itself.
   */
  ref: string;
  /**
   * The selected text. Truncated at 2000 characters with a trailing
   * ellipsis to keep ``<ui_state>`` injections bounded.
   */
  text: string;
  /**
   * Character offset within the input's ``value`` where the
   * selection starts. Only set for ``<input>`` and ``<textarea>``.
   */
  start_offset?: number;
  /**
   * Character offset within the input's ``value`` where the
   * selection ends. Only set for ``<input>`` and ``<textarea>``.
   */
  end_offset?: number;
}

/**
 * Accessibility tree carried inside a first-class `ui-snapshot` RTVI
 * message.
 *
 * `PipecatClient.startUISnapshotStream(...)` sends snapshots with the
 * message data shape `{ tree: A11ySnapshot }`. A full tree is sent on
 * each update; the server keeps the latest and renders it into
 * `<ui_state>...</ui_state>` when an agent injects it.
 */
export interface A11ySnapshot {
  /** The root of the accessibility tree (usually `document.body`'s node). */
  root: A11yNode;
  /** Client-side timestamp (ms since epoch) when the snapshot was taken. */
  captured_at: number;
  /**
   * The user's current text selection, when one exists. Omitted when
   * nothing is selected (or the selection is collapsed to a single
   * cursor position with no characters in between). The server
   * renders this as a ``<selection ref="...">...</selection>`` block
   * inside ``<ui_state>``.
   */
  selection?: A11ySelection;
}
