/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 *
 * Characterization tests for initDevices() and the device-state surface on
 * PipecatClient. These lock in today's behavior ahead of the MediaState
 * refactor (Plan A, step 2), including known quirks that the refactor is
 * intended to fix. When a quirk is resolved, the corresponding assertion here
 * should change in the same PR.
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { PipecatClient } from "../client";
import {
  DeviceError,
  DeviceErrorType,
  RTVIEvent,
  TransportState,
} from "../rtvi";
import { TransportStub } from "./stubs/transport";

/**
 * Extends TransportStub with hooks needed for characterization:
 * - count initDevices() calls
 * - optionally throw on initDevices()
 * - drive the onDeviceError callback directly
 */
class CharacterizationTransport extends TransportStub {
  public initDevicesCallCount = 0;
  public initDevicesShouldThrow: Error | undefined;

  static override create(): CharacterizationTransport {
    return new CharacterizationTransport();
  }

  public override initDevices(): Promise<void> {
    this.initDevicesCallCount += 1;
    if (this.initDevicesShouldThrow) {
      const err = this.initDevicesShouldThrow;
      // Match the shape of a real transport that begins enumeration and then
      // fails partway — state flips to "initializing" before the rejection.
      return new Promise<void>((_resolve, reject) => {
        this.forceState("initializing");
        setTimeout(() => reject(err), 10);
      });
    }
    return super.initDevices();
  }

  private forceState(next: TransportState): void {
    // The parent stub's state setter is private. Update the protected field
    // directly and fire the registered callback so observers still see the
    // transition.
    this._state = next;
    this._callbacks.onTransportStateChanged?.(next);
  }

  public emitDeviceError(error: DeviceError): void {
    this._callbacks.onDeviceError?.(error);
  }
}

const recordStateChanges = (client: PipecatClient): TransportState[] => {
  const states: TransportState[] = [];
  client.on(RTVIEvent.TransportStateChanged, (s) => states.push(s));
  return states;
};

describe("PipecatClient.initDevices() — characterization", () => {
  let transport: CharacterizationTransport;
  let client: PipecatClient;

  beforeEach(() => {
    transport = CharacterizationTransport.create();
    client = new PipecatClient({ transport });
  });

  test("initial TransportState is 'disconnected' (same sentinel as post-disconnect)", () => {
    // This ambiguity is the root cause documented in the Plan A design: the
    // 'disconnected' value currently carries two meanings (pre-init and
    // post-session-ended). Step 2 introduces MediaState to disambiguate.
    expect(client.state).toBe("disconnected");
  });

  test("explicit initDevices(): disconnected → initializing → initialized", async () => {
    const states = recordStateChanges(client);

    await client.initDevices();

    expect(transport.initDevicesCallCount).toBe(1);
    expect(client.state).toBe("initialized");
    expect(states).toEqual(["initializing", "initialized"]);
  });

  test("repeated explicit initDevices() calls re-enter the initializing state each time", async () => {
    // Today the abstract contract does not guarantee idempotency — each
    // concrete transport decides. The stub re-runs the transition, which is
    // representative of transports that re-enumerate on every call.
    const states = recordStateChanges(client);

    await client.initDevices();
    await client.initDevices();

    expect(transport.initDevicesCallCount).toBe(2);
    expect(client.state).toBe("initialized");
    // Note: the second cycle still emits initializing → initialized even
    // though the end state is unchanged. Any regression here would change
    // how consumers observe repeat calls.
    expect(states).toEqual([
      "initializing",
      "initialized",
      "initializing",
      "initialized",
    ]);
  });

  test("connect() implicitly calls initDevices() when state === 'disconnected'", async () => {
    const states = recordStateChanges(client);

    await client.connect();

    expect(transport.initDevicesCallCount).toBe(1);
    expect(client.state).toBe("ready");
    expect(states).toEqual([
      "initializing",
      "initialized",
      "connecting",
      "connected",
      "ready",
    ]);
  });

  test("connect() does NOT re-call initDevices() when state is already 'initialized'", async () => {
    await client.initDevices();
    expect(transport.initDevicesCallCount).toBe(1);

    await client.connect();

    // The gate in connect() / startBot() today is a strict equality check
    // against 'disconnected'. Any state other than that skips the implicit
    // init. Step 2 replaces this gate with a MediaState check.
    expect(transport.initDevicesCallCount).toBe(1);
    expect(client.state).toBe("ready");
  });

  test("reconnect after disconnect re-runs initDevices() (state reverts to 'disconnected')", async () => {
    await client.connect();
    await client.disconnect();

    expect(client.state).toBe("disconnected");
    expect(transport.initDevicesCallCount).toBe(1);

    await client.connect();

    // Because disconnect() returns state to 'disconnected' — the same sentinel
    // as the pre-init initial state — the implicit-init gate trips again.
    // This is the downstream visible symptom behind the stuck-spinner bug.
    expect(transport.initDevicesCallCount).toBe(2);
    expect(client.state).toBe("ready");
  });

  test("explicit initDevices() that rejects propagates the error and leaves state at 'initializing'", async () => {
    transport.initDevicesShouldThrow = new Error("boom");
    const states = recordStateChanges(client);

    await expect(client.initDevices()).rejects.toThrow("boom");

    // The abstract layer does not currently reset state on failure. Consumers
    // observing only TransportState see 'initializing' lingering — another
    // motivation for MediaState's per-device error statuses.
    expect(client.state).toBe("initializing");
    expect(states).toEqual(["initializing"]);
  });

  // KNOWN LATENT BUG — intentionally not asserted as a passing test:
  //
  // When initDevices() rejects inside connect(), the `await` sits outside the
  // try/catch in client.ts, so the async IIFE emits an unhandled rejection
  // and the outer Promise never settles. Step 2 of Plan A fixes this by
  // handling the error deliberately. The "explicit initDevices() rejects"
  // test above locks in the init-level rejection behavior the refactor builds
  // on; the connect-path behavior will be re-characterized in step 2 once
  // the fix is in place.

  test("startBot() implicitly calls initDevices() when state === 'disconnected'", async () => {
    // Stub makeRequest via the global fetch mock supplied by whatwg-fetch.
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    try {
      await client.startBot({ endpoint: "https://example.invalid/start" });
    } finally {
      fetchMock.mockRestore();
    }

    expect(transport.initDevicesCallCount).toBe(1);
    expect(client.state).toBe("authenticated");
  });

  test("startBot() does NOT re-call initDevices() when state is already 'initialized'", async () => {
    await client.initDevices();
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    try {
      await client.startBot({ endpoint: "https://example.invalid/start" });
    } finally {
      fetchMock.mockRestore();
    }

    expect(transport.initDevicesCallCount).toBe(1);
    expect(client.state).toBe("authenticated");
  });

  // initDevices() at the abstract-client layer does not branch on
  // enableMic/enableCam — those options are stored and passed to the transport
  // via initialize() but never read by PipecatClient.initDevices itself.
  // Per-transport propagation is characterized in
  // pipecat-client-web-transports (see tests/src/transports/*.spec.ts).
  test.each([
    { enableMic: true, enableCam: false },
    { enableMic: false, enableCam: false },
    { enableMic: true, enableCam: true },
    { enableMic: false, enableCam: true },
  ])(
    "initDevices() state transitions are identical regardless of enable options (%j)",
    async (opts) => {
      const localTransport = CharacterizationTransport.create();
      const localClient = new PipecatClient({
        transport: localTransport,
        ...opts,
      });
      const states = recordStateChanges(localClient);

      await localClient.initDevices();

      expect(localTransport.initDevicesCallCount).toBe(1);
      expect(localClient.state).toBe("initialized");
      expect(states).toEqual(["initializing", "initialized"]);
    }
  );
});

describe("DeviceError — characterization", () => {
  const deviceErrorTypes: DeviceErrorType[] = [
    "in-use",
    "permissions",
    "undefined-mediadevices",
    "not-found",
    "constraints",
    "unknown",
  ];

  test.each(deviceErrorTypes)(
    "onDeviceError callback fires RTVIEvent.DeviceError for type '%s'",
    (type) => {
      const callbackErrors: DeviceError[] = [];
      const transport = CharacterizationTransport.create();
      const client = new PipecatClient({
        transport,
        callbacks: {
          onDeviceError: (err) => callbackErrors.push(err),
        },
      });

      const eventErrors: DeviceError[] = [];
      client.on(RTVIEvent.DeviceError, (err) => eventErrors.push(err));

      const err = new DeviceError(["mic"], type, `${type} error`, {
        reason: `${type}-details`,
      });
      transport.emitDeviceError(err);

      expect(callbackErrors).toHaveLength(1);
      expect(eventErrors).toHaveLength(1);
      expect(callbackErrors[0]).toBe(err);
      expect(eventErrors[0]).toBe(err);
      expect(callbackErrors[0].type).toBe(type);
      expect(callbackErrors[0].devices).toEqual(["mic"]);
      expect(callbackErrors[0].details).toEqual({ reason: `${type}-details` });
    }
  );

  test.each([
    [["cam"]],
    [["mic"]],
    [["speaker"]],
    [["cam", "mic"]],
    [["cam", "mic", "speaker"]],
  ] as Array<[("cam" | "mic" | "speaker")[]]>)(
    "DeviceError payload carries the affected devices array %j",
    (devices) => {
      const transport = CharacterizationTransport.create();
      const client = new PipecatClient({ transport });
      const observed: DeviceError[] = [];
      client.on(RTVIEvent.DeviceError, (err) => observed.push(err));

      const err = new DeviceError(devices, "in-use");
      transport.emitDeviceError(err);

      expect(observed).toHaveLength(1);
      expect(observed[0].devices).toEqual(devices);
    }
  );

  test("DeviceError does not mutate TransportState", () => {
    const transport = CharacterizationTransport.create();
    const client = new PipecatClient({ transport });
    const states: TransportState[] = [];
    client.on(RTVIEvent.TransportStateChanged, (s) => states.push(s));

    transport.emitDeviceError(new DeviceError(["mic"], "permissions"));

    // This is a baseline consumers rely on today: a device error does not
    // drive TransportState. Plan A step 2 introduces a separate MediaState
    // that IS updated from this event, leaving TransportState untouched.
    expect(states).toEqual([]);
    expect(client.state).toBe("disconnected");
  });
});

describe("Transport contract: initial _state", () => {
  test("abstract Transport initializes _state to 'disconnected' before initialize() runs", () => {
    // The abstract Transport class declares
    //   protected _state: TransportState = "disconnected";
    // That default is the sentinel Plan A step 2 disambiguates — it has to
    // carry meaning even before PipecatClient calls initialize(). Changing
    // the default to a different value (e.g. "uninitialized") would silently
    // shift the pre-init semantics; this test guards against that.
    const transport = CharacterizationTransport.create();
    expect(transport.state).toBe("disconnected");
  });
});
