/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

export class RTVIError extends Error {
  readonly status: number | undefined;

  constructor(message?: string, status?: number | undefined) {
    super(message);
    this.status = status;
  }
}

export class ConnectionTimeoutError extends RTVIError {
  constructor(message?: string | undefined) {
    super(
      message ??
        "Bot did not enter ready state within the specified timeout period."
    );
  }
}

export class StartBotError extends RTVIError {
  readonly error: string = "invalid-request-error";
  constructor(message?: string | undefined, status?: number) {
    super(
      message ?? `Failed to connect / invalid auth bundle from base url`,
      status ?? 500
    );
  }
}

export class TransportStartError extends RTVIError {
  constructor(message?: string | undefined) {
    super(message ?? "Unable to connect to transport");
  }
}

export class InvalidTransportParamsError extends RTVIError {
  constructor(message?: string | undefined) {
    super(message ?? "Invalid transport connection parameters");
  }
}

export class BotNotReadyError extends RTVIError {
  constructor(message?: string | undefined) {
    super(
      message ??
        "Attempt to call action on transport when not in 'ready' state."
    );
  }
}

export class BotAlreadyStartedError extends RTVIError {
  constructor(message?: string | undefined) {
    super(
      message ??
        "Pipecat client has already been started. Please call disconnect() before starting again."
    );
  }
}

export class UnsupportedFeatureError extends RTVIError {
  readonly feature: string;
  constructor(feature: string, source?: string, message?: string) {
    let msg = `${feature} not supported${message ? `: ${message}` : ""}`;
    if (source) {
      msg = `${source} does not support ${feature}${
        message ? `: ${message}` : ""
      }`;
    }
    super(msg);
    this.feature = feature;
  }
}

export class MessageTooLargeError extends RTVIError {
  constructor(message?: string | undefined) {
    super(
      message ?? "Message size exceeds the maximum allowed limit for transport."
    );
  }
}

export type DeviceArray = Array<"cam" | "mic" | "speaker">;
export type DeviceErrorType =
  | "in-use"
  | "permissions"
  | "undefined-mediadevices"
  | "not-found"
  | "constraints"
  | "unknown";
export type DeviceErrorDetails = Record<
  string,
  string | boolean | number | Error
>;

export class DeviceError extends RTVIError {
  readonly devices: DeviceArray;
  readonly type: DeviceErrorType;
  readonly details: DeviceErrorDetails | undefined;
  constructor(
    devices: DeviceArray,
    type: DeviceErrorType,
    message?: string,
    details?: DeviceErrorDetails
  ) {
    super(message ?? `Device error for ${devices.join(", ")}: ${type}`);
    this.devices = devices;
    this.type = type;
    this.details = details;
  }
}
