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

export type Participant = {
  id: string;
  name: string;
  local: boolean;
};
