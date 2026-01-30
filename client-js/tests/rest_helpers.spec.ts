/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { PipecatClient } from "./../client";
import { logger } from "./../client/logger";
import { makeRequest } from "./../client/rest_helpers";
import { TransportStub } from "./stubs/transport";

// Mock the fetch function
global.fetch = jest.fn();

// Mock the logger
jest.spyOn(logger, "warn").mockImplementation(() => {});
jest.spyOn(logger, "debug").mockImplementation(() => {});
jest.spyOn(logger, "error").mockImplementation(() => {});

describe("Request object handling in makeRequest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  test("should clone and use Request object when provided as endpoint", async () => {
    const originalRequest = new Request("https://example.com/api", {
      method: "POST",
      headers: { "X-Custom": "header" },
      body: JSON.stringify({ test: "data" }),
    });

    const abortController = new AbortController();

    await makeRequest(
      {
        endpoint: originalRequest,
      },
      abortController
    );

    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Get the Request object that was passed to fetch
    const fetchedRequest = (global.fetch as jest.Mock).mock
      .calls[0][0] as Request;

    // Verify it's a Request object
    expect(fetchedRequest).toBeInstanceOf(Request);

    // Verify the URL matches
    expect(fetchedRequest.url).toBe("https://example.com/api");

    // Verify the abort signal was attached
    expect(fetchedRequest.signal).toBe(abortController.signal);

    // Verify the original request is not the same object (it was cloned)
    expect(fetchedRequest).not.toBe(originalRequest);
  });

  test("should log warning when requestData is provided with Request object", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
    });

    await makeRequest({
      endpoint: request,
      requestData: { ignored: "data" },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "[Pipecat Client] requestData in APIRequest is ignored when endpoint is a Request object"
    );
  });

  test("should log warning when headers are provided with Request object", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
    });

    await makeRequest({
      endpoint: request,
      headers: new Headers({ "X-Custom": "header" }),
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "[Pipecat Client] headers in APIRequest is ignored when endpoint is a Request object"
    );
  });

  test("should log both warnings when both requestData and headers are provided with Request object", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
    });

    await makeRequest({
      endpoint: request,
      requestData: { ignored: "data" },
      headers: new Headers({ "X-Custom": "header" }),
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "[Pipecat Client] requestData in APIRequest is ignored when endpoint is a Request object"
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "[Pipecat Client] headers in APIRequest is ignored when endpoint is a Request object"
    );
  });

  test("should attach abort signal to Request object", async () => {
    const request = new Request("https://example.com/api");
    const abortController = new AbortController();

    await makeRequest(
      {
        endpoint: request,
      },
      abortController
    );

    const fetchedRequest = (global.fetch as jest.Mock).mock
      .calls[0][0] as Request;
    expect(fetchedRequest.signal).toBe(abortController.signal);
  });

  test("should handle string endpoint without warnings", async () => {
    await makeRequest({
      endpoint: "https://example.com/api",
      requestData: { test: "data" },
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("should handle URL endpoint without warnings", async () => {
    await makeRequest({
      endpoint: new URL("https://example.com/api"),
      requestData: { test: "data" },
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("should reject when fetch fails with Request object", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const request = new Request("https://example.com/api");

    await expect(
      makeRequest({
        endpoint: request,
      })
    ).rejects.toBeDefined();
  });

  test("should timeout when using Request object with timeout option", async () => {
    jest.useFakeTimers();

    const request = new Request("https://example.com/api");

    // Mock fetch to never resolve (simulates a hanging request)
    (global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise(() => {
          // Promise never resolves to simulate hanging request for timeout test
        })
    );

    const promise = makeRequest({
      endpoint: request,
      timeout: 1000,
    });

    // Advance timers past the timeout
    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow("Timed out");

    jest.useRealTimers();
  });
});

describe("Request object cloning in startBotParams setter", () => {
  let client: PipecatClient;

  beforeEach(() => {
    client = new PipecatClient({
      transport: TransportStub.create(),
    });
  });

  test("should clone Request object when setting startBotParams", () => {
    const originalRequest = new Request("https://example.com/start-bot", {
      method: "POST",
      headers: { "X-Custom": "header" },
      body: JSON.stringify({ bot: "config" }),
    });

    // Set startBotParams with a Request object
    client.transport.startBotParams = {
      endpoint: originalRequest,
    };

    const storedParams = client.transport.startBotParams;

    // Verify the endpoint is still a Request object
    expect(storedParams?.endpoint).toBeInstanceOf(Request);

    // Verify it's not the same object (it was cloned)
    expect(storedParams?.endpoint).not.toBe(originalRequest);

    // Verify the URL is the same
    if (storedParams?.endpoint instanceof Request) {
      expect(storedParams.endpoint.url).toBe(originalRequest.url);
    }
  });

  test("should not clone when endpoint is a string", () => {
    const endpoint = "https://example.com/start-bot";

    client.transport.startBotParams = {
      endpoint: endpoint,
    };

    const storedParams = client.transport.startBotParams;

    // Verify the endpoint is a string
    expect(typeof storedParams?.endpoint).toBe("string");
    expect(storedParams?.endpoint).toBe(endpoint);
  });

  test("should not clone when endpoint is a URL", () => {
    const endpoint = new URL("https://example.com/start-bot");

    client.transport.startBotParams = {
      endpoint: endpoint,
    };

    const storedParams = client.transport.startBotParams;

    // Verify the endpoint is a URL
    expect(storedParams?.endpoint).toBeInstanceOf(URL);
    expect(storedParams?.endpoint).toBe(endpoint);
  });

  test("should preserve other properties when cloning Request", () => {
    const originalRequest = new Request("https://example.com/start-bot");

    client.transport.startBotParams = {
      endpoint: originalRequest,
      timeout: 5000,
    };

    const storedParams = client.transport.startBotParams;

    // Verify other properties are preserved
    expect(storedParams?.timeout).toBe(5000);
    expect(storedParams?.endpoint).toBeInstanceOf(Request);
    expect(storedParams?.endpoint).not.toBe(originalRequest);
  });

  test("should handle multiple sets with Request objects", () => {
    const request1 = new Request("https://example.com/start-bot-1");
    const request2 = new Request("https://example.com/start-bot-2");

    client.transport.startBotParams = { endpoint: request1 };
    const params1 = client.transport.startBotParams;

    client.transport.startBotParams = { endpoint: request2 };
    const params2 = client.transport.startBotParams;

    // Verify both are cloned and different
    expect(params1?.endpoint).not.toBe(request1);
    expect(params2?.endpoint).not.toBe(request2);
    expect(params1?.endpoint).not.toBe(params2?.endpoint);

    if (
      params1?.endpoint instanceof Request &&
      params2?.endpoint instanceof Request
    ) {
      expect(params1.endpoint.url).toBe(request1.url);
      expect(params2.endpoint.url).toBe(request2.url);
    }
  });
});
