/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { RTVIEvent, type UITaskEnvelope } from "@pipecat-ai/client-js";
import { act, render } from "@testing-library/react";
import React from "react";

import { UITasksProvider } from "../src/UITasksProvider";
import { usePipecatClient } from "../src/usePipecatClient";
import { useUITasks } from "../src/useUITasks";

jest.mock("../src/usePipecatClient", () => ({
  usePipecatClient: jest.fn(),
}));

const mockUsePipecatClient = usePipecatClient as unknown as jest.Mock;

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
    cancelUITask: jest.fn(),
    on: jest.fn((event: string, handler: unknown) => {
      get(event).add(handler as (data: unknown) => void);
    }),
    off: jest.fn((event: string, handler: unknown) => {
      get(event).delete(handler as (data: unknown) => void);
    }),
    /** Fire RTVIEvent.UITask with the given envelope. */
    emit: (data: unknown) => {
      for (const l of get(RTVIEvent.UITask)) l(data);
    },
  };
}

// ui-task envelopes are now the inner ``data`` of a ``ui-task`` RTVI
// message; no top-level type field.
const groupStarted: UITaskEnvelope = {
  kind: "group_started",
  task_id: "t1",
  agents: ["w1", "w2"],
  label: "Doing stuff",
  cancellable: true,
  at: 1700,
};
const w1Update: UITaskEnvelope = {
  kind: "task_update",
  task_id: "t1",
  agent_name: "w1",
  data: { kind: "tool_call", tool: "WebSearch" },
  at: 1701,
};
const w1Completed: UITaskEnvelope = {
  kind: "task_completed",
  task_id: "t1",
  agent_name: "w1",
  status: "completed",
  response: { ok: true },
  at: 1702,
};
const w2Completed: UITaskEnvelope = {
  kind: "task_completed",
  task_id: "t1",
  agent_name: "w2",
  status: "completed",
  response: { ok: true },
  at: 1703,
};
const groupCompleted: UITaskEnvelope = {
  kind: "group_completed",
  task_id: "t1",
  at: 1704,
};

type TasksAPI = ReturnType<typeof useUITasks>;

function renderWithProviders() {
  let api: TasksAPI = { groups: [], cancelTask: () => {} };
  const Probe: React.FC = () => {
    api = useUITasks();
    return null;
  };
  const result = render(
    <UITasksProvider>
      <Probe />
    </UITasksProvider>,
  );
  return {
    ...result,
    getApi: () => api,
  };
}

describe("useUITasks reducer", () => {
  beforeEach(() => {
    mockUsePipecatClient.mockReset();
  });

  it("returns an empty list before any envelope arrives", () => {
    mockUsePipecatClient.mockReturnValue(makeMockPipecatClient());

    const { getApi } = renderWithProviders();

    expect(getApi().groups).toEqual([]);
  });

  it("creates a group with running tasks on group_started", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();
    act(() => {
      pipecat.emit(groupStarted);
    });

    const groups = getApi().groups;
    expect(groups).toHaveLength(1);
    const [g] = groups;
    expect(g.taskId).toBe("t1");
    expect(g.label).toBe("Doing stuff");
    expect(g.cancellable).toBe(true);
    expect(g.startedAt).toBe(1700);
    expect(g.completedAt).toBeUndefined();
    expect(g.status).toBe("running");
    expect(g.tasks.map((t) => t.agentName)).toEqual(["w1", "w2"]);
    expect(g.tasks.every((t) => t.status === "running")).toBe(true);
    expect(g.tasks.every((t) => t.updates.length === 0)).toBe(true);
  });

  it("appends task_update payloads to the matching task in arrival order", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Update);
      pipecat.emit({
        ...w1Update,
        data: { kind: "tool_call", tool: "WebFetch" },
        at: 1702,
      });
    });

    const w1 = getApi().groups[0].tasks.find((t) => t.agentName === "w1")!;
    expect(w1.updates).toEqual([
      { at: 1701, data: { kind: "tool_call", tool: "WebSearch" } },
      { at: 1702, data: { kind: "tool_call", tool: "WebFetch" } },
    ]);
    // The other worker is untouched.
    const w2 = getApi().groups[0].tasks.find((t) => t.agentName === "w2")!;
    expect(w2.updates).toEqual([]);
  });

  it("transitions a task from running to completed on task_completed", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit(w1Completed);
    });

    const w1 = getApi().groups[0].tasks.find((t) => t.agentName === "w1")!;
    expect(w1.status).toBe("completed");
    expect(w1.completedAt).toBe(1702);
    expect(w1.response).toEqual({ ok: true });
  });

  it("group is running until group_completed arrives, then aggregates", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();
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

  it("aggregates to error when any worker errored", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();
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
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();
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
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();
    act(() => {
      pipecat.emit(groupStarted);
      pipecat.emit({ ...groupStarted, task_id: "t2", at: 1800 });
    });

    expect(getApi().groups.map((g) => g.taskId)).toEqual(["t1", "t2"]);
  });

  it("cancelTask sends a first-class ui-cancel-task RTVI message with the task_id", () => {
    const pipecat = makeMockPipecatClient();
    mockUsePipecatClient.mockReturnValue(pipecat);

    const { getApi } = renderWithProviders();

    act(() => {
      getApi().cancelTask("t1", "user clicked cancel");
    });

    expect(pipecat.cancelUITask).toHaveBeenCalledWith(
      "t1",
      "user clicked cancel",
    );
  });

  it("default API is a no-op when no provider is mounted", () => {
    mockUsePipecatClient.mockReturnValue(undefined);

    let api: TasksAPI = { groups: [], cancelTask: () => {} };
    const Probe: React.FC = () => {
      api = useUITasks();
      return null;
    };

    render(<Probe />);

    expect(api.groups).toEqual([]);
    expect(() => api.cancelTask("t1")).not.toThrow();
  });
});
