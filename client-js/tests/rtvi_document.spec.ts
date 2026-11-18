/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * Checks that client-js speaks the RTVI protocol as its document describes it:
 * it handles every message the server sends, delivers each example to the app,
 * and builds every message it sends as the document's schema says.
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import Ajv from "ajv";
import { readFileSync } from "fs";
import { join } from "path";

import { PipecatClient, RTVIEventCallbacks } from "../client";
import { logger } from "../client/logger";
import {
  RTVI_PROTOCOL_VERSION,
  RTVIEvent,
  RTVIMessage,
  RTVIMessageType,
  snapshotDocument,
} from "../rtvi";
import { TransportStub } from "./stubs/transport";

type Message = {
  name: string;
  payload: { properties: { data?: unknown } };
  examples: { payload: { type: string; id?: string; data?: unknown } }[];
};

const DOCUMENT = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "rtvi",
      "spec",
      RTVI_PROTOCOL_VERSION,
      "rtvi.asyncapi.json"
    ),
    "utf8"
  )
);
const MESSAGES: Record<string, Message> = Object.fromEntries(
  Object.values(DOCUMENT.components.messages as Record<string, Message>).map(
    (message) => [message.name, message]
  )
);
const byOperation = (operation: string): string[] =>
  DOCUMENT.operations[operation].messages.map(
    (ref: { $ref: string }) =>
      DOCUMENT.components.messages[ref.$ref.split("/").pop()!].name
  );
const SERVER_TYPES = byOperation("sendServerMessages");
const CLIENT_TYPES = byOperation("receiveClientMessages");

/** Server messages client-js doesn't hand to the app, and why. */
const IGNORED: Record<string, string> = {
  "user-audio-level": "the transport reports audio levels itself",
  "bot-audio-level": "the transport reports audio levels itself",
  "system-log": "the bot's logs are for its developers, not the app",
  "bot-llm-marker": "the turn-completion marker is for debugging the bot",
};

/** Server messages answering a request: they settle it instead of reaching a callback. */
const ANSWERS = new Set(["server-response", "error-response"]);

/** Message types client-js knows that the document doesn't have, and why. */
const NOT_IN_DOCUMENT: Record<string, string> = {
  "append-to-context": "deprecated; servers no longer handle it",
  "append-to-context-result": "deprecated; servers no longer send it",
  "bot-llm-search-response":
    "sent only by Pipecat's Google RTVI observer, outside the protocol",
};

/** Client messages client-js doesn't send, and why. */
const NOT_SENT: Record<string, string> = {
  "raw-audio": "the transport carries the user's audio",
  "raw-audio-batch": "the transport carries the user's audio",
};

type Call = { callback: string; args: unknown[] };

/**
 * A client that records what reaches the app: each callback it calls, and each
 * event it emits, since some messages reach the app only as events.
 */
function recordingClient(): {
  client: PipecatClient;
  transport: TransportStub;
  calls: Call[];
} {
  const calls: Call[] = [];
  const callbacks = new Proxy(
    {},
    {
      get:
        (_, callback) =>
        (...args: unknown[]) =>
          calls.push({ callback: String(callback), args }),
    }
  ) as RTVIEventCallbacks;
  const transport = new TransportStub();
  const client = new PipecatClient({ transport, callbacks });
  for (const event of Object.values(RTVIEvent)) {
    client.on(event, (...args: unknown[]) =>
      calls.push({ callback: event, args })
    );
  }
  return { client, transport, calls };
}

function receive(client: PipecatClient, type: string, data?: unknown) {
  const message = { label: "rtvi-ai", id: "msg_1", type, data } as RTVIMessage;
  (client.transport as TransportStub).handleMessage(message);
}

/** A copy of a JSON value, for a callback to change without changing the example. */
function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function example(type: string) {
  return MESSAGES[type].examples[0].payload;
}

/** Whether a value carries all of `expected`, as an argument or as its `data`. */
function carries(value: unknown, expected: unknown): boolean {
  const matches = (candidate: unknown) => {
    try {
      expect(candidate).toMatchObject(expected as object);
      return true;
    } catch {
      return false;
    }
  };
  if (typeof expected !== "object" || expected === null) {
    return value === expected;
  }
  return matches(value) || matches((value as { data?: unknown })?.data);
}

describe("RTVI document: messages from the server", () => {
  let unrecognized: string[];

  beforeEach(() => {
    unrecognized = [];
    jest.spyOn(logger, "debug").mockImplementation((...args: unknown[]) => {
      if (args[0] === "[Pipecat Client] Unrecognized message type") {
        unrecognized.push(String(args[1]));
      }
    });
  });

  test("every server message is handled, or ignored on purpose", () => {
    const { client } = recordingClient();
    for (const type of SERVER_TYPES) {
      receive(client, type, example(type).data);
    }
    expect(unrecognized.sort()).toEqual(Object.keys(IGNORED).sort());
  });

  test("the message types client-js knows are the document's", () => {
    const documented = new Set([...SERVER_TYPES, ...CLIENT_TYPES]);
    const known = Object.values(RTVIMessageType) as string[];
    expect(known.filter((type) => !documented.has(type)).sort()).toEqual(
      Object.keys(NOT_IN_DOCUMENT).sort()
    );
  });

  const delivered = SERVER_TYPES.filter(
    (type) => !(type in IGNORED) && !ANSWERS.has(type)
  );

  test.each(delivered)("%s's example reaches the app", (type) => {
    const { client, calls } = recordingClient();
    const data = example(type).data;
    receive(client, type, clone(data));
    if (data === undefined) {
      expect(calls).not.toHaveLength(0);
    } else {
      expect(calls.some((call) => carries(call.args[0], data))).toBe(true);
    }
  });

  test.each(delivered.filter((type) => isObject(example(type).data)))(
    "%s reaches the app with a field client-js doesn't know",
    (type) => {
      const { client, calls } = recordingClient();
      const data = example(type).data as object;
      receive(client, type, { ...clone(data), x_unknown: 1 });
      expect(calls.some((call) => carries(call.args[0], data))).toBe(true);
    }
  );
});

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("RTVI document: messages to the server", () => {
  const ajv = new Ajv({ strict: false, allErrors: true });

  /** What is wrong with a message client-js sends, by the document's schema. */
  function violations(message: RTVIMessage): string[] {
    const wire = JSON.parse(JSON.stringify(message));
    const spec = MESSAGES[wire.type];
    if (!spec || !CLIENT_TYPES.includes(wire.type)) {
      return [`${wire.type} isn't a message a client sends`];
    }
    const validate = ajv.compile({
      ...spec.payload,
      components: { schemas: DOCUMENT.components.schemas },
    });
    return validate(wire)
      ? []
      : validate.errors!.map(
          (e) => `${wire.type} ${e.instancePath} ${e.message}`
        );
  }

  test("every message client-js sends matches its schema", async () => {
    const { client, transport } = recordingClient();
    await client.connect();
    receive(client, "bot-ready", { version: RTVI_PROTOCOL_VERSION });
    const sent: RTVIMessage[] = [RTVIMessage.clientReady()];
    jest
      .spyOn(transport, "sendMessage")
      .mockImplementation((message: RTVIMessage) => {
        sent.push(message);
        return true;
      });

    client.sendClientMessage("set-volume", { level: 5 });
    await client.sendText("What's the weather?", { run_immediately: true });
    await client.sendFile(
      {
        format: "png",
        source: { type: "url", url: "https://example.com/map.png" },
      },
      "What's in this map?"
    );
    client.sendDTMF("12#");
    client.sendUIEvent("click", { ref: "e1" });
    client.cancelUIJobGroup("job_1", "user");
    document.body.innerHTML = "<button>Go</button>";
    (
      client as unknown as { _sendUISnapshot(s: unknown): void }
    )._sendUISnapshot(snapshotDocument());
    client.registerFunctionCallHandler("get_weather", async () => ({
      sunny: true,
    }));
    receive(client, "llm-function-call-in-progress", {
      function_name: "get_weather",
      tool_call_id: "call_1",
      arguments: { city: "Lisbon" },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    client.disconnectBot();

    expect(sent.flatMap(violations)).toEqual([]);
    const types = new Set(sent.map((message) => message.type));
    expect(CLIENT_TYPES.filter((type) => !types.has(type)).sort()).toEqual(
      Object.keys(NOT_SENT).sort()
    );
  });

  test("a server-response settles the request with its id", async () => {
    const { client, transport } = recordingClient();
    await client.connect();
    const sent: RTVIMessage[] = [];
    jest
      .spyOn(transport, "sendMessage")
      .mockImplementation((message: RTVIMessage) => {
        sent.push(message);
        return true;
      });

    const answered = client.sendClientRequest("get-weather", {
      city: "Lisbon",
    });
    const response = example("server-response");
    (client.transport as TransportStub).handleMessage({
      ...response,
      id: sent[0].id,
      data: { ...(response.data as object), t: "get-weather" },
    } as RTVIMessage);
    await expect(answered).resolves.toEqual(
      (response.data as { d?: unknown }).d
    );

    const failed = client.sendClientRequest("get-weather", { city: "Lisbon" });
    (client.transport as TransportStub).handleMessage({
      ...example("error-response"),
      id: sent[1].id,
    } as RTVIMessage);
    await expect(failed).rejects.toBeDefined();
  });
});
