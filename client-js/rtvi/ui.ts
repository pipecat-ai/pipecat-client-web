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
  target_id: string;
  /** Typically `"smooth"` or `"instant"`. Clients may ignore. */
  behavior?: string | null;
}

/** Payload for the built-in `highlight` command. */
export interface HighlightPayload {
  target_id: string;
  duration_ms?: number | null;
}

/** Payload for the built-in `focus` command. */
export interface FocusPayload {
  target_id: string;
}
