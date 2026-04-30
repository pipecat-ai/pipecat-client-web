/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 *
 * Tests for the MediaState surface added in Plan A step 2. Covers:
 * - lifecycle transitions on initDevices() success / failure
 * - DeviceError → DeviceStatus classification (per-device)
 * - MediaStateUpdated event + onMediaStateChanged callback fan-out
 * - needsInit gate behavior across connect/reconnect/post-failure paths
 * - Permissions API enrichment (post-transport) with silent fallback
 * - Devices the transport doesn't acquire (stay 'uninitialized')
 */

import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import { PipecatClient } from "../client";
import {
  DeviceError,
  DeviceErrorReason,
  DeviceErrorType,
  DeviceStatus,
  MediaState,
  RTVIEvent,
} from "../rtvi";
import { TransportStub } from "./stubs/transport";

/**
 * The transport-level signals MediaState observes per device. Setting either
 * to a MediaDeviceInfo causes the corresponding onMicUpdated/onCamUpdated
 * event to fire during initDevices() — which is how PipecatClient learns
 * the transport actually acquired the device. Setting to undefined skips
 * the event (the transport didn't speak to that device, e.g. daily-js
 * skipping cam under startVideoOff: true).
 */
type FakeAcquired = { mic?: MediaDeviceInfo; cam?: MediaDeviceInfo };
const DEFAULT_ACQUIRED: FakeAcquired = {
  mic: { deviceId: "mic-default" } as MediaDeviceInfo,
  cam: { deviceId: "cam-default" } as MediaDeviceInfo,
};

class MediaStateTransport extends TransportStub {
  public initDevicesCallCount = 0;
  public initDevicesShouldThrow: Error | undefined;
  public emitDeviceErrorDuringInit: DeviceError | undefined;
  public acquiredOnInit: FakeAcquired = { ...DEFAULT_ACQUIRED };

  static override create(): MediaStateTransport {
    return new MediaStateTransport();
  }

  public override initDevices(): Promise<void> {
    this.initDevicesCallCount += 1;
    // Real transports do their device acquisition first, then notify via
    // onDeviceError / onMicUpdated / onCamUpdated, then resolve or reject.
    // Mirror that ordering: fire events inside the super.initDevices()
    // continuation, before settling.
    return super.initDevices().then(() => {
      if (this.emitDeviceErrorDuringInit) {
        this._callbacks.onDeviceError?.(this.emitDeviceErrorDuringInit);
      }
      const errorDevices = this.emitDeviceErrorDuringInit?.devices ?? [];
      if (this.acquiredOnInit.mic && !errorDevices.includes("mic")) {
        this._callbacks.onMicUpdated?.(this.acquiredOnInit.mic);
      }
      if (this.acquiredOnInit.cam && !errorDevices.includes("cam")) {
        this._callbacks.onCamUpdated?.(this.acquiredOnInit.cam);
      }
      if (this.initDevicesShouldThrow) {
        throw this.initDevicesShouldThrow;
      }
    });
  }

  public emitDeviceError(error: DeviceError): void {
    this._callbacks.onDeviceError?.(error);
  }
}

const recordMediaState = (client: PipecatClient): MediaState[] => {
  const states: MediaState[] = [];
  client.on(RTVIEvent.MediaStateUpdated, (s) => states.push(s));
  return states;
};

// Shorthand DeviceStatus values used heavily across assertions.
const UNINIT: DeviceStatus = { state: "uninitialized" };
const INITIALIZING: DeviceStatus = { state: "initializing" };
const GRANTED: DeviceStatus = { state: "granted" };
const errored = (
  reason: DeviceErrorReason,
  details?: unknown
): DeviceStatus => ({ state: "error", reason, details });

/**
 * Most tests below want to exercise the full mic+cam lifecycle, so they
 * opt both devices in explicitly. The PipecatClient default is enableMic:
 * true, enableCam: false — passing it implicitly would leave cam at
 * 'uninitialized' through the whole call (a separate code path tested in
 * its own describe).
 */
const buildClient = (
  transport: MediaStateTransport,
  overrides: {
    enableMic?: boolean;
    enableCam?: boolean;
    callbacks?: ConstructorParameters<typeof PipecatClient>[0]["callbacks"];
  } = {}
): PipecatClient =>
  new PipecatClient({
    transport,
    enableMic: overrides.enableMic ?? true,
    enableCam: overrides.enableCam ?? true,
    callbacks: overrides.callbacks,
  });

describe("MediaState — lifecycle on initDevices()", () => {
  let transport: MediaStateTransport;
  let client: PipecatClient;

  beforeEach(() => {
    transport = MediaStateTransport.create();
    client = buildClient(transport);
  });

  test("initial mediaState is uninitialized for both devices", () => {
    expect(client.mediaState).toEqual({ mic: UNINIT, cam: UNINIT });
  });

  test("happy path: uninitialized → initializing → granted (per-device)", async () => {
    const updates = recordMediaState(client);

    await client.initDevices();

    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });
    // The stub fires onMicUpdated then onCamUpdated, so each device flips
    // to 'granted' in turn rather than as a single batched update.
    expect(updates).toEqual([
      { mic: INITIALIZING, cam: INITIALIZING },
      { mic: GRANTED, cam: INITIALIZING },
      { mic: GRANTED, cam: GRANTED },
    ]);
  });

  test("onMediaStateChanged callback fires alongside the event emitter", async () => {
    const callbackSnapshots: MediaState[] = [];
    const callbackTransport = MediaStateTransport.create();
    const callbackClient = buildClient(callbackTransport, {
      callbacks: {
        onMediaStateChanged: (s) => callbackSnapshots.push(s),
      },
    });

    await callbackClient.initDevices();

    expect(callbackSnapshots).toEqual([
      { mic: INITIALIZING, cam: INITIALIZING },
      { mic: GRANTED, cam: INITIALIZING },
      { mic: GRANTED, cam: GRANTED },
    ]);
  });

  test("MediaState getter returns a deep snapshot", () => {
    // Both top-level spread and per-device copy: mutating either layer of
    // the snapshot must not bleed into the client's internal record.
    const snapshot = client.mediaState;
    snapshot.mic = errored("blocked");
    (snapshot.cam as { state: string }).state = "granted";
    expect(client.mediaState).toEqual({ mic: UNINIT, cam: UNINIT });
  });
});

describe("MediaState — DeviceError classification", () => {
  // (DeviceErrorType, expected DeviceErrorReason)
  const cases: Array<[DeviceErrorType, DeviceErrorReason]> = [
    ["in-use", "already-in-use"],
    ["permissions", "blocked"],
    ["not-found", "not-found"],
    ["undefined-mediadevices", "not-supported"],
    ["constraints", "invalid-constraints"],
    ["unknown", "unknown"],
  ];

  test.each(cases)(
    "DeviceError type '%s' classifies affected devices to error reason '%s'",
    async (errorType, expectedReason) => {
      const transport = MediaStateTransport.create();
      const client = buildClient(transport);

      transport.emitDeviceErrorDuringInit = new DeviceError(
        ["mic", "cam"],
        errorType
      );
      transport.initDevicesShouldThrow = new Error("init failed");

      await expect(client.initDevices()).rejects.toThrow();

      expect(client.mediaState).toEqual({
        mic: errored(expectedReason),
        cam: errored(expectedReason),
      });
    }
  );

  test("partial DeviceError mid-init: unaffected device resolves to 'granted' when transport succeeds", async () => {
    // mediaManager fires DeviceError for mic only, then the overall
    // transport.initDevices() resolves and the cam was acquired separately.
    // Cam should reach 'granted' via its onCamUpdated event.
    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    transport.emitDeviceErrorDuringInit = new DeviceError(
      ["mic"],
      "permissions"
    );

    await client.initDevices();

    expect(client.mediaState).toEqual({
      mic: errored("blocked"),
      cam: GRANTED,
    });
  });

  test("partial DeviceError + transport reject + nothing acquired: unaffected device falls back to 'unknown'", async () => {
    const transport = MediaStateTransport.create();
    transport.acquiredOnInit = {}; // model wholesale failure: nothing acquired
    transport.emitDeviceErrorDuringInit = new DeviceError(
      ["mic"],
      "permissions"
    );
    transport.initDevicesShouldThrow = new Error("init failed");
    const client = buildClient(transport);

    await expect(client.initDevices()).rejects.toThrow();

    expect(client.mediaState).toEqual({
      mic: errored("blocked"),
      cam: errored("unknown"),
    });
  });

  test("DeviceError affecting only ['mic'] leaves cam in its prior status", async () => {
    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    // Drive a happy init first so cam reaches 'granted', then fire a
    // mic-only DeviceError out-of-band.
    await client.initDevices();
    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });

    transport.emitDeviceError(new DeviceError(["mic"], "in-use"));

    expect(client.mediaState).toEqual({
      mic: errored("already-in-use"),
      cam: GRANTED,
    });
  });

  test("DeviceError affecting only ['speaker'] is a no-op for MediaState", async () => {
    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    await client.initDevices();
    transport.emitDeviceError(new DeviceError(["speaker"], "in-use"));

    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });
  });

  test("recovering device: a previously errored device can transition back to 'granted'", async () => {
    // E.g. cam was unplugged → 'not-found' → user plugs it in and re-inits
    // → cam should upgrade to 'granted'. _markDeviceGranted does not gate
    // on prior state.
    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    // First init: cam reports as not-found.
    transport.acquiredOnInit = { mic: { deviceId: "mic-1" } as MediaDeviceInfo };
    transport.emitDeviceErrorDuringInit = new DeviceError(["cam"], "not-found");
    await client.initDevices();
    expect(client.mediaState).toEqual({
      mic: GRANTED,
      cam: errored("not-found"),
    });

    // Second init: cam now acquired.
    transport.acquiredOnInit = { ...DEFAULT_ACQUIRED };
    transport.emitDeviceErrorDuringInit = undefined;
    await client.initDevices();

    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });
  });
});

describe("MediaState — needsInit() gate in connect()/startBot()", () => {
  test("connect() drives implicit initDevices() when mediaState is uninitialized", async () => {
    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    await client.connect();

    expect(transport.initDevicesCallCount).toBe(1);
    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });
  });

  test("reconnect after disconnect does NOT re-init (mediaState stays 'granted')", async () => {
    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    await client.connect();
    await client.disconnect();
    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });

    await client.connect();

    // The new gate short-circuits — no second init triggered by reconnect.
    expect(transport.initDevicesCallCount).toBe(1);
  });

  test("connect() after a failed initDevices() does NOT retry init (mediaState is in an error state)", async () => {
    // After a rejection, mediaState lands in 'error'. needsInit only
    // returns true when a requested device is 'uninitialized', so connect()
    // does NOT trigger another implicit init. Recovery is the user's job:
    // call initDevices() again explicitly.
    const transport = MediaStateTransport.create();
    transport.acquiredOnInit = {};
    const client = buildClient(transport);

    transport.initDevicesShouldThrow = new Error("first attempt failed");
    await expect(client.initDevices()).rejects.toThrow();

    transport.initDevicesShouldThrow = undefined;
    transport.acquiredOnInit = { ...DEFAULT_ACQUIRED };
    await client.connect();

    // No implicit re-init from connect(). Only the original explicit call.
    expect(transport.initDevicesCallCount).toBe(1);
  });

  test("client.needsInit() reflects the same gate logic", async () => {
    // The gate is a public method so consumers (e.g. step 3's hooks) can
    // branch on the same logic that drives the implicit init.
    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    expect(client.needsInit()).toBe(true);

    await client.initDevices();

    expect(client.needsInit()).toBe(false);
  });
});

describe("MediaState — Permissions API enrichment (post-transport)", () => {
  type FakePermissionStatus = { state: "granted" | "denied" | "prompt" };
  let originalPermissions: unknown;

  const installFakePermissions = (
    handler: (name: string) => Promise<FakePermissionStatus>
  ): void => {
    const nav = globalThis.navigator as unknown as { permissions: unknown };
    originalPermissions = nav.permissions;
    Object.defineProperty(nav, "permissions", {
      configurable: true,
      value: {
        // The real navigator.permissions.query takes a PermissionDescriptor
        // object — assert that here so we catch a bare-string regression.
        query: jest.fn(async (descriptor: unknown) => {
          if (
            typeof descriptor !== "object" ||
            descriptor === null ||
            typeof (descriptor as { name?: unknown }).name !== "string"
          ) {
            throw new TypeError(
              "permissions.query() expects a PermissionDescriptor"
            );
          }
          return handler((descriptor as { name: string }).name);
        }),
      },
    });
  };

  afterEach(() => {
    const nav = globalThis.navigator as unknown as { permissions: unknown };
    Object.defineProperty(nav, "permissions", {
      configurable: true,
      value: originalPermissions,
    });
  });

  test("'denied' for microphone marks mic 'blocked' even when transport happy-paths", async () => {
    installFakePermissions(async (name) => ({
      state: name === "microphone" ? "denied" : "prompt",
    }));

    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    await client.initDevices();

    // Permissions API runs after the transport call resolves and is
    // authoritative for 'denied' regardless of what the transport reported.
    expect(client.mediaState).toEqual({
      mic: errored("blocked"),
      cam: GRANTED,
    });
  });

  test("missing navigator.permissions falls back silently", async () => {
    const nav = globalThis.navigator as unknown as { permissions: unknown };
    originalPermissions = nav.permissions;
    Object.defineProperty(nav, "permissions", {
      configurable: true,
      value: undefined,
    });

    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    await expect(client.initDevices()).resolves.toBeUndefined();
    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });
  });

  test("post-transport re-query overrides under-reported blocked devices", async () => {
    // Real-world repro: page where permissions were previously blocked, no
    // prompt is shown on subsequent inits. daily-js's `camera-error` only
    // names whichever device the transport tried first, leaving the other
    // appearing 'granted' in the DeviceError. The post-transport
    // Permissions API call catches the missing one.
    installFakePermissions(async () => ({ state: "denied" }));

    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    // Transport reports cam-only block, then resolves successfully.
    transport.emitDeviceErrorDuringInit = new DeviceError(
      ["cam"],
      "permissions"
    );

    await client.initDevices();

    expect(client.mediaState).toEqual({
      mic: errored("blocked"),
      cam: errored("blocked"),
    });
  });

  test("permissions.query() that throws does not break initDevices", async () => {
    installFakePermissions(async () => {
      throw new Error("PermissionName not supported");
    });

    const transport = MediaStateTransport.create();
    const client = buildClient(transport);

    await expect(client.initDevices()).resolves.toBeUndefined();
    expect(client.mediaState).toEqual({ mic: GRANTED, cam: GRANTED });
  });
});

describe("MediaState — devices the transport didn't acquire stay 'uninitialized'", () => {
  // MediaState reflects what the transport actually did. A device that was
  // never reported acquired (no onMicUpdated / onCamUpdated event with a
  // real deviceId) stays at 'uninitialized'. This is independent of the
  // user's enableMic / enableCam options — the underlying transport has the
  // final say (e.g. daily-js's startCamera honors startVideoOff but not
  // startAudioOff, so the asymmetry is visible to consumers either way).

  test("transport that doesn't acquire cam leaves cam at 'uninitialized'", async () => {
    const transport = MediaStateTransport.create();
    transport.acquiredOnInit = { mic: { deviceId: "mic-1" } as MediaDeviceInfo };
    const client = buildClient(transport);
    const updates = recordMediaState(client);

    await client.initDevices();

    expect(client.mediaState).toEqual({ mic: GRANTED, cam: UNINIT });
    expect(updates).toEqual([
      { mic: INITIALIZING, cam: INITIALIZING },
      { mic: GRANTED, cam: INITIALIZING },
      // Post-await: cam was still 'initializing' so it falls back to
      // 'uninitialized'.
      { mic: GRANTED, cam: UNINIT },
    ]);
  });

  test("transport that doesn't acquire mic leaves mic at 'uninitialized'", async () => {
    const transport = MediaStateTransport.create();
    transport.acquiredOnInit = { cam: { deviceId: "cam-1" } as MediaDeviceInfo };
    const client = buildClient(transport);

    await client.initDevices();

    expect(client.mediaState).toEqual({ mic: UNINIT, cam: GRANTED });
  });

  test("partial DeviceError + non-acquired cam: cam stays 'uninitialized'", async () => {
    const transport = MediaStateTransport.create();
    transport.acquiredOnInit = {}; // neither acquired in this scenario
    transport.emitDeviceErrorDuringInit = new DeviceError(
      ["mic"],
      "permissions"
    );
    const client = buildClient(transport);

    await client.initDevices();

    // Mic is classified from the DeviceError (blocked). Cam was never
    // reported acquired and isn't in the error — falls back to 'uninitialized'.
    expect(client.mediaState).toEqual({
      mic: errored("blocked"),
      cam: UNINIT,
    });
  });

  test("transport rejection without acquisition events: both fall back to 'unknown'", async () => {
    const transport = MediaStateTransport.create();
    transport.acquiredOnInit = {};
    transport.initDevicesShouldThrow = new Error("boom");
    const client = buildClient(transport);

    await expect(client.initDevices()).rejects.toThrow("boom");

    expect(client.mediaState).toEqual({
      mic: errored("unknown"),
      cam: errored("unknown"),
    });
  });

  test("needsInit gate: both opted out + no acquisition → no implicit init loop", async () => {
    // If the user opts out of both devices and the transport respects that,
    // mediaState stays at 'uninitialized'. needsInit must NOT keep firing
    // on every connect() — that would loop forever.
    const transport = MediaStateTransport.create();
    transport.acquiredOnInit = {};
    const client = buildClient(transport, {
      enableMic: false,
      enableCam: false,
    });

    await client.connect();
    await client.disconnect();
    await client.connect();

    // needsInit considers only requested devices, so with both opted out it
    // returns false and no implicit init is triggered.
    expect(transport.initDevicesCallCount).toBe(0);
  });
});
