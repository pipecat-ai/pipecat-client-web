/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RTVIEvent, type UIJobGroupData } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import React from "react";

import { PipecatClientProvider } from "../../src/PipecatClientProvider";
import { UIJobGroupsProvider } from "../../src/UIJobGroupsProvider";
import { useUIJobGroups } from "../../src/useUIJobGroups";

function makeMockPipecatClient() {
  const listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  const get = (event: string) => {
    let s = listeners.get(event);
    if (!s) {
      s = new Set();
      listeners.set(event, s);
    }
    return s;
  };
  return {
    cancelUIJobGroup: jest.fn(),
    on: jest.fn((event: string, handler: unknown) => {
      get(event).add(handler as (data: unknown) => void);
    }),
    off: jest.fn((event: string, handler: unknown) => {
      get(event).delete(handler as (data: unknown) => void);
    }),
    /** Fire RTVIEvent.UIJobGroup with the given envelope. */
    emit: (data: unknown) => {
      for (const l of get(RTVIEvent.UIJobGroup)) l(data);
    },
  };
}

// ui-job-group envelopes are now the inner `data` of a `ui-job-group` RTVI
// message; no top-level type field.
const groupStarted: UIJobGroupData = {
  kind: "group_started",
  job_id: "t1",
  agents: ["w1", "w2"],
  label: "Doing stuff",
  cancellable: true,
  at: 1700,
};
const w1Update: UIJobGroupData = {
  kind: "job_update",
  job_id: "t1",
  agent_name: "w1",
  data: { kind: "tool_call", tool: "WebSearch" },
  at: 1701,
};
const w1Completed: UIJobGroupData = {
  kind: "job_completed",
  job_id: "t1",
  agent_name: "w1",
  status: "completed",
  response: { ok: true },
  at: 1702,
};
const w2Completed: UIJobGroupData = {
  kind: "job_completed",
  job_id: "t1",
  agent_name: "w2",
  status: "completed",
  response: { ok: true },
  at: 1703,
};
const groupCompleted: UIJobGroupData = {
  kind: "group_completed",
  job_id: "t1",
  at: 1704,
};

type JobGroupsAPI = ReturnType<typeof useUIJobGroups>;

function renderWithProviders(
  pipecat = makeMockPipecatClient(),
  options: { maxGroups?: number } = {},
) {
  let api: JobGroupsAPI = {
    groups: [],
    cancelJobGroup: () => {},
    dismissJobGroup: () => {},
    clearCompleted: () => {},
  };
  const Probe: React.FC = () => {
    api = useUIJobGroups();
    return null;
  };
  const result = render(
    <PipecatClientProvider client={pipecat as never}>
      <UIJobGroupsProvider maxGroups={options.maxGroups}>
        <Probe />
      </UIJobGroupsProvider>
    </PipecatClientProvider>,
  );
  return {
    ...result,
    pipecat,
    getApi: () => api,
  };
}

describe("useUIJobGroups reducer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty list before any envelope arrives", () => {
    const { getApi } = renderWithProviders();

    expect(getApi().groups).toEqual([]);
  });

  it("creates a group with running jobs on group_started", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
    });

    const groups = getApi().groups;
    expect(groups).toHaveLength(1);
    const [g] = groups;
    expect(g.jobId).toBe("t1");
    expect(g.label).toBe("Doing stuff");
    expect(g.cancellable).toBe(true);
    expect(g.startedAt).toBe(1700);
    expect(g.completedAt).toBeUndefined();
    expect(g.status).toBe("running");
    expect(g.jobs.map((t) => t.agentName)).toEqual(["w1", "w2"]);
    expect(g.jobs.every((t) => t.status === "running")).toBe(true);
    expect(g.jobs.every((t) => t.updates.length === 0)).toBe(true);
  });

  it("appends job_update payloads to the matching job in arrival order", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Update);
      pipecat.emit({
        ...w1Update,
        data: { kind: "tool_call", tool: "WebFetch" },
        at: 1702,
      });
    });

    const w1 = getApi().groups[0].jobs.find((t) => t.agentName === "w1")!;
    expect(w1.updates).toEqual([
      { at: 1701, data: { kind: "tool_call", tool: "WebSearch" } },
      { at: 1702, data: { kind: "tool_call", tool: "WebFetch" } },
    ]);
    // The other worker is untouched.
    const w2 = getApi().groups[0].jobs.find((t) => t.agentName === "w2")!;
    expect(w2.updates).toEqual([]);
  });

  it("transitions a job from running to completed on job_completed", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Completed);
    });

    const w1 = getApi().groups[0].jobs.find((t) => t.agentName === "w1")!;
    expect(w1.status).toBe("completed");
    expect(w1.completedAt).toBe(1702);
    expect(w1.response).toEqual({ ok: true });
  });

  it("group is running until group_completed arrives, then aggregates", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Completed);
      pipecat.emit(w2Completed);
    });
    expect(getApi().groups[0].status).toBe("running");

    act(() => {
      pipecat.emit(groupCompleted);
    });
    const g = getApi().groups[0];
    expect(g.status).toBe("completed");
    expect(g.completedAt).toBe(1704);
  });

  it("keeps the group running when group_completed arrives before all workers finish", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Completed);
      pipecat.emit(groupCompleted);
    });

    const g = getApi().groups[0];
    expect(g.status).toBe("running");
    expect(g.completedAt).toBe(1704);
    expect(g.jobs.find((t) => t.agentName === "w2")!.status).toBe("running");
  });

  it("aggregates to error when any worker errored", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Completed);
      pipecat.emit({ ...w2Completed, status: "error" });
      pipecat.emit(groupCompleted);
    });

    expect(getApi().groups[0].status).toBe("error");
  });

  it("aggregates to cancelled when a worker cancelled and none errored", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Completed);
      pipecat.emit({ ...w2Completed, status: "cancelled" });
      pipecat.emit(groupCompleted);
    });

    expect(getApi().groups[0].status).toBe("cancelled");
  });

  it("preserves arrival order for multiple groups", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit({ ...groupStarted, job_id: "t2", at: 1800 });
    });

    expect(getApi().groups.map((g) => g.jobId)).toEqual(["t1", "t2"]);
  });

  it("cancelJobGroup sends a first-class ui-cancel-job-group RTVI message with the job_id", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);

    act(() => {
      getApi().cancelJobGroup("t1", "user clicked cancel");
    });

    expect(pipecat.cancelUIJobGroup).toHaveBeenCalledWith(
      "t1",
      "user clicked cancel",
    );
  });

  it("dismissJobGroup refuses running groups and removes completed groups", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit({ ...groupStarted, job_id: "t2", at: 1800 });
      pipecat.emit({ ...w1Completed, job_id: "t2" });
      pipecat.emit({ ...w2Completed, job_id: "t2" });
      pipecat.emit({ ...groupCompleted, job_id: "t2" });
    });

    act(() => {
      getApi().dismissJobGroup("t1");
      getApi().dismissJobGroup("t2");
    });

    expect(getApi().groups.map((g) => g.jobId)).toEqual(["t1"]);
  });

  it("clearCompleted removes terminal groups and keeps running groups", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat);
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit({ ...groupStarted, job_id: "t2", at: 1800 });
      pipecat.emit({ ...w1Completed, job_id: "t2" });
      pipecat.emit({ ...w2Completed, job_id: "t2", status: "error" });
      pipecat.emit({ ...groupCompleted, job_id: "t2" });
      pipecat.emit({ ...groupStarted, job_id: "t3", at: 1900 });
      pipecat.emit({ ...w1Completed, job_id: "t3" });
      pipecat.emit({ ...w2Completed, job_id: "t3", status: "cancelled" });
      pipecat.emit({ ...groupCompleted, job_id: "t3" });
    });

    act(() => {
      getApi().clearCompleted();
    });

    expect(getApi().groups.map((g) => g.jobId)).toEqual(["t1"]);
  });

  it("maxGroups drops oldest terminal groups but keeps running groups", () => {
    const pipecat = makeMockPipecatClient();

    const { getApi } = renderWithProviders(pipecat, { maxGroups: 2 });
    act(() => {
      pipecat.emit(groupStarted);
      for (const jobId of ["t2", "t3", "t4"]) {
        pipecat.emit({ ...groupStarted, job_id: jobId });
        pipecat.emit({ ...w1Completed, job_id: jobId });
        pipecat.emit({ ...w2Completed, job_id: jobId });
        pipecat.emit({ ...groupCompleted, job_id: jobId });
      }
    });

    expect(getApi().groups.map((g) => g.jobId)).toEqual(["t1", "t4"]);
  });

  it("default API is a no-op when no provider is mounted", () => {
    let api: JobGroupsAPI = {
      groups: [],
      cancelJobGroup: () => {},
      dismissJobGroup: () => {},
      clearCompleted: () => {},
    };
    const Probe: React.FC = () => {
      api = useUIJobGroups();
      return null;
    };

    render(<Probe />);

    expect(api.groups).toEqual([]);
    expect(() => api.cancelJobGroup("t1")).not.toThrow();
    expect(() => api.dismissJobGroup("t1")).not.toThrow();
    expect(() => api.clearCompleted()).not.toThrow();
  });
});
