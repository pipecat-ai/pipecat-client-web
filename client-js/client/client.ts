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
  DeviceErrorReason,
  DeviceStatus,
  ErrorData,
  LLMContextMessage,
  LLMFunctionCallData,
  LLMFunctionCallInProgressData,
  LLMFunctionCallResult,
  LLMFunctionCallResultResponse,
  LLMFunctionCallStartedData,
  LLMFunctionCallStoppedData,
  MediaState,
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
import {
  type UICommandEnvelope,
  type UIEventEnvelope,
  type UITaskEnvelope,
} from "../rtvi/ui";
import {
  A11ySnapshotStreamer,
  type A11ySnapshotStreamerOptions,
} from "./a11ySnapshotStreamer";
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

/**
 * Map a DeviceErrorType onto a DeviceErrorReason that captures the per-device
 * failure mode. Speaker-affecting errors are not represented here because
 * MediaState only tracks mic and cam.
 */
function deviceErrorReasonFromType(
  type: RTVIErrors.DeviceErrorType
): DeviceErrorReason {
  switch (type) {
    case "in-use":
      return "already-in-use";
    case "permissions":
      return "blocked";
    case "not-found":
      return "not-found";
    case "undefined-mediadevices":
      return "not-supported";
    case "constraints":
      return "invalid-constraints";
    case "unknown":
    default:
      return "unknown";
  }
}

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
  onUICommand: (data: UICommandEnvelope) => void;
  onUITask: (data: UITaskEnvelope) => void;

  onParticipantJoined: (participant: Participant) => void;
  onParticipantLeft: (participant: Participant) => void;

  onAvailableCamsUpdated: (cams: MediaDeviceInfo[]) => void;
  onAvailableMicsUpdated: (mics: MediaDeviceInfo[]) => void;
  onAvailableSpeakersUpdated: (speakers: MediaDeviceInfo[]) => void;
  onCamUpdated: (cam: MediaDeviceInfo) => void;
  onMicUpdated: (mic: MediaDeviceInfo) => void;
  onSpeakerUpdated: (speaker: MediaDeviceInfo) => void;
  onDeviceError: (error: RTVIErrors.DeviceError) => void;
  onMediaStateChanged: (mediaState: MediaState) => void;
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

  onUserStartedSpeaking: () => void;
  onUserStoppedSpeaking: () => void;
  onBotStartedSpeaking: () => void;
  onBotStoppedSpeaking: () => void;
  onUserMuteStarted: () => void;
  onUserMuteStopped: () => void;
  onUserTranscript: (data: TranscriptData) => void;
  onBotOutput: (data: BotOutputData) => void;
  /** @deprecated Use onBotOutput instead */
  onBotTranscript: (data: BotLLMTextData) => void;

  onBotLlmText: (data: BotLLMTextData) => void;
  onBotLlmStarted: () => void;
  onBotLlmStopped: () => void;
  onBotTtsText: (data: BotTTSTextData) => void;
  onBotTtsStarted: () => void;
  onBotTtsStopped: () => void;

  onLLMFunctionCallStarted: (data: LLMFunctionCallStartedData) => void;
  onLLMFunctionCallInProgress: (data: LLMFunctionCallInProgressData) => void;
  onLLMFunctionCallStopped: (data: LLMFunctionCallStoppedData) => void;
  onBotLlmSearchResponse: (data: BotLLMSearchResponseData) => void;
  /** @deprecated Use onLLMFunctionCallInProgress instead */
  onLLMFunctionCall: (data: LLMFunctionCallData) => void;
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

  /**
   * Disconnect when the bot disconnects.
   *
   * Default to true
   */
  disconnectOnBotDisconnect?: boolean;
}

abstract class RTVIEventEmitter extends (EventEmitter as unknown as new () => TypedEmitter<RTVIEvents>) {}

export class PipecatClient extends RTVIEventEmitter {
  protected _options: PipecatClientOptions;
  private _connectResolve: ((value: BotReadyData) => void) | undefined;
  protected _transport: Transport;
  protected _transportWrapper: TransportWrapper;
  protected _disconnectOnBotDisconnect: boolean;
  declare protected _messageDispatcher: MessageDispatcher;
  protected _functionCallCallbacks: Record<string, FunctionCallCallback> = {};
  protected _abortController: AbortController | undefined;
  private _a11ySnapshotStreamer: A11ySnapshotStreamer | undefined;

  private _botTranscriptionWarned = false;
  private _llmFunctionCallWarned = false;

  // Per-device device state. Independent of TransportState — driven by
  // initDevices() and DeviceError events, never by transport connect/disconnect.
  // See common_types.ts for the rationale and the daily-react reference.
  private _mediaState: MediaState = {
    mic: { state: "uninitialized" },
    cam: { state: "uninitialized" },
  };

  constructor(options: PipecatClientOptions) {
    super();

    setAboutClient(learnAboutClient());

    this._transport = options.transport;
    this._transportWrapper = new TransportWrapper(this._transport);

    this._disconnectOnBotDisconnect = options.disconnectOnBotDisconnect ?? true;

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
          void this.disconnect();
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
        // Real device selected → permission was granted. Upgrade MediaState
        // (no-op if already granted, sticky if blocked / in-use / etc).
        if (cam?.deviceId) this._markDeviceGranted("cam");
        options?.callbacks?.onCamUpdated?.(cam);
        this.emit(RTVIEvent.CamUpdated, cam);
      },
      onMicUpdated: (mic) => {
        if (mic?.deviceId) this._markDeviceGranted("mic");
        options?.callbacks?.onMicUpdated?.(mic);
        this.emit(RTVIEvent.MicUpdated, mic);
      },
      onSpeakerUpdated: (speaker) => {
        options?.callbacks?.onSpeakerUpdated?.(speaker);
        this.emit(RTVIEvent.SpeakerUpdated, speaker);
      },
      onDeviceError: (error) => {
        // Classify into MediaState in real time. Works the same whether the
        // error fires during an initDevices() call (mid-await) or out of band
        // (e.g. devicechange-driven). The post-transport Permissions API
        // re-query in initDevices() then has the final word for any 'denied'
        // override.
        this._classifyAndApplyDeviceError(error);
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
        if (this._disconnectOnBotDisconnect) {
          logger.info("Bot disconnected. Disconnecting client...");
          void this.disconnect();
        }
      },
      onUserStartedSpeaking: () => {
        options?.callbacks?.onUserStartedSpeaking?.();
        this.emit(RTVIEvent.UserStartedSpeaking);
      },
      onUserStoppedSpeaking: () => {
        options?.callbacks?.onUserStoppedSpeaking?.();
        this.emit(RTVIEvent.UserStoppedSpeaking);
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
      onLocalAudioLevel: (level) => {
        options?.callbacks?.onLocalAudioLevel?.(level);
        this.emit(RTVIEvent.LocalAudioLevel, level);
      },
      onUserMuteStarted: () => {
        options?.callbacks?.onUserMuteStarted?.();
        this.emit(RTVIEvent.UserMuteStarted);
      },
      onUserMuteStopped: () => {
        options?.callbacks?.onUserMuteStopped?.();
        this.emit(RTVIEvent.UserMuteStopped);
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
        const hasSubscriber =
          !!options?.callbacks?.onBotTranscript ||
          this.listenerCount(RTVIEvent.BotTranscript) > 0;
        if (hasSubscriber && !this._botTranscriptionWarned) {
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
   * Initialize local media devices.
   *
   * Drives MediaState transitions: both mic and cam move to 'initializing' on
   * entry. On success, each device moves to 'granted' only if the transport
   * reports it as acquired (via onMicUpdated / onCamUpdated with a real
   * deviceId); otherwise that device falls back to 'uninitialized'. On
   * failure the in-flight DeviceError (if any) classifies the affected
   * device(s) per-device; anything still at 'initializing' falls back to
   * 'unknown'. The original error is always re-thrown.
   *
   * Calling this again after a failure is the recovery path — a second call
   * re-enters 'initializing' and reclassifies. There is no separate
   * retryDevices() method.
   */
  public async initDevices() {
    logger.debug("[Pipecat Client] Initializing devices...");
    // Both devices enter the lifecycle, regardless of enableMic / enableCam.
    // The actual transport behavior is asymmetric and not predictable from
    // options alone (e.g. daily-js's startCamera honors startVideoOff but not
    // startAudioOff — it acquires the mic even when the caller said
    // enableMic: false). MediaState mirrors what the transport actually did,
    // sourced from onMicUpdated / onCamUpdated events that fire with a real
    // deviceId only when permission was granted. Devices the transport never
    // speaks to fall back to 'uninitialized' below.
    this._setMediaState({
      mic: { state: "initializing" },
      cam: { state: "initializing" },
    });

    try {
      await this._transport.initDevices();
      // Transport resolved. Per-device transitions during the await:
      //   - onMicUpdated / onCamUpdated upgraded reported devices to 'granted'
      //   - onDeviceError applied per-device 'error' classifications
      // Anything still at 'initializing' wasn't reported either way — the
      // transport simply didn't speak to that device (e.g. daily-js skipping
      // cam under startVideoOff: true). Fall it back to 'uninitialized'.
      this._resolveLingeringInitializing({ state: "uninitialized" });
    } catch (error) {
      // Transport rejected. Same as above but the fallback for unspoken-to
      // devices is 'unknown' — something failed and we can't tell whether
      // this device would have worked.
      this._resolveLingeringInitializing({
        state: "error",
        reason: "unknown",
      });
      throw error;
    } finally {
      // Re-query the Permissions API now that the prompt (if any) has been
      // dismissed. Authoritative source for 'denied' regardless of what the
      // transport said. See the helper for the under-reporting rationale.
      await this._enrichFromPermissionsAPI();
    }
  }

  /**
   * After the transport's initDevices() resolves or rejects, any device
   * still at 'initializing' didn't receive a 'granted' upgrade from
   * onMicUpdated / onCamUpdated and wasn't classified by a DeviceError
   * (which would have moved it to 'error'). Apply the supplied fallback so
   * it doesn't linger.
   *
   * On success, fallback is 'uninitialized' (the transport simply didn't
   * speak to that device — e.g. daily-js skipping cam under
   * startVideoOff: true). On failure, fallback is an 'unknown' error (we
   * know something went wrong but can't pin it on this device).
   */
  private _resolveLingeringInitializing(fallback: DeviceStatus): void {
    const patch: Partial<MediaState> = {};
    for (const kind of ["mic", "cam"] as const) {
      if (this._mediaState[kind].state === "initializing") {
        patch[kind] = fallback;
      }
    }
    if (Object.keys(patch).length > 0) this._setMediaState(patch);
  }

  /**
   * Upgrade a device to 'granted'. Called from the wrapped onMicUpdated /
   * onCamUpdated when the transport reports an actual selected device.
   * Allowed from any state — a previously errored device (e.g. 'not-found'
   * because the cam was unplugged) can recover when the device reappears
   * on a subsequent initDevices() call.
   */
  private _markDeviceGranted(kind: "mic" | "cam"): void {
    if (this._mediaState[kind].state !== "granted") {
      this._setMediaState({ [kind]: { state: "granted" } });
    }
  }

  /**
   * startBot() is a method that initiates the bot by posting to a specified endpoint
   * that optionally returns connection parameters for establishing a transport session.
   * @param startBotParams
   * @returns Promise that resolves to TransportConnectionParams or unknown
   */
  @transportAlreadyStarted
  public async startBot(startBotParams: APIRequest): Promise<unknown> {
    // Implicit init when devices haven't been initialized yet. Pre-Plan-A
    // this gate read transport.state === "disconnected", which fired both
    // pre-init AND post-session — leading to redundant initDevices() calls
    // on reconnect. needsInit(mediaState) is the unambiguous replacement.
    if (this.needsInit()) {
      await this.initDevices();
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

        if (this.needsInit()) {
          await this.initDevices();
        }

        try {
          await this._transport.connect(
            connectParams as TransportConnectionParams
          );
          await this._transport.sendReadyMessage();
        } catch (e) {
          void this.disconnect();
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
    this.stopA11ySnapshotStream();
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
   * Apply a partial MediaState patch and emit MediaStateUpdated if the patch
   * actually changes anything. The callback always receives a fresh object.
   */
  private _setMediaState(patch: Partial<MediaState>): void {
    const next: MediaState = { ...this._mediaState, ...patch };
    if (
      this._statusEquals(next.mic, this._mediaState.mic) &&
      this._statusEquals(next.cam, this._mediaState.cam)
    ) {
      return;
    }
    this._mediaState = next;
    this._options.callbacks?.onMediaStateChanged?.(this.mediaState);
    this.emit(RTVIEvent.MediaStateUpdated, this.mediaState);
  }

  /**
   * Structural equality for two DeviceStatus values. Distinct error
   * statuses (different `reason` or `details`) are treated as distinct so a
   * status update fires when the underlying error changes, even if `state`
   * was already 'error'.
   */
  private _statusEquals(a: DeviceStatus, b: DeviceStatus): boolean {
    if (a.state !== b.state) return false;
    if (a.state === "error" && b.state === "error") {
      return a.reason === b.reason && a.details === b.details;
    }
    return true;
  }

  /**
   * Map a DeviceError onto a partial MediaState patch and apply it. Mirrors
   * daily-react's camera-error classifier — affected devices flip to an
   * `'error'` status carrying the reason and the original error payload.
   */
  private _classifyAndApplyDeviceError(error: RTVIErrors.DeviceError): void {
    const status: DeviceStatus = {
      state: "error",
      reason: deviceErrorReasonFromType(error.type),
      details: error.details,
    };
    const patch: Partial<MediaState> = {};
    if (error.devices.includes("mic")) patch.mic = status;
    if (error.devices.includes("cam")) patch.cam = status;
    if (Object.keys(patch).length === 0) return; // speaker-only or empty
    this._setMediaState(patch);
  }

  /**
   * Permissions API enrichment, run AFTER the transport's initDevices()
   * resolves. By that point the prompt (if any) has been dismissed, and the
   * Permissions API's `denied` answer is authoritative — it overrides any
   * under-reported DeviceError.
   *
   * Concrete case worth flagging: on a page where the user previously
   * blocked permissions, daily-js's `camera-error` only names whichever
   * device the transport tried first when re-initializing — even though
   * both are blocked. Re-querying here catches the missing one. Worth a
   * follow-up daily-js ticket.
   *
   * Silently no-ops where the API is unavailable (Safari, some mobile
   * browsers) or throws on an unsupported descriptor.
   */
  private async _enrichFromPermissionsAPI(): Promise<void> {
    // PermissionDescriptor's `name` field isn't a standard enum across
    // browsers (Safari historically narrower than Chrome/Firefox), and
    // 'microphone' / 'camera' are not in lib.dom's PermissionName union in
    // every TS version. Hand-roll the descriptor type and cast.
    type PermDescriptor = { name: "microphone" | "camera" };
    type Q = (descriptor: PermDescriptor) => Promise<{ state: string }>;
    const permissions = (
      globalThis as unknown as {
        navigator?: { permissions?: { query: Q } };
      }
    ).navigator?.permissions;
    if (!permissions?.query) return;
    const query = permissions.query.bind(permissions);

    const patch: Partial<MediaState> = {};
    await Promise.all(
      (["mic", "cam"] as const).map(async (kind) => {
        try {
          const result = await query({
            name: kind === "mic" ? "microphone" : "camera",
          });
          if (result.state === "denied") {
            patch[kind] = { state: "error", reason: "blocked" };
          }
        } catch {
          // Browsers may throw on unsupported descriptor names — swallow.
        }
      })
    );
    if (Object.keys(patch).length > 0) this._setMediaState(patch);
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

  /**
   * Per-device device state (mic, cam). Independent of transport state.
   *
   * Updated by initDevices() and DeviceError events. Returns a snapshot — to
   * track changes, subscribe to RTVIEvent.MediaStateUpdated or pass an
   * onMediaStateChanged callback in the client constructor.
   */
  public get mediaState(): MediaState {
    // Deep snapshot — DeviceStatus is a nested object, so a shallow spread
    // would still hand the caller a reference to our per-device records.
    return {
      mic: { ...this._mediaState.mic },
      cam: { ...this._mediaState.cam },
    };
  }

  /**
   * Whether initDevices() still has work to do. Returns true if any device
   * the caller opted into (enableMic / enableCam) is still 'uninitialized'.
   * Devices the caller opted out of are not considered — they stay
   * 'uninitialized' by design and must not gate the implicit init.
   *
   * Used internally by connect() / startBot() to decide whether to drive an
   * implicit initDevices(); exposed publicly so consumers (e.g. step 3's
   * useMediaState hook) can branch on the same logic.
   */
  public needsInit(): boolean {
    if (
      this._options.enableMic !== false &&
      this._mediaState.mic.state === "uninitialized"
    ) {
      return true;
    }
    if (
      this._options.enableCam !== false &&
      this._mediaState.cam.state === "uninitialized"
    ) {
      return true;
    }
    return false;
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
   * Send a named UI event to the server as a first-class RTVI
   * `ui-event` message.
   *
   * @param event - App-defined event.
   * @param payload - App-defined payload. Optional.
   */
  @transportReady
  public sendUIEvent<T = unknown>(event: string, payload?: T): void {
    const envelope: UIEventEnvelope<T | undefined> = {
      event,
      payload: payload as T | undefined,
    };
    this._sendMessage(new RTVIMessage(RTVIMessageType.UI_EVENT, envelope));
  }

  /**
   * Start streaming accessibility snapshots to the server as
   * first-class `ui-snapshot` RTVI messages.
   *
   * Calling this again replaces any existing managed streamer with
   * the new options.
   */
  public startA11ySnapshotStream(
    options: A11ySnapshotStreamerOptions = {}
  ): void {
    this.stopA11ySnapshotStream();
    this._a11ySnapshotStreamer = new A11ySnapshotStreamer((snapshot) => {
      if (this.state !== "ready") return;
      this._sendMessage(
        new RTVIMessage(RTVIMessageType.UI_SNAPSHOT, { tree: snapshot })
      );
    }, options);
    this._a11ySnapshotStreamer.start();
  }

  /**
   * Stop the managed accessibility snapshot stream, if one is active.
   */
  public stopA11ySnapshotStream(): void {
    this._a11ySnapshotStreamer?.stop();
    this._a11ySnapshotStreamer = undefined;
  }

  /**
   * Ask the server to cancel an in-flight UI task group.
   *
   * @param taskId - Shared task identifier of the group to cancel.
   * @param reason - Optional human-readable reason logged on the server.
   */
  @transportReady
  public cancelUITask(taskId: string, reason?: string): void {
    const payload: { task_id: string; reason?: string } = { task_id: taskId };
    if (reason !== undefined) payload.reason = reason;
    this._sendMessage(new RTVIMessage(RTVIMessageType.UI_CANCEL_TASK, payload));
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
      case RTVIMessageType.USER_MUTE_STARTED:
        this._options.callbacks?.onUserMuteStarted?.();
        break;
      case RTVIMessageType.USER_MUTE_STOPPED:
        this._options.callbacks?.onUserMuteStopped?.();
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
      case RTVIMessageType.UI_COMMAND: {
        const data = ev.data as UICommandEnvelope;
        this._options.callbacks?.onUICommand?.(data);
        this.emit(RTVIEvent.UICommand, data);
        break;
      }
      case RTVIMessageType.UI_TASK: {
        const data = ev.data as UITaskEnvelope;
        this._options.callbacks?.onUITask?.(data);
        this.emit(RTVIEvent.UITask, data);
        break;
      }
      case RTVIMessageType.LLM_FUNCTION_CALL_STARTED: {
        const data = ev.data as LLMFunctionCallStartedData;
        this._options.callbacks?.onLLMFunctionCallStarted?.(data);
        this.emit(RTVIEvent.LLMFunctionCallStarted, data);
        break;
      }
      case RTVIMessageType.LLM_FUNCTION_CALL_IN_PROGRESS: {
        const data = ev.data as LLMFunctionCallInProgressData;
        this._maybeTriggerFunctionCallCallback(data);
        this._options.callbacks?.onLLMFunctionCallInProgress?.(data);
        this.emit(RTVIEvent.LLMFunctionCallInProgress, data);
        break;
      }
      case RTVIMessageType.LLM_FUNCTION_CALL_STOPPED: {
        const data = ev.data as LLMFunctionCallStoppedData;
        this._options.callbacks?.onLLMFunctionCallStopped?.(data);
        this.emit(RTVIEvent.LLMFunctionCallStopped, data);
        break;
      }
      case RTVIMessageType.LLM_FUNCTION_CALL: {
        const data = ev.data as LLMFunctionCallData;
        const inProgressData: LLMFunctionCallInProgressData = {
          function_name: data.function_name,
          tool_call_id: data.tool_call_id,
          arguments: data.args,
        };
        this._maybeTriggerFunctionCallCallback(inProgressData);
        if (this._options.callbacks?.onLLMFunctionCall) {
          if (!this._llmFunctionCallWarned) {
            logger.warn(
              "[Pipecat Client] onLLMFunctionCall is deprecated. Please use onLLMFunctionCallInProgress instead."
            );
            this._llmFunctionCallWarned = true;
          }
        }
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

  private _maybeTriggerFunctionCallCallback(
    data: LLMFunctionCallInProgressData
  ) {
    // Function call callbacks are meant only for function calls that need information
    // from the client to complete and generate a result. This process requires that
    // the event includes the function name. For client-side logic meant simply to
    // react to the fact that a function call is happening, you should use the
    // traditional onLLMFunctionCallStarted/InProgress/Stopped events instead.
    if (!data.function_name) return;
    const fc = this._functionCallCallbacks[data.function_name];
    if (fc) {
      const params = {
        functionName: data.function_name ?? "",
        arguments: data.arguments ?? {},
      };
      fc(params)
        .then((result) => {
          if (result == undefined) {
            return;
          }
          this._sendMessage(
            new RTVIMessage(RTVIMessageType.LLM_FUNCTION_CALL_RESULT, {
              function_name: data.function_name,
              tool_call_id: data.tool_call_id,
              arguments: data.arguments ?? {},
              result,
            } as LLMFunctionCallResultResponse)
          );
        })
        .catch((error) => {
          logger.error("Error in function call callback", error);
        });
    }
  }

  // ------ Helpers
}
