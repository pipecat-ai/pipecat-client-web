/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { afterEach, describe, expect, jest, test } from "@jest/globals";

import { MessageDispatcher } from "../client/dispatcher";
import { RTVIMessage, RTVIMessageType } from "../rtvi";

describe("MessageDispatcher", () => {
  let dispatcher: MessageDispatcher | undefined;

  afterEach(() => {
    dispatcher?.disconnect();
    dispatcher = undefined;
  });

  test("rejects pending requests on disconnect", async () => {
    dispatcher = new MessageDispatcher(() => {});

    const pending = dispatcher.dispatch({ t: "get-config", d: { a: 1 } });
    dispatcher.disconnect();

    const error = (await pending.catch((e) => e)) as RTVIMessage;
    expect(error.type).toBe(RTVIMessageType.ERROR_RESPONSE);
    expect(error.data).toEqual({
      error: "Disconnected before response was received",
      msgType: "get-config",
      data: { a: 1 },
      fatal: false,
    });
  });

  test("still resolves requests answered before disconnect", async () => {
    const sendMethod = jest.fn<(message: RTVIMessage) => void>();
    dispatcher = new MessageDispatcher(sendMethod);

    const pending = dispatcher.dispatch({ t: "ping", d: null });
    const sent = sendMethod.mock.calls[0][0];
    const response = new RTVIMessage(
      RTVIMessageType.SERVER_RESPONSE,
      { t: "ping", d: "pong" },
      sent.id
    );
    dispatcher.resolve(response);
    dispatcher.disconnect();

    await expect(pending).resolves.toBe(response);
  });
});
