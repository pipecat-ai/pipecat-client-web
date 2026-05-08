/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent, type UITaskData } from "@pipecat-ai/client-js";
import React, { useCallback, useMemo, useReducer } from "react";

import { UITasksContext } from "./UITasksContext";
import type { Task, TaskGroup, UITasksAPI } from "./uiTasksTypes";
import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

type State = TaskGroup[];

function aggregateStatus(tasks: Task[]): TaskGroup["status"] {
  if (tasks.some((t) => t.status === "error" || t.status === "failed"))
    return "error";
  if (tasks.some((t) => t.status === "cancelled")) return "cancelled";
  return "completed";
}

function reducer(state: State, env: UITaskData): State {
  switch (env.kind) {
    case "group_started":
      // Defensive: replace any prior group with the same task_id.
      // task_ids are uuids on the server so a real collision is
      // unexpected; this just keeps the reducer total.
      return [
        ...state.filter((g) => g.taskId !== env.task_id),
        {
          taskId: env.task_id,
          label: env.label ?? null,
          cancellable: env.cancellable,
          startedAt: env.at,
          status: "running",
          tasks: env.agents.map((agentName) => ({
            agentName,
            status: "running",
            startedAt: env.at,
            updates: [],
          })),
        },
      ];
    case "task_update":
      return state.map((g) =>
        g.taskId !== env.task_id
          ? g
          : {
              ...g,
              tasks: g.tasks.map((t) =>
                t.agentName !== env.agent_name
                  ? t
                  : {
                      ...t,
                      updates: [...t.updates, { at: env.at, data: env.data }],
                    },
              ),
            },
      );
    case "task_completed":
      return state.map((g) =>
        g.taskId !== env.task_id
          ? g
          : {
              ...g,
              tasks: g.tasks.map((t) =>
                t.agentName !== env.agent_name
                  ? t
                  : {
                      ...t,
                      status: env.status,
                      completedAt: env.at,
                      response: env.response,
                    },
              ),
            },
      );
    case "group_completed":
      return state.map((g) =>
        g.taskId !== env.task_id
          ? g
          : {
              ...g,
              completedAt: env.at,
              status: aggregateStatus(g.tasks),
            },
      );
  }
}

/**
 * Provides a structured view of every user task group dispatched
 * by the server, derived from `ui-task` envelopes.
 *
 * Mount this somewhere under `PipecatClientProvider`. Children call
 * `useUITasks()` to read the current groups and to issue
 * cancellation requests.
 *
 * Mounting is opt-in: apps that don't surface task progress don't
 * pay the reducer cost. The provider holds a single reducer; its
 * cost scales with the number of `ui.task` envelopes received.
 */
export const UITasksProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const client = usePipecatClient();
  const [groups, dispatch] = useReducer(reducer, [] as State);

  useRTVIClientEvent(
    RTVIEvent.UITask,
    useCallback((env: UITaskData) => dispatch(env), []),
  );

  const cancelTask = useCallback(
    (taskId: string, reason?: string) => {
      client?.cancelUITask(taskId, reason);
    },
    [client],
  );

  const value = useMemo<UITasksAPI>(
    () => ({ groups, cancelTask }),
    [groups, cancelTask],
  );

  return (
    <UITasksContext.Provider value={value}>{children}</UITasksContext.Provider>
  );
};
UITasksProvider.displayName = "UITasksProvider";
