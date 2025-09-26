/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { DeviceState, RTVIError, RTVIMessage, TransportState } from "../rtvi";
import { PipecatClientOptions, RTVIEventCallbacks } from "./client";

export type Tracks = {
  local: {
    audio?: MediaStreamTrack;
    video?: MediaStreamTrack;
    screenAudio?: MediaStreamTrack;
    screenVideo?: MediaStreamTrack;
  };
  bot?: {
    audio?: MediaStreamTrack;
    screenAudio?: undefined;
    screenVideo?: undefined;
    video?: MediaStreamTrack;
  };
};

export type TransportConnectionParams = unknown;

export abstract class Transport {
  protected declare _options: PipecatClientOptions;
  protected declare _onMessage: (ev: RTVIMessage) => void;
  protected declare _callbacks: RTVIEventCallbacks;
  protected declare _abortController: AbortController | undefined;
  protected _state: TransportState = "disconnected";
  protected _deviceState: DeviceState = "not_ready";

  constructor() {}

  /** called from PipecatClient constructor to wire up callbacks */
  abstract initialize(
    options: PipecatClientOptions,
    messageHandler: (ev: RTVIMessage) => void
  ): void;

  /**
   * This method is intended to initialize cam/mic devices. It is wrapped
   * by PipecatClient.initDevices and should not be called directly. It is also
   * called as part of PipecatClient.connect if it has not already called.
   */
  abstract initDevices(): Promise<void>;

  /**
   * Establishes a connection with the remote server. This is the main entry
   * point for the transport to start sending and receiving media and messages.
   * This is called from PipecatClient.connect() and should not be called directly.
   * @param connectParams - This type will ultimately be defned by the transport
   * implementation. It is used to pass connection parameters to the transport.
   */
  connect(connectParams?: TransportConnectionParams): Promise<void> {
    this._abortController = new AbortController();
    let validatedParams = connectParams;
    try {
      validatedParams = this._validateConnectionParams(connectParams);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      throw new RTVIError(
        `Invalid connection params: ${e.message}. Please check your connection params and try again.`
      );
    }
    return this._connect(validatedParams);
  }

  abstract _validateConnectionParams(connectParams?: unknown): unknown;

  abstract _connect(connectParams?: TransportConnectionParams): Promise<void>;
  /**
   * Disconnects the transport from the remote server. This is called from
   * PipecatClient.disconnect() and should not be called directly.
   */
  disconnect(): Promise<void> {
    if (this._abortController) {
      this._abortController.abort();
    }
    return this._disconnect();
  }
  abstract _disconnect(): Promise<void>;
  abstract sendReadyMessage(): void;

  abstract get state(): TransportState;
  abstract set state(state: TransportState);

  abstract get deviceState(): DeviceState;
  abstract set deviceState(state: DeviceState);

  abstract getAllMics(): Promise<MediaDeviceInfo[]>;
  abstract getAllCams(): Promise<MediaDeviceInfo[]>;
  abstract getAllSpeakers(): Promise<MediaDeviceInfo[]>;

  abstract updateMic(micId: string): void;
  abstract updateCam(camId: string): void;
  abstract updateSpeaker(speakerId: string): void;

  abstract get selectedMic(): MediaDeviceInfo | Record<string, never>;
  abstract get selectedCam(): MediaDeviceInfo | Record<string, never>;
  abstract get selectedSpeaker(): MediaDeviceInfo | Record<string, never>;

  abstract enableMic(enable: boolean): void;
  abstract enableCam(enable: boolean): void;
  abstract enableScreenShare(enable: boolean): void;
  abstract get isCamEnabled(): boolean;
  abstract get isMicEnabled(): boolean;
  abstract get isSharingScreen(): boolean;

  abstract sendMessage(message: RTVIMessage): void;

  abstract tracks(): Tracks;
}

export class TransportWrapper {
  private _transport: Transport;
  private _proxy: Transport;

  constructor(transport: Transport) {
    this._transport = transport;
    this._proxy = new Proxy(this._transport, {
      get: (target, prop, receiver) => {
        if (typeof target[prop as keyof Transport] === "function") {
          let errMsg;
          switch (String(prop)) {
            // Disable methods that modify the lifecycle of the call. These operations
            // should be performed via the Pipecat client in order to keep state in sync.
            case "initialize":
              errMsg = `Direct calls to initialize() are disabled and used internally by the PipecatClient.`;
              break;
            case "initDevices":
              errMsg = `Direct calls to initDevices() are disabled. Please use the PipecatClient.initDevices() wrapper or let PipecatClient.connect() call it for you.`;
              break;
            case "sendReadyMessage":
              errMsg = `Direct calls to sendReadyMessage() are disabled and used internally by the PipecatClient.`;
              break;
            case "connect":
              errMsg = `Direct calls to connect() are disabled. Please use the PipecatClient.connect() wrapper.`;
              break;
            case "disconnect":
              errMsg = `Direct calls to disconnect() are disabled. Please use the PipecatClient.disconnect() wrapper.`;
              break;
          }
          if (errMsg) {
            return () => {
              throw new Error(errMsg);
            };
          }
          // Forward other method calls
          return (...args: unknown[]) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            return (target[prop as keyof Transport] as Function)(...args);
          };
        }
        // Forward property access
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  get proxy(): Transport {
    return this._proxy;
  }
}
