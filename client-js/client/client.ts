/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import EventEmitter from "events";
import TypedEmitter from "typed-emitter";

import packageJson from "../package.json";
import {
  BotLLMSearchResponseData,
  BotLLMTextData,
  BotOutputData,
  BotReadyData,
  BotTTSTextData,
  ClientMessageData,
  ErrorData,
  LLMContextMessage,
  LLMFunctionCallData,
  LLMFunctionCallResult,
  Participant,
  PipecatMetricsData,
  RTVIEvent,
  RTVIEvents,
  RTVIMessage,
  RTVIMessageType,
  SendTextOptions,
  setAboutClient,
  TranscriptData,
  TransportState,
} from "../rtvi";
import * as RTVIErrors from "../rtvi/errors";
import { transportAlreadyStarted, transportReady } from "./decorators";
import { MessageDispatcher } from "./dispatcher";
import { logger, LogLevel } from "./logger";
import {
  APIRequest,
  ConnectionEndpoint,
  isAPIRequest,
  makeRequest,
} from "./rest_helpers";
import {
  Tracks,
  Transport,
  TransportConnectionParams,
  TransportWrapper,
} from "./transport";
import { learnAboutClient, messageSizeWithinLimit } from "./utils";

export type FunctionCallParams = {
  functionName: string;
  arguments: Record<string, unknown>;
};

export type FunctionCallCallback = (
  fn: FunctionCallParams
) => Promise<LLMFunctionCallResult | void>;

export type RTVIEventCallbacks = Partial<{
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (message: RTVIMessage) => void;
  onTransportStateChanged: (state: TransportState) => void;

  onBotStarted: (botResponse: unknown) => void;
  onBotConnected: (participant: Participant) => void;
  onBotReady: (botReadyData: BotReadyData) => void;
  onBotDisconnected: (participant: Participant) => void;
  onMetrics: (data: PipecatMetricsData) => void;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onServerMessage: (data: any) => void;
  onMessageError: (message: RTVIMessage) => void;

  onParticipantJoined: (participant: Participant) => void;
  onParticipantLeft: (participant: Participant) => void;

  onAvailableCamsUpdated: (cams: MediaDeviceInfo[]) => void;
  onAvailableMicsUpdated: (mics: MediaDeviceInfo[]) => void;
  onAvailableSpeakersUpdated: (speakers: MediaDeviceInfo[]) => void;
  onCamUpdated: (cam: MediaDeviceInfo) => void;
  onMicUpdated: (mic: MediaDeviceInfo) => void;
  onSpeakerUpdated: (speaker: MediaDeviceInfo) => void;
  onDeviceError: (error: RTVIErrors.DeviceError) => void;
  onTrackStarted: (track: MediaStreamTrack, participant?: Participant) => void;
  onTrackStopped: (track: MediaStreamTrack, participant?: Participant) => void;
  onScreenTrackStarted: (
    track: MediaStreamTrack,
    participant?: Participant
  ) => void;
  onScreenTrackStopped: (
    track: MediaStreamTrack,
    participant?: Participant
  ) => void;
  onScreenShareError: (errorMessage: string) => void;
  onLocalAudioLevel: (level: number) => void;
  onRemoteAudioLevel: (level: number, participant: Participant) => void;

  onBotStartedSpeaking: () => void;
  onBotStoppedSpeaking: () => void;
  onUserStartedSpeaking: () => void;
  onUserStoppedSpeaking: () => void;
  onUserTranscript: (data: TranscriptData) => void;
  onBotOutput: (data: BotOutputData) => void;
  onBotTranscript: (data: BotLLMTextData) => void;

  onBotLlmText: (data: BotLLMTextData) => void;
  onBotLlmStarted: () => void;
  onBotLlmStopped: () => void;
  onBotTtsText: (data: BotTTSTextData) => void;
  onBotTtsStarted: () => void;
  onBotTtsStopped: () => void;

  onLLMFunctionCall: (data: LLMFunctionCallData) => void;
  onBotLlmSearchResponse: (data: BotLLMSearchResponseData) => void;
}>;

export interface PipecatClientOptions {
  /**
   * Transport class for media streaming
   */
  transport: Transport;

  /**
   * Optional callback methods for RTVI events
   */
  callbacks?: RTVIEventCallbacks;

  /**
   * Enable user mic input
   *
   * Default to true
   */
  enableMic?: boolean;

  /**
   * Enable user cam input
   *
   * Default to false
   */
  enableCam?: boolean;

  /**
   * Enable screen sharing
   *
   * Default to false
   */
  enableScreenShare?: boolean;
}

abstract class RTVIEventEmitter extends (EventEmitter as unknown as new () => TypedEmitter<RTVIEvents>) {}

export class PipecatClient extends RTVIEventEmitter {
  protected _options: PipecatClientOptions;
  private _connectResolve: ((value: BotReadyData) => void) | undefined;
  protected _transport: Transport;
  protected _transportWrapper: TransportWrapper;
  declare protected _messageDispatcher: MessageDispatcher;
  protected _functionCallCallbacks: Record<string, FunctionCallCallback> = {};
  protected _abortController: AbortController | undefined;

  private _botTranscriptionWarned = false;

  constructor(options: PipecatClientOptions) {
    super();

    setAboutClient(learnAboutClient());

    this._transport = options.transport;
    this._transportWrapper = new TransportWrapper(this._transport);

    // Wrap transport callbacks with event triggers
    // This allows for either functional callbacks or .on / .off event listeners
    const wrappedCallbacks: RTVIEventCallbacks = {
      ...options.callbacks,
      onMessageError: (message: RTVIMessage) => {
        options?.callbacks?.onMessageError?.(message);
        this.emit(RTVIEvent.MessageError, message);
      },
      onError: (message: RTVIMessage) => {
        options?.callbacks?.onError?.(message);
        try {
          this.emit(RTVIEvent.Error, message);
        } catch (e) {
          if (e instanceof Error && e.message.includes("Unhandled error")) {
            if (!options?.callbacks?.onError) {
              logger.debug(
                "No onError callback registered to handle error",
                message
              );
            }
          } else {
            logger.debug("Could not emit error", message, e);
          }
        }
        const data = message.data as ErrorData;
        if (data?.fatal) {
          logger.error("Fatal error reported. Disconnecting...");
          this.disconnect();
        }
      },
      onConnected: () => {
        options?.callbacks?.onConnected?.();
        this.emit(RTVIEvent.Connected);
      },
      onDisconnected: () => {
        options?.callbacks?.onDisconnected?.();
        this.emit(RTVIEvent.Disconnected);
      },
      onTransportStateChanged: (state: TransportState) => {
        options?.callbacks?.onTransportStateChanged?.(state);
        this.emit(RTVIEvent.TransportStateChanged, state);
      },
      onParticipantJoined: (p) => {
        options?.callbacks?.onParticipantJoined?.(p);
        this.emit(RTVIEvent.ParticipantConnected, p);
      },
      onParticipantLeft: (p) => {
        options?.callbacks?.onParticipantLeft?.(p);
        this.emit(RTVIEvent.ParticipantLeft, p);
      },
      onTrackStarted: (track, p) => {
        options?.callbacks?.onTrackStarted?.(track, p);
        this.emit(RTVIEvent.TrackStarted, track, p);
      },
      onTrackStopped: (track, p) => {
        options?.callbacks?.onTrackStopped?.(track, p);
        this.emit(RTVIEvent.TrackStopped, track, p);
      },
      onScreenTrackStarted: (track, p) => {
        options?.callbacks?.onScreenTrackStarted?.(track, p);
        this.emit(RTVIEvent.ScreenTrackStarted, track, p);
      },
      onScreenTrackStopped: (track, p) => {
        options?.callbacks?.onScreenTrackStopped?.(track, p);
        this.emit(RTVIEvent.ScreenTrackStopped, track, p);
      },
      onScreenShareError: (errorMessage) => {
        options?.callbacks?.onScreenShareError?.(errorMessage);
        this.emit(RTVIEvent.ScreenShareError, errorMessage);
      },
      onAvailableCamsUpdated: (cams) => {
        options?.callbacks?.onAvailableCamsUpdated?.(cams);
        this.emit(RTVIEvent.AvailableCamsUpdated, cams);
      },
      onAvailableMicsUpdated: (mics) => {
        options?.callbacks?.onAvailableMicsUpdated?.(mics);
        this.emit(RTVIEvent.AvailableMicsUpdated, mics);
      },
      onAvailableSpeakersUpdated: (speakers) => {
        options?.callbacks?.onAvailableSpeakersUpdated?.(speakers);
        this.emit(RTVIEvent.AvailableSpeakersUpdated, speakers);
      },
      onCamUpdated: (cam) => {
        options?.callbacks?.onCamUpdated?.(cam);
        this.emit(RTVIEvent.CamUpdated, cam);
      },
      onMicUpdated: (mic) => {
        options?.callbacks?.onMicUpdated?.(mic);
        this.emit(RTVIEvent.MicUpdated, mic);
      },
      onSpeakerUpdated: (speaker) => {
        options?.callbacks?.onSpeakerUpdated?.(speaker);
        this.emit(RTVIEvent.SpeakerUpdated, speaker);
      },
      onDeviceError: (error) => {
        options?.callbacks?.onDeviceError?.(error);
        this.emit(RTVIEvent.DeviceError, error);
      },
      onBotStarted: (botResponse: unknown) => {
        options?.callbacks?.onBotStarted?.(botResponse);
        this.emit(RTVIEvent.BotStarted, botResponse);
      },
      onBotConnected: (p) => {
        options?.callbacks?.onBotConnected?.(p);
        this.emit(RTVIEvent.BotConnected, p);
      },
      onBotReady: (botReadyData: BotReadyData) => {
        options?.callbacks?.onBotReady?.(botReadyData);
        this.emit(RTVIEvent.BotReady, botReadyData);
      },
      onBotDisconnected: (p) => {
        options?.callbacks?.onBotDisconnected?.(p);
        this.emit(RTVIEvent.BotDisconnected, p);
      },
      onBotStartedSpeaking: () => {
        options?.callbacks?.onBotStartedSpeaking?.();
        this.emit(RTVIEvent.BotStartedSpeaking);
      },
      onBotStoppedSpeaking: () => {
        options?.callbacks?.onBotStoppedSpeaking?.();
        this.emit(RTVIEvent.BotStoppedSpeaking);
      },
      onRemoteAudioLevel: (level, p) => {
        options?.callbacks?.onRemoteAudioLevel?.(level, p);
        this.emit(RTVIEvent.RemoteAudioLevel, level, p);
      },
      onUserStartedSpeaking: () => {
        options?.callbacks?.onUserStartedSpeaking?.();
        this.emit(RTVIEvent.UserStartedSpeaking);
      },
      onUserStoppedSpeaking: () => {
        options?.callbacks?.onUserStoppedSpeaking?.();
        this.emit(RTVIEvent.UserStoppedSpeaking);
      },
      onLocalAudioLevel: (level) => {
        options?.callbacks?.onLocalAudioLevel?.(level);
        this.emit(RTVIEvent.LocalAudioLevel, level);
      },
      onUserTranscript: (data) => {
        options?.callbacks?.onUserTranscript?.(data);
        this.emit(RTVIEvent.UserTranscript, data);
      },
      onBotOutput: (data) => {
        options?.callbacks?.onBotOutput?.(data);
        this.emit(RTVIEvent.BotOutput, data);
      },
      onBotTranscript: (text) => {
        if (!this._botTranscriptionWarned) {
          logger.warn(
            "[Pipecat Client] Bot transcription is deprecated. Please use the onBotOutput instead."
          );
          this._botTranscriptionWarned = true;
        }
        options?.callbacks?.onBotTranscript?.(text);
        this.emit(RTVIEvent.BotTranscript, text);
      },
      onBotLlmText: (text) => {
        options?.callbacks?.onBotLlmText?.(text);
        this.emit(RTVIEvent.BotLlmText, text);
      },
      onBotLlmStarted: () => {
        options?.callbacks?.onBotLlmStarted?.();
        this.emit(RTVIEvent.BotLlmStarted);
      },
      onBotLlmStopped: () => {
        options?.callbacks?.onBotLlmStopped?.();
        this.emit(RTVIEvent.BotLlmStopped);
      },
      onBotTtsText: (text) => {
        options?.callbacks?.onBotTtsText?.(text);
        this.emit(RTVIEvent.BotTtsText, text);
      },
      onBotTtsStarted: () => {
        options?.callbacks?.onBotTtsStarted?.();
        this.emit(RTVIEvent.BotTtsStarted);
      },
      onBotTtsStopped: () => {
        options?.callbacks?.onBotTtsStopped?.();
        this.emit(RTVIEvent.BotTtsStopped);
      },
    };

    // Update options to reference wrapped callbacks and config defaults
    this._options = {
      ...options,
      callbacks: wrappedCallbacks,
      enableMic: options.enableMic ?? true,
      enableCam: options.enableCam ?? false,
      enableScreenShare: options.enableScreenShare ?? false,
    };

    // Instantiate the transport class and bind message handler
    this._initialize();

    // Get package version number
    logger.debug("[Pipecat Client] Initialized", this.version);
  }

  public setLogLevel(level: LogLevel) {
    logger.setLevel(level);
  }

  // ------ Transport methods

  /**
   * Initialize local media devices
   */
  public async initDevices() {
    logger.debug("[Pipecat Client] Initializing devices...");
    await this._transport.initDevices();
  }

  /**
   * startBot() is a method that initiates the bot by posting to a specified endpoint
   * that optionally returns connection parameters for establishing a transport session.
   * @param startBotParams
   * @returns Promise that resolves to TransportConnectionParams or unknown
   */
  @transportAlreadyStarted
  public async startBot(startBotParams: APIRequest): Promise<unknown> {
    if (this._transport.state === "disconnected") {
      await this._transport.initDevices();
    }
    this._transport.state = "authenticating";
    this._transport.startBotParams = startBotParams;
    this._abortController = new AbortController();
    let response: unknown;
    try {
      response = await makeRequest(startBotParams, this._abortController);
    } catch (e) {
      let errMsg = "An unknown error occurred while starting the bot.";
      let status;
      if (e instanceof Response) {
        const errResp = await e.json();
        errMsg = errResp.info ?? errResp.detail ?? e.statusText;
        status = e.status;
      } else if (e instanceof Error) {
        errMsg = e.message;
      }
      this._options.callbacks?.onError?.(
        new RTVIMessage(RTVIMessageType.ERROR_RESPONSE, {
          message: errMsg,
          fatal: true,
        })
      );
      throw new RTVIErrors.StartBotError(errMsg, status);
    }
    this._transport.state = "authenticated";
    this._options.callbacks?.onBotStarted?.(response);
    return response;
  }

  /**
   * The `connect` function establishes a transport session and awaits a
   * bot-ready signal, handling various connection states and errors.
   * @param {TransportConnectionParams} [connectParams] -
   * The `connectParams` parameter in the `connect` method should be of type
   * `TransportConnectionParams`. This parameter is passed to the transport
   * for establishing a transport session.
   * NOTE: `connectParams` as type `ConnectionEndpoint` IS NOW DEPRECATED. If you
   * want to authenticate and connect to a bot in one step, use
   * `startBotAndConnect()` instead.
   * @returns The `connect` method returns a Promise that resolves to an unknown value.
   */
  @transportAlreadyStarted
  public async connect(
    connectParams?: TransportConnectionParams | ConnectionEndpoint
  ): Promise<BotReadyData> {
    if (connectParams && isAPIRequest(connectParams)) {
      logger.warn(
        "Calling connect with an API endpoint is deprecated. Use startBotAndConnect() instead."
      );
      return this.startBotAndConnect(connectParams as APIRequest);
    }

    // Establish transport session and await bot ready signal
    return new Promise((resolve, reject) => {
      (async () => {
        this._connectResolve = resolve;

        if (this._transport.state === "disconnected") {
          await this._transport.initDevices();
        }

        try {
          await this._transport.connect(
            connectParams as TransportConnectionParams
          );
          await this._transport.sendReadyMessage();
        } catch (e) {
          this.disconnect();
          reject(e);
          return;
        }
      })();
    });
  }

  @transportAlreadyStarted
  public async startBotAndConnect(
    startBotParams: APIRequest
  ): Promise<BotReadyData> {
    const connectionParams = await this.startBot(startBotParams);
    return this.connect(connectionParams);
  }

  /**
   * Disconnect the voice client from the transport
   * Reset / reinitialize transport and abort any pending requests
   */
  public async disconnect(): Promise<void> {
    await this._transport.disconnect();
    this._messageDispatcher.disconnect();
  }

  /**
   * The _initialize function performs internal set up of the transport and
   * message dispatcher.
   */
  private _initialize() {
    this._transport.initialize(this._options, this.handleMessage.bind(this));

    // Create a new message dispatch queue for async message handling
    this._messageDispatcher = new MessageDispatcher(
      this._sendMessage.bind(this)
    );
  }

  /**
   * Internal wrapper around the transport's sendMessage method
   */
  private _sendMessage(message: RTVIMessage): void {
    if (!messageSizeWithinLimit(message, this._transport.maxMessageSize)) {
      const msg = `Message data too large. Max size is ${this._transport.maxMessageSize}`;
      this._options.callbacks?.onError?.(RTVIMessage.error(msg, false));
      throw new RTVIErrors.MessageTooLargeError(msg);
    }

    try {
      this._transport.sendMessage(message);
    } catch (error) {
      if (error instanceof Error) {
        this._options.callbacks?.onError?.(
          RTVIMessage.error(error.message, false)
        );
      } else {
        this._options.callbacks?.onError?.(
          RTVIMessage.error("Unknown error sending message", false)
        );
      }
      throw error;
    }
  }

  /**
   * Get the current state of the transport
   */
  public get connected(): boolean {
    return ["connected", "ready"].includes(this._transport.state);
  }

  public get transport(): Transport {
    return this._transportWrapper.proxy;
  }

  public get state(): TransportState {
    return this._transport.state;
  }

  public get version(): string {
    return packageJson.version;
  }

  // ------ Device methods

  public async getAllMics(): Promise<MediaDeviceInfo[]> {
    return await this._transport.getAllMics();
  }

  public async getAllCams(): Promise<MediaDeviceInfo[]> {
    return await this._transport.getAllCams();
  }

  public async getAllSpeakers(): Promise<MediaDeviceInfo[]> {
    return await this._transport.getAllSpeakers();
  }

  public get selectedMic() {
    return this._transport.selectedMic;
  }

  public get selectedCam() {
    return this._transport.selectedCam;
  }

  public get selectedSpeaker() {
    return this._transport.selectedSpeaker;
  }

  public updateMic(micId: string) {
    this._transport.updateMic(micId);
  }

  public updateCam(camId: string) {
    this._transport.updateCam(camId);
  }

  public updateSpeaker(speakerId: string) {
    this._transport.updateSpeaker(speakerId);
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

  public tracks(): Tracks {
    return this._transport.tracks();
  }

  public enableScreenShare(enable: boolean) {
    return this._transport.enableScreenShare(enable);
  }

  public get isSharingScreen(): boolean {
    return this._transport.isSharingScreen;
  }

  // ------ Messages

  /**
   * Directly send a message to the bot via the transport.
   * Do not await a response.
   * @param msgType - a string representing the message type
   * @param data - a dictionary of data to send with the message
   */
  @transportReady
  public sendClientMessage(msgType: string, data?: unknown): void {
    this._sendMessage(
      new RTVIMessage(RTVIMessageType.CLIENT_MESSAGE, {
        t: msgType,
        d: data,
      } as ClientMessageData)
    );
  }

  /**
   * Directly send a message to the bot via the transport.
   * Wait for and return the response.
   * @param msgType - a string representing the message type
   * @param data - a dictionary of data to send with the message
   * @param timeout - optional timeout in milliseconds for the response
   */
  @transportReady
  public async sendClientRequest(
    msgType: string,
    data: unknown,
    timeout?: number
  ) {
    const msgData: ClientMessageData = { t: msgType, d: data };
    const response = await this._messageDispatcher.dispatch(
      msgData,
      RTVIMessageType.CLIENT_MESSAGE,
      timeout
    );
    const ret_data = response.data as ClientMessageData;
    return ret_data.d;
  }

  public registerFunctionCallHandler(
    functionName: string,
    callback: FunctionCallCallback
  ) {
    this._functionCallCallbacks[functionName] = callback;
  }

  public unregisterFunctionCallHandler(functionName: string) {
    delete this._functionCallCallbacks[functionName];
  }

  public unregisterAllFunctionCallHandlers() {
    this._functionCallCallbacks = {};
  }

  @transportReady
  public async appendToContext(context: LLMContextMessage) {
    logger.warn("appendToContext() is deprecated. Use sendText() instead.");
    await this._sendMessage(
      new RTVIMessage(RTVIMessageType.APPEND_TO_CONTEXT, {
        role: context.role,
        content: context.content,
        run_immediately: context.run_immediately,
      } as LLMContextMessage)
    );
    return true;
  }

  @transportReady
  public async sendText(content: string, options: SendTextOptions = {}) {
    await this._sendMessage(
      new RTVIMessage(RTVIMessageType.SEND_TEXT, {
        content,
        options,
      })
    );
  }

  /**
   * Disconnects the bot, but keeps the session alive
   */
  @transportReady
  public disconnectBot(): void {
    this._sendMessage(new RTVIMessage(RTVIMessageType.DISCONNECT_BOT, {}));
  }

  protected handleMessage(ev: RTVIMessage): void {
    logger.debug("[RTVI Message]", ev);

    switch (ev.type) {
      case RTVIMessageType.BOT_READY: {
        const data = ev.data as BotReadyData;
        const botVersion = data.version
          ? data.version.split(".").map(Number)
          : [0, 0, 0];
        logger.debug(`[Pipecat Client] Bot is ready. Version: ${data.version}`);
        if (botVersion[0] < 1) {
          logger.warn(
            "[Pipecat Client] Bot version is less than 1.0.0, which may not be compatible with this client."
          );
        }
        this._connectResolve?.(ev.data as BotReadyData);
        this._options.callbacks?.onBotReady?.(ev.data as BotReadyData);
        break;
      }
      case RTVIMessageType.ERROR:
        this._options.callbacks?.onError?.(ev);
        break;
      case RTVIMessageType.SERVER_RESPONSE: {
        this._messageDispatcher.resolve(ev);
        break;
      }
      case RTVIMessageType.ERROR_RESPONSE: {
        const resp = this._messageDispatcher.reject(ev);
        this._options.callbacks?.onMessageError?.(resp as RTVIMessage);
        break;
      }
      case RTVIMessageType.USER_STARTED_SPEAKING:
        this._options.callbacks?.onUserStartedSpeaking?.();
        break;
      case RTVIMessageType.USER_STOPPED_SPEAKING:
        this._options.callbacks?.onUserStoppedSpeaking?.();
        break;
      case RTVIMessageType.BOT_STARTED_SPEAKING:
        this._options.callbacks?.onBotStartedSpeaking?.();
        break;
      case RTVIMessageType.BOT_STOPPED_SPEAKING:
        this._options.callbacks?.onBotStoppedSpeaking?.();
        break;
      case RTVIMessageType.USER_TRANSCRIPTION: {
        const TranscriptData = ev.data as TranscriptData;
        this._options.callbacks?.onUserTranscript?.(TranscriptData);
        break;
      }
      case RTVIMessageType.BOT_OUTPUT: {
        this._options.callbacks?.onBotOutput?.(ev.data as BotOutputData);
        break;
      }
      case RTVIMessageType.BOT_TRANSCRIPTION: {
        this._options.callbacks?.onBotTranscript?.(ev.data as BotLLMTextData);
        break;
      }
      case RTVIMessageType.BOT_LLM_TEXT:
        this._options.callbacks?.onBotLlmText?.(ev.data as BotLLMTextData);
        break;
      case RTVIMessageType.BOT_LLM_STARTED:
        this._options.callbacks?.onBotLlmStarted?.();
        break;
      case RTVIMessageType.BOT_LLM_STOPPED:
        this._options.callbacks?.onBotLlmStopped?.();
        break;
      case RTVIMessageType.BOT_TTS_TEXT:
        this._options.callbacks?.onBotTtsText?.(ev.data as BotTTSTextData);
        break;
      case RTVIMessageType.BOT_TTS_STARTED:
        this._options.callbacks?.onBotTtsStarted?.();
        break;
      case RTVIMessageType.BOT_TTS_STOPPED:
        this._options.callbacks?.onBotTtsStopped?.();
        break;
      case RTVIMessageType.METRICS:
        this._options.callbacks?.onMetrics?.(ev.data as PipecatMetricsData);
        this.emit(RTVIEvent.Metrics, ev.data as PipecatMetricsData);
        break;
      case RTVIMessageType.SERVER_MESSAGE: {
        this._options.callbacks?.onServerMessage?.(ev.data);
        this.emit(RTVIEvent.ServerMessage, ev.data);
        break;
      }
      case RTVIMessageType.LLM_FUNCTION_CALL: {
        const data = ev.data as LLMFunctionCallData;
        // First check if there's a registered function call handler
        // and trigger it if so.
        const fc = this._functionCallCallbacks[data.function_name];
        if (fc) {
          const params = {
            functionName: data.function_name,
            arguments: data.args,
          };
          /*
           * registered function call handlers have the ability to
           * asynchronously return a result that is sent back to the server
           * as an automatically crafted LLM_FUNCTION_CALL_RESULT message.
           * Note: If the callback returns null or undefined, no result message
           * is sent.
           */
          fc(params).then((result) => {
            // == intentional to check for null or undefined
            if (result == undefined) {
              return;
            }
            this._sendMessage(
              new RTVIMessage(RTVIMessageType.LLM_FUNCTION_CALL_RESULT, {
                function_name: data.function_name,
                tool_call_id: data.tool_call_id,
                arguments: data.args,
                result,
              })
            );
          });
        }
        /*
         * Now emit the event for any generic LLMFunctionCall listeners/callbacks
         * Note: When using these, the onus is on the client to generate and
         *       send the LLM_FUNCTION_CALL_RESULT message if needed.
         */
        this._options.callbacks?.onLLMFunctionCall?.(data);
        this.emit(RTVIEvent.LLMFunctionCall, data);
        break;
      }
      case RTVIMessageType.BOT_LLM_SEARCH_RESPONSE: {
        const data = ev.data as BotLLMSearchResponseData;
        this._options.callbacks?.onBotLlmSearchResponse?.(data);
        this.emit(RTVIEvent.BotLlmSearchResponse, data);
        break;
      }
      default: {
        logger.debug("[Pipecat Client] Unrecognized message type", ev.type);
        break;
      }
    }
  }

  // ------ Helpers
}
