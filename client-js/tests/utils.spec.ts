/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { describe, expect, test } from "@jest/globals";

import { messageSizeWithinLimit } from "./../client/utils";

describe("messageSizeWithinLimit", () => {
  test("returns true for simple string within limit", () => {
    const message = "Hello";
    // "Hello" as JSON is "\"Hello\"" (7 bytes)
    expect(messageSizeWithinLimit(message, 10)).toBe(true);
  });

  test("returns false for simple string exceeding limit", () => {
    const message = "Hello World";
    // "Hello World" as JSON is "\"Hello World\"" (13 bytes)
    expect(messageSizeWithinLimit(message, 10)).toBe(false);
  });

  test("returns true when size equals limit exactly", () => {
    const message = "Hi";
    // "Hi" as JSON is "\"Hi\"" (4 bytes)
    expect(messageSizeWithinLimit(message, 4)).toBe(true);
  });

  test("handles Unicode characters correctly", () => {
    // "🎉" is a 4-byte UTF-8 character
    const message = "🎉";
    // "🎉" as JSON is "\"🎉\"" (2 quotes + 4 bytes for emoji = 6 bytes)
    const size = new TextEncoder().encode(JSON.stringify(message)).length;
    expect(messageSizeWithinLimit(message, size)).toBe(true);
    expect(messageSizeWithinLimit(message, size - 1)).toBe(false);
  });

  test("handles multi-byte Unicode characters in strings", () => {
    const message = "Hello 世界";
    // Each Chinese character is typically 3 bytes in UTF-8
    const size = new TextEncoder().encode(JSON.stringify(message)).length;
    expect(messageSizeWithinLimit(message, size)).toBe(true);
    expect(messageSizeWithinLimit(message, size - 1)).toBe(false);
  });

  test("handles simple objects", () => {
    const message = { name: "test", value: 123 };
    // {"name":"test","value":123} = 27 bytes
    expect(messageSizeWithinLimit(message, 30)).toBe(true);
    expect(messageSizeWithinLimit(message, 20)).toBe(false);
  });

  test("handles nested objects", () => {
    const message = {
      outer: {
        inner: {
          deep: "value",
        },
      },
    };
    const size = new TextEncoder().encode(JSON.stringify(message)).length;
    expect(messageSizeWithinLimit(message, size)).toBe(true);
    expect(messageSizeWithinLimit(message, size - 1)).toBe(false);
  });

  test("handles arrays", () => {
    const message = [1, 2, 3, 4, 5];
    // [1,2,3,4,5] = 11 bytes
    expect(messageSizeWithinLimit(message, 15)).toBe(true);
    expect(messageSizeWithinLimit(message, 10)).toBe(false);
  });

  test("handles arrays of objects", () => {
    const message = [
      { id: 1, name: "first" },
      { id: 2, name: "second" },
    ];
    const size = new TextEncoder().encode(JSON.stringify(message)).length;
    expect(messageSizeWithinLimit(message, size)).toBe(true);
    expect(messageSizeWithinLimit(message, size - 1)).toBe(false);
  });

  test("handles null", () => {
    const message = null;
    // null as JSON is "null" (4 bytes)
    expect(messageSizeWithinLimit(message, 4)).toBe(true);
    expect(messageSizeWithinLimit(message, 3)).toBe(false);
  });

  test("handles empty objects", () => {
    const message = {};
    // {} = 2 bytes
    expect(messageSizeWithinLimit(message, 2)).toBe(true);
    expect(messageSizeWithinLimit(message, 1)).toBe(false);
  });

  test("handles empty arrays", () => {
    const message = [];
    // [] = 2 bytes
    expect(messageSizeWithinLimit(message, 2)).toBe(true);
    expect(messageSizeWithinLimit(message, 1)).toBe(false);
  });

  test("handles empty strings", () => {
    const message = "";
    // "" as JSON is "\"\"" (2 bytes)
    expect(messageSizeWithinLimit(message, 2)).toBe(true);
    expect(messageSizeWithinLimit(message, 1)).toBe(false);
  });

  test("handles numbers", () => {
    const message = 12345;
    // 12345 as JSON is "12345" (5 bytes)
    expect(messageSizeWithinLimit(message, 5)).toBe(true);
    expect(messageSizeWithinLimit(message, 4)).toBe(false);
  });

  test("handles booleans", () => {
    const trueMessage = true;
    // true as JSON is "true" (4 bytes)
    expect(messageSizeWithinLimit(trueMessage, 4)).toBe(true);
    expect(messageSizeWithinLimit(trueMessage, 3)).toBe(false);

    const falseMessage = false;
    // false as JSON is "false" (5 bytes)
    expect(messageSizeWithinLimit(falseMessage, 5)).toBe(true);
    expect(messageSizeWithinLimit(falseMessage, 4)).toBe(false);
  });

  test("handles complex nested structures with Unicode", () => {
    const message = {
      user: {
        name: "Test User",
        emoji: "🎉🎊",
        location: "東京",
      },
      data: [1, 2, 3],
      meta: {
        timestamp: 1234567890,
        tags: ["tag1", "tag2"],
      },
    };
    const size = new TextEncoder().encode(JSON.stringify(message)).length;
    expect(messageSizeWithinLimit(message, size)).toBe(true);
    expect(messageSizeWithinLimit(message, size - 1)).toBe(false);
  });

  test("handles large objects exceeding typical limits", () => {
    // Create a large object
    const largeArray = Array(1000)
      .fill(null)
      .map((_, i) => ({ id: i, value: `item-${i}` }));
    const message = { data: largeArray };
    const size = new TextEncoder().encode(JSON.stringify(message)).length;

    // Should be within a very large limit
    expect(messageSizeWithinLimit(message, size)).toBe(true);
    // Should exceed a small limit
    expect(messageSizeWithinLimit(message, 100)).toBe(false);
  });

  test("handles special characters and escapes", () => {
    const message = { text: 'Line 1\nLine 2\t"quoted"' };
    // JSON.stringify will escape special characters
    const size = new TextEncoder().encode(JSON.stringify(message)).length;
    expect(messageSizeWithinLimit(message, size)).toBe(true);
    expect(messageSizeWithinLimit(message, size - 1)).toBe(false);
  });
});
