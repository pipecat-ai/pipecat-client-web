import { deepmergeCustom } from "deepmerge-ts";
import { EventEmitter } from "events";
import type TypedEmitter from "typed-emitter";

import {
  VoiceClientConfigLLM,
  VoiceClientConfigOptions,
  VoiceClientLLMMessage,
  VoiceClientOptions,
  VoiceMessage,
  VoiceMessageTranscript,
  VoiceMessageType,
} from ".";
import * as VoiceErrors from "./errors";
import { VoiceEvent, VoiceEvents } from "./events";
import {
  DailyTransport,
  Participant,
  Transport,
  TransportState,
} from "./transport";

export type VoiceEventCallbacks = Partial<{
  onConnected: () => void;
  onDisconnected: () => void;
  onTransportStateChanged: (state: TransportState) => void;
  onConfigUpdated: (config: VoiceClientConfigOptions) => void;
  onBotConnected: (participant: Participant) => void;
  onBotReady: () => void;
  onBotDisconnected: (participant: Participant) => void;
  onParticipantJoined: (participant: Participant) => void;
  onParticipantLeft: (participant: Participant) => void;

  onAvailableCamsUpdated: (cams: MediaDeviceInfo[]) => void;
  onAvailableMicsUpdated: (mics: MediaDeviceInfo[]) => void;
  onCamUpdated: (cam: MediaDeviceInfo) => void;
  onMicUpdated: (cam: MediaDeviceInfo) => void;

  onTrackStarted: (track: MediaStreamTrack, participant?: Participant) => void;
  onTrackStopped: (track: MediaStreamTrack, participant?: Participant) => void;
  onLocalAudioLevel: (level: number) => void;
  onRemoteAudioLevel: (level: number, participant: Participant) => void;
  onBotStartedTalking: (participant: Participant) => void;
  onBotStoppedTalking: (participant: Participant) => void;
  onLocalStartedTalking: () => void;
  onLocalStoppedTalking: () => void;
  onTranscript: (text: VoiceMessageTranscript) => void;
  onJsonCompletion: (jsonString: string) => void;
}>;

export abstract class Client extends (EventEmitter as new () => TypedEmitter<VoiceEvents>) {
  protected _options: VoiceClientOptions;
  private _transport: Transport;
  private readonly _baseUrl: string;

  constructor(options: VoiceClientOptions) {
    super();

    this._baseUrl = options.baseUrl;

    // Wrap transport callbacks with event triggers
    // This allows for either functional callbacks or .on / .off event listeners
    // @TODO tidy up with a loop
    const wrappedCallbacks: VoiceEventCallbacks = {
      ...options.callbacks,
      onConnected: () => {
        options?.callbacks?.onConnected?.();
        this.emit(VoiceEvent.Connected);
      },
      onDisconnected: () => {
        options?.callbacks?.onDisconnected?.();
        this.emit(VoiceEvent.Disconnected);
      },
      onTransportStateChanged: (state: TransportState) => {
        options?.callbacks?.onTransportStateChanged?.(state);
        this.emit(VoiceEvent.TransportStateChanged, state);
      },
      onConfigUpdated: (config: VoiceClientConfigOptions) => {
        options?.callbacks?.onConfigUpdated?.(config);
        this.emit(VoiceEvent.ConfigUpdated, config);
      },
      onParticipantJoined: (p) => {
        options?.callbacks?.onParticipantJoined?.(p);
        this.emit(VoiceEvent.ParticipantConnected, p);
      },
      onParticipantLeft: (p) => {
        options?.callbacks?.onParticipantLeft?.(p);
        this.emit(VoiceEvent.ParticipantLeft, p);
      },
      onTrackStarted: (track, p) => {
        options?.callbacks?.onTrackStarted?.(track, p);
        this.emit(VoiceEvent.TrackStarted, track, p);
      },
      onTrackStopped: (track, p) => {
        options?.callbacks?.onTrackStopped?.(track, p);
        this.emit(VoiceEvent.TrackedStopped, track, p);
      },
      onBotConnected: (p) => {
        options?.callbacks?.onBotConnected?.(p);
        this.emit(VoiceEvent.BotConnected, p);
      },
      onBotReady: () => {
        options?.callbacks?.onBotReady?.();
        this.emit(VoiceEvent.BotReady);
      },
      onBotDisconnected: (p) => {
        options?.callbacks?.onBotDisconnected?.(p);
        this.emit(VoiceEvent.BotDisconnected, p);
      },
      onBotStartedTalking: (p) => {
        options?.callbacks?.onBotStartedTalking?.(p);
        this.emit(VoiceEvent.BotStartedTalking, p);
      },
      onBotStoppedTalking: (p) => {
        options?.callbacks?.onBotStoppedTalking?.(p);
        this.emit(VoiceEvent.BotStoppedTalking, p);
      },
      onRemoteAudioLevel: (level, p) => {
        options?.callbacks?.onRemoteAudioLevel?.(level, p);
        this.emit(VoiceEvent.RemoteAudioLevel, level, p);
      },
      onLocalStartedTalking: () => {
        options?.callbacks?.onLocalStartedTalking?.();
        this.emit(VoiceEvent.LocalStartedTalking);
      },
      onLocalStoppedTalking: () => {
        options?.callbacks?.onLocalStoppedTalking?.();
        this.emit(VoiceEvent.LocalStoppedTalking);
      },
      onLocalAudioLevel: (level) => {
        options?.callbacks?.onLocalAudioLevel?.(level);
        this.emit(VoiceEvent.LocalAudioLevel, level);
      },
    };

    // Instantiate the transport class
    this._transport = options?.transport
      ? new options.transport(
          {
            ...options,
            callbacks: wrappedCallbacks,
          },
          this.handleMessage.bind(this)
        )!
      : new DailyTransport(
          {
            ...options,
            callbacks: wrappedCallbacks,
          },
          this.handleMessage.bind(this)
        );

    // Update options to reference wrapped callbacks
    this._options = {
      ...options,
      callbacks: wrappedCallbacks,
    };
  }

  // ------ Transport methods
  public async start() {
    this._transport.state = "handshaking";

    const config: VoiceClientConfigOptions = this._options.config!;

    /**
     * SOF: placeholder service-side logic
     *
     * This should be replaced with a developer's own server-side logic
     * We have baked this in for the developer preview, so they do not need
     * to stand up a backend service to get started.
     *
     * If you are reading this, and want to build your own service, please
     * refer to the documentation for the expected API endpoints and payloads.
     */

    // Handshake with the server to get the room name and token
    // Note: this is transport specific.
    let room: string;
    let token: string;

    try {
      const req = await fetch(`${this._baseUrl}/authenticate`, {
        method: "POST",
        mode: "cors",
      });
      const data = await req.json();
      room = data.room;
      token = data.token;
    } catch (e) {
      throw new VoiceErrors.AuthenticationError(
        "Failed to authenticate with the server"
      );
    }

    if (!room || !token) {
      // In lieu of proper error codes, a failed authentication indicates
      // the server is busy.
      throw new VoiceErrors.RateLimitError();
    }
    /**
     * EOF: placeholder service-side logic
     */

    // Send a post request with the auth credentials and initial
    // configuration to the server
    try {
      await fetch(`${this._baseUrl}/start_bot`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ room, config: { ...config } }),
      });
    } catch {
      throw new VoiceErrors.BotStartError(`Failed to start bot at URL ${room}`);
    }

    await this._transport.connect({
      url: room,
      token,
    });
  }

  public async disconnect() {
    await this._transport.disconnect();
  }

  public get state(): TransportState {
    return this._transport.state;
  }

  // ------ Device methods

  public async getAllMics() {
    return await this._transport.getAllMics();
  }

  public async getAllCams() {
    return await this._transport.getAllCams();
  }

  public get selectedMic() {
    return this._transport.selectedMic;
  }

  public get selectedCam() {
    return this._transport.selectedCam;
  }

  public updateMic(micId: string) {
    this._transport.updateMic(micId);
  }

  public updateCam(camId: string) {
    this._transport.updateCam(camId);
  }

  public enableMic(enable: boolean) {
    this._transport.enableMic(enable);
  }

  public get isMicEnabled(): boolean {
    return this._transport.isMicEnabled;
  }

  public enableCam(enable: boolean) {
    this._transport.enableCam(enable);
  }

  public get isCamEnabled(): boolean {
    return this._transport.isCamEnabled;
  }

  public tracks() {
    return this._transport.tracks();
  }

  // ------ Config methods

  public get config(): VoiceClientConfigOptions {
    return this._options.config!;
  }

  /**
   * Set new configuration parameters.
   * Note: this does nothing if the transport is connectd. Use updateConfig method instead
   * @param config - VoiceClientConfigOptions partial object with the new configuration
   */
  protected set config(config: VoiceClientConfigOptions) {
    this._options.config = {
      ...this._options.config,
      ...config,
    };
  }

  /**
   * Update pipeline and seervices
   * @param config - VoiceClientConfigOptions partial object with the new configuration
   * @param options - Options for the update
   * @param options.useDeepMerge - Whether to use deep merge or shallow merge
   * @param options.sendPartial - Update single service config (e.g. llm or tts) or the whole config
   */
  public updateConfig(
    config: VoiceClientConfigOptions,
    {
      useDeepMerge = false,
      sendPartial = false,
    }: { useDeepMerge?: boolean; sendPartial?: boolean }
  ) {
    // @TODO refactor this method to use a reducer
    if (useDeepMerge) {
      const customMerge = deepmergeCustom({ mergeArrays: false });
      this.config = customMerge(this.config, config);
    } else {
      this.config = config;
    }

    // Only send the partial config if the bot is ready to prevent
    // potential racing conditions whilst pipeline is instantiating
    if (this._transport.state === "ready") {
      this._transport.sendMessage(
        VoiceMessage.config(sendPartial ? config : this.config)
      );
    }

    this._options.callbacks?.onConfigUpdated?.(this.config);
  }

  // ------ LLM context methods

  public get llmContext(): VoiceClientConfigLLM | undefined {
    return this._options.config?.llm;
  }

  /**
   * Merge the current LLM context with a new provided context
   * @param llmConfig - VoiceClientConfigLLM partial object with the new context
   */
  public set llmContext(llmConfig: VoiceClientConfigLLM) {
    this.config = {
      ...this._options.config,
      llm: {
        ...this._options.config?.llm,
        ...llmConfig,
      },
    } as VoiceClientConfigOptions;

    if (this._transport.state === "ready") {
      this._transport.sendMessage(VoiceMessage.updateLLMContext(llmConfig));
    }

    this._options.callbacks?.onConfigUpdated?.(this.config);
  }

  /**
   * Append a message to the live LLM context. Requires the bot to be connected.
   * @param message - LLM message (role and content)
   */
  public appendLLMContext(
    messages: VoiceClientLLMMessage | VoiceClientLLMMessage[]
  ): void {
    if (this._transport.state === "ready") {
      if (!Array.isArray(messages)) {
        messages = [messages];
      }
      this._transport.sendMessage(VoiceMessage.appendLLMContext(messages));
    } else {
      throw new VoiceErrors.VoiceError(
        "Attempt to update LLM context while transport not in ready state"
      );
    }
  }

  // ------ Utility methods

  /**
   * Send a string to the STT model to be spoken. Requires the bot to be connected.
   * @param text - The text to be spoken
   * @param interrupt - Whether to interrupt the current speech (if the bot is talking)
   */
  public say(text: string, interrupt: boolean = false): void {
    if (this._transport.state === "ready") {
      this._transport.sendMessage(VoiceMessage.speak(text, interrupt));
    } else {
      throw new VoiceErrors.VoiceError(
        "Attempted to speak while transport not in ready state"
      );
    }
  }

  /**
   * Manually interrupt the bot's TTS. Requires the bot to be connected.
   */
  public interrupt(): void {
    if (this._transport.state === "ready") {
      this._transport.sendMessage(VoiceMessage.interrupt());
    } else {
      throw new VoiceErrors.VoiceError(
        "Attempted to interrupt bot TTS write transport not in ready state"
      );
    }
  }

  /**
   * Get the session expiry time for the transport session (if applicable)
   */
  public get transportExpiry(): number | undefined {
    if (
      this._transport.state === "connected" ||
      this._transport.state === "ready"
    ) {
      return this._transport.expiry;
    } else {
      throw new VoiceErrors.VoiceError(
        "Attempted to get transport expiry time when transport not in connected or ready state"
      );
    }
  }

  // ------ Handlers
  protected handleMessage(ev: VoiceMessage): void {
    if (ev instanceof VoiceMessageTranscript) {
      return this._options.callbacks?.onTranscript?.(ev);
    }

    switch (ev.type) {
      case VoiceMessageType.BOT_READY:
        this._transport.state = "ready";
        this._options.callbacks?.onBotReady?.();
        break;
      case VoiceMessageType.JSON_COMPLETION:
        this._options.callbacks?.onJsonCompletion?.(ev.data as string);
        break;
    }

    /* @TODO: transcription events
    if (ev.fromId) {
      msg = new VoiceMessageTranscript({ text: "test", final: true });
    } else {
      msg = {
        type: "unknown",
        data: ev.data,
      } as VoiceMessage;
    }*/
  }
}
