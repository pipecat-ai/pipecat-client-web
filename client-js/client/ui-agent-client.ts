/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent } from "../rtvi";
import {
  UI_COMMAND_MESSAGE_TYPE,
  UI_EVENT_MESSAGE_TYPE,
  type UICommandHandler,
  type UIEventEnvelope,
} from "../rtvi/ui";
import type { PipecatClient } from "./client";

/**
 * Client-side surface for the UI Agent pattern.
 *
 * Wraps an existing `PipecatClient` with:
 *
 * - `sendEvent(name, payload)` for client → server events.
 * - `registerCommandHandler(name, handler)` for server → client
 *   commands; handlers dispatch on the command name extracted from
 *   `RTVIEvent.ServerMessage` payloads of type `"ui.command"`.
 *
 * Construction does not subscribe to anything. Call `attach()` to
 * start listening for `RTVIEvent.ServerMessage` and store the returned
 * detach function to stop. The React provider does this automatically
 * inside a `useEffect` so subscription lifecycle follows mount/unmount.
 */
export class UIAgentClient {
  private readonly _client: PipecatClient;
  private readonly _commandHandlers: Map<string, UICommandHandler> = new Map();

  constructor(client: PipecatClient) {
    this._client = client;
  }

  /** Underlying Pipecat client, exposed for escape-hatch access. */
  get pipecatClient(): PipecatClient {
    return this._client;
  }

  /**
   * Send a named UI event to the server.
   *
   * @param name - App-defined event name.
   * @param payload - App-defined payload. Optional.
   */
  sendEvent<T = unknown>(name: string, payload?: T): void {
    const envelope: UIEventEnvelope<T | undefined> = {
      name,
      payload: payload as T | undefined,
    };
    this._client.sendClientMessage(UI_EVENT_MESSAGE_TYPE, envelope);
  }

  /**
   * Register a handler for a named UI command.
   *
   * Overwrites any existing handler for the same name.
   */
  registerCommandHandler<T = unknown>(
    name: string,
    handler: UICommandHandler<T>,
  ): void {
    this._commandHandlers.set(name, handler as UICommandHandler);
  }

  /** Remove the handler previously registered for `name`, if any. */
  unregisterCommandHandler(name: string): void {
    this._commandHandlers.delete(name);
  }

  /** Remove all registered command handlers. */
  unregisterAllCommandHandlers(): void {
    this._commandHandlers.clear();
  }

  /**
   * Subscribe to `RTVIEvent.ServerMessage` on the underlying
   * `PipecatClient`. Returns a detach function that unsubscribes.
   *
   * Safe to call more than once: each call installs an independent
   * listener. Invoke the returned function to remove that listener.
   * The React provider calls this inside `useEffect` and uses the
   * returned function as the cleanup, so subscription lifecycle
   * follows React's mount/unmount cycle (including `StrictMode`'s
   * double-invoke in development).
   */
  attach(): () => void {
    const listener = (data: unknown) => this._handleServerMessage(data);
    this._client.on(RTVIEvent.ServerMessage, listener);
    return () => {
      this._client.off(RTVIEvent.ServerMessage, listener);
    };
  }

  private _handleServerMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;

    const envelope = data as {
      type?: unknown;
      name?: unknown;
      payload?: unknown;
    };
    if (envelope.type !== UI_COMMAND_MESSAGE_TYPE) return;
    if (typeof envelope.name !== "string") return;

    const handler = this._commandHandlers.get(envelope.name);
    if (!handler) return;

    // Fire-and-forget. If the handler rejects, let it surface to the
    // host's unhandled-rejection channel rather than swallowing.
    void handler(envelope.payload);
  }
}
