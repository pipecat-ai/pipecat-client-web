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

export type DeviceState = "not_ready" | "initializing" | "ready" | "blocked";

export enum DeviceStateEnum {
  NOT_READY = "not_ready",
  INITIALIZING = "initializing",
  READY = "ready",
  BLOCKED = "blocked",
}

export type Participant = {
  id: string;
  name: string;
  local: boolean;
};
