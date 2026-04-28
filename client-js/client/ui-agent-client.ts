/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent } from "../rtvi";
import {
  UI_CANCEL_TASK_EVENT_NAME,
  UI_COMMAND_MESSAGE_TYPE,
  UI_EVENT_MESSAGE_TYPE,
  UI_TASK_MESSAGE_TYPE,
  type UICommandHandler,
  type UIEventEnvelope,
  type UITaskEnvelope,
  type UITaskListener,
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
 * - `addTaskListener(listener)` for server → client task lifecycle
 *   events; listeners receive every `ui.task` envelope in arrival
 *   order. The React `useUITasks` hook is the recommended consumer.
 * - `cancelTask({ task_id, reason })` to ask the server to cancel
 *   an in-flight user task group. Honored only when the server
 *   registered the group with `cancellable=True`.
 *
 * Construction does not subscribe to anything. Call `attach()` to
 * start listening for `RTVIEvent.ServerMessage` and store the returned
 * detach function to stop. The React provider does this automatically
 * inside a `useEffect` so subscription lifecycle follows mount/unmount.
 */
export class UIAgentClient {
  private readonly _client: PipecatClient;
  private readonly _commandHandlers: Map<string, UICommandHandler> = new Map();
  private readonly _taskListeners: Set<UITaskListener> = new Set();

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
   * Subscribe a listener to every `ui.task` envelope.
   *
   * The listener fires for each lifecycle phase: `group_started`,
   * `task_update`, `task_completed`, `group_completed`. Switch on
   * `envelope.kind` to react to specific phases.
   *
   * Returns nothing; pair with `removeTaskListener` to unsubscribe.
   */
  addTaskListener(listener: UITaskListener): void {
    this._taskListeners.add(listener);
  }

  /** Remove a previously added task listener. */
  removeTaskListener(listener: UITaskListener): void {
    this._taskListeners.delete(listener);
  }

  /** Remove every task listener. */
  removeAllTaskListeners(): void {
    this._taskListeners.clear();
  }

  /**
   * Ask the server to cancel an in-flight user task group.
   *
   * Sends a reserved `__cancel_task` UI event the server's `UIAgent`
   * routes to `cancel_task`. The server honors the request only when
   * the group was registered with `cancellable: true`; otherwise the
   * request is silently ignored.
   *
   * @param task_id - The shared task identifier of the group to cancel.
   *     Read this from a `TaskGroup.taskId` (the `useUITasks` hook
   *     surfaces it) or from the `task_id` on any envelope you saw
   *     for the group.
   * @param reason - Optional human-readable reason logged on the
   *     server.
   */
  cancelTask(task_id: string, reason?: string): void {
    const payload: { task_id: string; reason?: string } = { task_id };
    if (reason !== undefined) payload.reason = reason;
    this.sendEvent(UI_CANCEL_TASK_EVENT_NAME, payload);
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
      kind?: unknown;
      payload?: unknown;
    };

    if (envelope.type === UI_COMMAND_MESSAGE_TYPE) {
      if (typeof envelope.name !== "string") return;
      const handler = this._commandHandlers.get(envelope.name);
      if (!handler) return;
      // Fire-and-forget. If the handler rejects, let it surface to the
      // host's unhandled-rejection channel rather than swallowing.
      void handler(envelope.payload);
      return;
    }

    if (envelope.type === UI_TASK_MESSAGE_TYPE) {
      if (typeof envelope.kind !== "string") return;
      if (this._taskListeners.size === 0) return;
      // Snapshot before iterating in case a listener mutates the set.
      const typed = data as UITaskEnvelope;
      for (const listener of Array.from(this._taskListeners)) {
        listener(typed);
      }
    }
  }
}
