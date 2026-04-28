/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { TaskStatus } from "@pipecat-ai/client-js";

/** A single progress update emitted by a worker. */
export interface TaskUpdate {
  /** Epoch ms when the update was emitted. */
  at: number;
  /** Worker-defined payload. Forwarded verbatim from `send_task_update`. */
  data: unknown;
}

/** One worker's view of a task within a group. */
export interface Task {
  /** The worker agent that owns this slot. */
  agentName: string;
  /**
   * `"running"` until a `task_completed` envelope arrives, then the
   * terminal status from the server.
   */
  status: TaskStatus;
  /** Epoch ms when the group started (same for every task in a group). */
  startedAt: number;
  /** Epoch ms when this worker's `task_completed` envelope arrived. */
  completedAt?: number;
  /** Updates emitted by the worker, in arrival order. */
  updates: TaskUpdate[];
  /** Final response payload from the worker. */
  response?: unknown;
}

/**
 * A user-facing task group: one server-side `user_task_group(...)`
 * dispatch and the workers it fanned out to.
 *
 * Group identity is the shared `taskId` (the server-side
 * `TaskGroup.task_id`). Per-worker identity within a group is
 * `agentName`.
 */
export interface TaskGroup {
  /** Shared identifier for every worker in the group. */
  taskId: string;
  /** Server-supplied label, if any. */
  label?: string | null;
  /**
   * Whether the client may call `cancelTask(taskId)`. Mirrors the
   * `cancellable` flag the server set on `user_task_group(...)`.
   */
  cancellable: boolean;
  /** Epoch ms when the `group_started` envelope arrived. */
  startedAt: number;
  /** Epoch ms when the `group_completed` envelope arrived. */
  completedAt?: number;
  /**
   * Aggregate status. `"running"` until `group_completed`; then
   * computed from per-task statuses: `"error"` if any task errored,
   * `"cancelled"` if any cancelled, otherwise `"completed"`.
   */
  status: "running" | "completed" | "cancelled" | "error";
  /** Workers in the group, in dispatch order. */
  tasks: Task[];
}

/** The shape returned by `useUITasks`. */
export interface UITasksAPI {
  /**
   * Every task group the provider has seen, in arrival order
   * (oldest first). Apps that want newest-first can reverse this in
   * their render path.
   */
  groups: TaskGroup[];
  /**
   * Ask the server to cancel an in-flight group. No-op when no
   * `UIAgentClient` is available, when the group is unknown to the
   * server, or when the group was registered with
   * `cancellable: false`.
   */
  cancelTask: (taskId: string, reason?: string) => void;
}
