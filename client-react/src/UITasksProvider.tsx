/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent, type UITaskData } from "@pipecat-ai/client-js";
import React, { useCallback, useEffect, useMemo, useReducer } from "react";

import { UITasksContext } from "./UITasksContext";
import type { Task, TaskGroup, UITasksAPI } from "./uiTasksTypes";
import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

type State = TaskGroup[];

type Action =
  | { type: "ui_task"; env: UITaskData; maxGroups?: number }
  | { type: "dismiss_task"; taskId: string }
  | { type: "clear_completed" }
  | { type: "prune"; maxGroups?: number };

export interface UITasksProviderProps extends React.PropsWithChildren {
  /**
   * Maximum number of groups to retain. When exceeded, oldest
   * non-running groups are dropped first; running groups are never
   * dropped. Omitted means unbounded.
   */
  maxGroups?: number;
}

function aggregateStatus(tasks: Task[]): TaskGroup["status"] {
  if (tasks.some((t) => t.status === "error" || t.status === "failed"))
    return "error";
  if (tasks.some((t) => t.status === "cancelled")) return "cancelled";
  if (tasks.some((t) => t.status === "running")) return "running";
  return "completed";
}

function applyMaxGroups(state: State, maxGroups?: number): State {
  if (maxGroups === undefined || maxGroups < 0 || state.length <= maxGroups) {
    return state;
  }

  let overflow = state.length - maxGroups;
  const next: State = [];
  for (const group of state) {
    if (overflow > 0 && group.status !== "running") {
      overflow -= 1;
      continue;
    }
    next.push(group);
  }
  return next;
}

function uiTaskReducer(state: State, env: UITaskData): State {
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

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ui_task":
      return applyMaxGroups(uiTaskReducer(state, action.env), action.maxGroups);
    case "dismiss_task":
      return state.filter(
        (group) =>
          group.taskId !== action.taskId || group.status === "running",
      );
    case "clear_completed":
      return state.filter((group) => group.status === "running");
    case "prune":
      return applyMaxGroups(state, action.maxGroups);
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
export const UITasksProvider: React.FC<UITasksProviderProps> = ({
  children,
  maxGroups,
}) => {
  const client = usePipecatClient();
  const [groups, dispatch] = useReducer(reducer, []);

  useEffect(() => {
    dispatch({ type: "prune", maxGroups });
  }, [maxGroups]);

  useRTVIClientEvent(
    RTVIEvent.UITask,
    useCallback(
      (env: UITaskData) => dispatch({ type: "ui_task", env, maxGroups }),
      [maxGroups],
    ),
  );

  const cancelTask = useCallback(
    (taskId: string, reason?: string) => {
      client?.cancelUITask(taskId, reason);
    },
    [client],
  );

  const dismissTask = useCallback((taskId: string) => {
    dispatch({ type: "dismiss_task", taskId });
  }, []);

  const clearCompleted = useCallback(() => {
    dispatch({ type: "clear_completed" });
  }, []);

  const value = useMemo<UITasksAPI>(
    () => ({
      groups,
      cancelTask,
      dismissTask,
      clearCompleted,
    }),
    [groups, cancelTask, dismissTask, clearCompleted],
  );

  return (
    <UITasksContext.Provider value={value}>{children}</UITasksContext.Provider>
  );
};
UITasksProvider.displayName = "UITasksProvider";
