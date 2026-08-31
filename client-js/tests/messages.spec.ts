/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { describe, expect, test } from "@jest/globals";

import { ErrorData, RTVIMessage, RTVIMessageType } from "../rtvi";

describe("RTVIMessage errors", () => {
  test("accepts the server error payload", () => {
    const data: ErrorData = {
      error: "Server error",
      fatal: false,
    };

    const message = new RTVIMessage(RTVIMessageType.ERROR, data);

    expect(message.data).toEqual(data);
  });

  test("includes the canonical and legacy fields for local errors", () => {
    const message = RTVIMessage.error("Client error", true);

    expect(message.data).toEqual({
      error: "Client error",
      message: "Client error",
      fatal: true,
    });
  });
});
