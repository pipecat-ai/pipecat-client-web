/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import type { JobStatus } from "@pipecat-ai/client-js";

/** A single progress update emitted by a worker. */
export interface JobUpdate {
  /** Epoch ms when the update was emitted. */
  at: number;
  /** Worker-defined payload. Forwarded verbatim from `send_job_update`. */
  data: unknown;
}

/** One worker's view of a job within a group. */
export interface Job {
  /** The worker that owns this slot. */
  workerName: string;
  /**
   * `"running"` until a `job_completed` envelope arrives, then the
   * terminal status from the server.
   */
  status: JobStatus;
  /** Epoch ms when the group started (same for every job in a group). */
  startedAt: number;
  /** Epoch ms when this worker's `job_completed` envelope arrived. */
  completedAt?: number;
  /** Updates emitted by the worker, in arrival order. */
  updates: JobUpdate[];
  /** Final response payload from the worker. */
  response?: unknown;
}

/**
 * A user-facing job group: one server-side `user_job_group(...)`
 * dispatch and the workers it fanned out to.
 *
 * Group identity is the shared `jobId` (the server-side
 * job-group id). Per-worker identity within a group is
 * `workerName`.
 */
export interface JobGroup {
  /** Shared identifier for every worker in the group. */
  jobId: string;
  /** Server-supplied label, if any. */
  label?: string | null;
  /**
   * Whether the client may call `cancelJobGroup(jobId)`. Mirrors the
   * `cancellable` flag the server set on `user_job_group(...)`.
   */
  cancellable: boolean;
  /** Epoch ms when the `group_started` envelope arrived. */
  startedAt: number;
  /** Epoch ms when the `group_completed` envelope arrived. */
  completedAt?: number;
  /**
   * Aggregate status. `"running"` until `group_completed`; then
   * computed from per-job statuses: `"error"` if any job errored,
   * `"cancelled"` if any cancelled, otherwise `"completed"`.
   */
  status: "running" | "completed" | "cancelled" | "error";
  /** Workers in the group, in dispatch order. */
  jobs: Job[];
}

/** The shape returned by `useUIJobGroups`. */
export interface UIJobGroupsAPI {
  /**
   * Every job group the provider has seen, in arrival order
   * (oldest first). By default this list is unbounded for the
   * lifetime of the provider; apps can call `dismissJobGroup`,
   * `clearCompleted`, or configure `UIJobGroupsProvider.maxGroups` to
   * keep long-lived sessions bounded.
   */
  groups: JobGroup[];
  /**
   * Ask the server to cancel an in-flight group. No-op when no
   * `PipecatClient` is available, when the group is unknown to the
   * server, or when the group was registered with
   * `cancellable: false`.
   */
  cancelJobGroup: (jobId: string, reason?: string) => void;
  /**
   * Remove a non-running group from local UI state. Running groups
   * are kept so in-flight work cannot disappear from the UI.
   */
  dismissJobGroup: (jobId: string) => void;
  /** Remove every non-running group from local UI state. */
  clearCompleted: () => void;
}
