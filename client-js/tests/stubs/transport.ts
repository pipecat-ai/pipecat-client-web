/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { PipecatClientOptions, Tracks, Transport } from "../../client";
import { RTVIMessage, RTVIMessageType, TransportState } from "../../rtvi";

class mockState {
  public isSharingScreen = false;
}

export class TransportStub extends Transport {
  private _mockState: mockState;

  constructor() {
    super();
    this._mockState = new mockState();
  }

  static create(): Transport {
    return new TransportStub();
  }

  public initDevices(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.state = "initializing";
      setTimeout(() => {
        this.state = "initialized";
        resolve();
      }, 100);
    });
  }

  public initialize(
    options: PipecatClientOptions,
    messageHandler: (ev: RTVIMessage) => void
  ): void {
    this._onMessage = messageHandler;
    this._callbacks = options.callbacks ?? {};

    this.state = "disconnected";
  }

  public _validateConnectionParams(connectParams?: unknown): unknown {
    return connectParams;
  }

  public async _connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.state = "connecting";

      setTimeout(() => {
        this.state = "connected";
        resolve();
      }, 100);
    });
  }

  public async _disconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.state = "disconnecting";
      setTimeout(() => {
        this.state = "disconnected";
        resolve();
      }, 100);
    });
  }

  async sendReadyMessage(): Promise<void> {
    return new Promise<void>((resolve) => {
      (async () => {
        this.state = "ready";

        resolve();

        this._onMessage({
          label: "rtvi-ai",
          id: "123",
          type: RTVIMessageType.BOT_READY,
          data: { version: "1.0.0" },
        } as RTVIMessage);
      })();
    });
  }

  public getAllMics(): Promise<MediaDeviceInfo[]> {
    return Promise.resolve([]);
  }
  public getAllCams(): Promise<MediaDeviceInfo[]> {
    return Promise.resolve([]);
  }
  public getAllSpeakers(): Promise<MediaDeviceInfo[]> {
    return Promise.resolve([]);
  }

  public updateMic(micId: string): void {
    console.log(micId);
    return;
  }
  public updateCam(camId: string): void {
    console.log(camId);
    return;
  }
  public updateSpeaker(speakerId: string): void {
    console.log(speakerId);
    return;
  }

  public get selectedMic(): MediaDeviceInfo | Record<string, never> {
    return {};
  }
  public get selectedCam(): MediaDeviceInfo | Record<string, never> {
    return {};
  }
  public get selectedSpeaker(): MediaDeviceInfo | Record<string, never> {
    return {};
  }

  public enableMic(enable: boolean): void {
    console.log(enable);
    return;
  }
  public enableCam(enable: boolean): void {
    console.log(enable);
    return;
  }
  public enableScreenShare(enable: boolean): void {
    this._mockState.isSharingScreen = enable;
    return;
  }

  public get isCamEnabled(): boolean {
    return true;
  }
  public get isMicEnabled(): boolean {
    return true;
  }
  public get isSharingScreen(): boolean {
    return this._mockState.isSharingScreen;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public sendMessage(message: RTVIMessage) {
    return true;
  }

  // to simulate a message being received
  public handleMessage(message: RTVIMessage): void {
    this._onMessage(message);
  }

  public get state(): TransportState {
    return this._state;
  }

  private set state(state: TransportState) {
    if (this._state === state) return;

    this._state = state;
    this._callbacks.onTransportStateChanged?.(state);
  }

  public tracks(): Tracks {
    return { local: { audio: undefined, video: undefined } };
  }
}

export default TransportStub;
