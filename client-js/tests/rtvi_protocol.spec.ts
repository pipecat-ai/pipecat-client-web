/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { describe, expect, test } from "@jest/globals";
import { execFileSync } from "child_process";
import { join } from "path";

import { PROTOCOL_VERSION } from "../rtvi/generated/protocol";
import { RTVI_PROTOCOL_VERSION } from "../rtvi/messages";

describe("RTVI protocol document", () => {
  test("the generated protocol is what the kept document produces", () => {
    // Throws when the check fails; regenerate with `npm run rtvi:generate`.
    execFileSync(
      "node",
      [join(__dirname, "..", "scripts", "rtvi-protocol.mjs"), "check"],
      {
        stdio: "pipe",
      }
    );
  });

  test("the client speaks the document's protocol version", () => {
    expect(PROTOCOL_VERSION).toBe(RTVI_PROTOCOL_VERSION);
  });
});
