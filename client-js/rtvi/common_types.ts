export type TransportState =
  | "disconnected"
  | "initializing"
  | "initialized"
  | "authenticating"
  | "authenticated"
  | "connecting"
  | "connected"
  | "ready"
  | "disconnecting"
  | "error";

export enum TransportStateEnum {
  DISCONNECTED = "disconnected",
  INITIALIZING = "initializing",
  INITIALIZED = "initialized",
  AUTHENTICATING = "authenticating",
  AUTHENTICATED = "authenticated",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  READY = "ready",
  DISCONNECTING = "disconnecting",
  ERROR = "error",
}

export type Participant = {
  id: string;
  name: string;
  local: boolean;
};

/**
 * Per-device lifecycle state, tracked independently for the mic and the cam.
 * Modelled after daily-react's DailyDevices. Transitions are driven by
 * explicit calls to PipecatClient.initDevices() and by DeviceError events.
 * Never by transport connect/disconnect.
 */
export type DeviceState =
  /** initDevices() has not been called yet for this device */
  | "uninitialized"
  /** initDevices() is in flight (enumeration / permission request) */
  | "initializing"
  /** Device is enumerated and ready to use */
  | "granted"
  /** Device is in an error state and could not be acquired */
  | "error";

/**
 * Per-device error categories. Only meaningful when DeviceStatus.state is
 * 'error'. Mirrors the shape of DeviceErrorType but expressed in
 * MediaState's own vocabulary so consumers can render UI without going
 * through the underlying error object.
 */
export type DeviceErrorReason =
  /** User explicitly denied permission */
  | "blocked"
  /** Hardware is busy in another application */
  | "already-in-use"
  /** No matching hardware was found */
  | "not-found"
  /** getUserMedia constraints couldn't be satisfied */
  | "invalid-constraints"
  /** Browser API is unavailable (legacy browser, insecure context) */
  | "not-supported"
  /** Catch-all for errors we couldn't classify */
  | "unknown";

/**
 * Per-device status. A discriminated union: when `state` is `'error'`, the
 * `reason` field describes the error category (and `details` may carry the
 * raw error payload). Consumers branch on `state` to decide what to render.
 */
export type DeviceStatus =
  | { state: "uninitialized" | "initializing" | "granted" }
  | { state: "error"; reason: DeviceErrorReason; details?: unknown };

/**
 * Per-device state on PipecatClient, exposed independently of TransportState.
 * Speakers are intentionally not tracked here: output devices have no
 * permission or in-use failure mode, only enumeration.
 */
export type MediaState = {
  mic: DeviceStatus;
  cam: DeviceStatus;
};
