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
