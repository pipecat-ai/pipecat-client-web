/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { RTVIEvent, type UIJobGroupData } from "@pipecat-ai/client-js";
import React, { useCallback, useEffect, useMemo, useReducer } from "react";

import { UIJobGroupsContext } from "./UIJobGroupsContext";
import type { Job, JobGroup, UIJobGroupsAPI } from "./uiJobGroupsTypes";
import { usePipecatClient } from "./usePipecatClient";
import { useRTVIClientEvent } from "./useRTVIClientEvent";

type State = JobGroup[];

type Action =
  | { type: "ui_job_group"; env: UIJobGroupData; maxGroups?: number }
  | { type: "dismiss_job_group"; jobId: string }
  | { type: "clear_completed" }
  | { type: "prune"; maxGroups?: number };

export interface UIJobGroupsProviderProps extends React.PropsWithChildren {
  /**
   * Maximum number of groups to retain. When exceeded, oldest
   * non-running groups are dropped first; running groups are never
   * dropped. Omitted means unbounded.
   */
  maxGroups?: number;
}

function aggregateStatus(jobs: Job[]): JobGroup["status"] {
  if (jobs.some((t) => t.status === "error" || t.status === "failed"))
    return "error";
  if (jobs.some((t) => t.status === "cancelled")) return "cancelled";
  if (jobs.some((t) => t.status === "running")) return "running";
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

function uiJobGroupReducer(state: State, env: UIJobGroupData): State {
  switch (env.kind) {
    case "group_started":
      // Defensive: replace any prior group with the same job_id.
      // job_ids are uuids on the server so a real collision is
      // unexpected; this just keeps the reducer total.
      return [
        ...state.filter((g) => g.jobId !== env.job_id),
        {
          jobId: env.job_id,
          label: env.label ?? null,
          cancellable: env.cancellable,
          startedAt: env.at,
          status: "running",
          jobs: env.agents.map((agentName) => ({
            agentName,
            status: "running",
            startedAt: env.at,
            updates: [],
          })),
        },
      ];
    case "job_update":
      return state.map((g) =>
        g.jobId !== env.job_id
          ? g
          : {
              ...g,
              jobs: g.jobs.map((t) =>
                t.agentName !== env.agent_name
                  ? t
                  : {
                      ...t,
                      updates: [...t.updates, { at: env.at, data: env.data }],
                    },
              ),
            },
      );
    case "job_completed":
      return state.map((g) =>
        g.jobId !== env.job_id
          ? g
          : {
              ...g,
              jobs: g.jobs.map((t) =>
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
        g.jobId !== env.job_id
          ? g
          : {
              ...g,
              completedAt: env.at,
              status: aggregateStatus(g.jobs),
            },
      );
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ui_job_group":
      return applyMaxGroups(uiJobGroupReducer(state, action.env), action.maxGroups);
    case "dismiss_job_group":
      return state.filter(
        (group) =>
          group.jobId !== action.jobId || group.status === "running",
      );
    case "clear_completed":
      return state.filter((group) => group.status === "running");
    case "prune":
      return applyMaxGroups(state, action.maxGroups);
  }
}

/**
 * Provides a structured view of every user job group dispatched
 * by the server, derived from `ui-job-group` envelopes.
 *
 * Mount this somewhere under `PipecatClientProvider`. Children call
 * `useUIJobGroups()` to read the current groups and to issue
 * cancellation requests.
 *
 * Mounting is opt-in: apps that don't surface job progress don't
 * pay the reducer cost. The provider holds a single reducer; its
 * cost scales with the number of `ui-job-group` envelopes received.
 */
export const UIJobGroupsProvider: React.FC<UIJobGroupsProviderProps> = ({
  children,
  maxGroups,
}) => {
  const client = usePipecatClient();
  const [groups, dispatch] = useReducer(reducer, []);

  useEffect(() => {
    dispatch({ type: "prune", maxGroups });
  }, [maxGroups]);

  useRTVIClientEvent(
    RTVIEvent.UIJobGroup,
    useCallback(
      (env: UIJobGroupData) => dispatch({ type: "ui_job_group", env, maxGroups }),
      [maxGroups],
    ),
  );

  const cancelJobGroup = useCallback(
    (jobId: string, reason?: string) => {
      client?.cancelUIJobGroup(jobId, reason);
    },
    [client],
  );

  const dismissJobGroup = useCallback((jobId: string) => {
    dispatch({ type: "dismiss_job_group", jobId });
  }, []);

  const clearCompleted = useCallback(() => {
    dispatch({ type: "clear_completed" });
  }, []);

  const value = useMemo<UIJobGroupsAPI>(
    () => ({
      groups,
      cancelJobGroup,
      dismissJobGroup,
      clearCompleted,
    }),
    [groups, cancelJobGroup, dismissJobGroup, clearCompleted],
  );

  return (
    <UIJobGroupsContext.Provider value={value}>{children}</UIJobGroupsContext.Provider>
  );
};
UIJobGroupsProvider.displayName = "UIJobGroupsProvider";
