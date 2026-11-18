/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  MediaState,
  MediaSupport,
  Participant,
  TransportState,
} from "./common_types";
import { DeviceError, UnsupportedFeatureError } from "./errors";
import {
  AudioLevelData,
  BotDeliveryUpdatedData,
  BotExpressionData,
  BotLLMMarkerData,
  BotLLMSearchResponseData,
  BotLLMTextData,
  BotOutputData,
  BotReadyData,
  BotTTSTextData,
  FlowNodeEnteredData,
  LLMFunctionCallData,
  LLMFunctionCallInProgressData,
  LLMFunctionCallStartedData,
  LLMFunctionCallStoppedData,
  LLMRawTextData,
  PipecatMetricsData,
  RTVIMessage,
  STTRawTextData,
  SystemLogData,
  TranscriptData,
  TTSRawTextData,
  UICommandData,
  UIJobGroupData,
  UserInputData,
  UserLLMTextData,
} from "./messages";

export enum RTVIEvent {
  /** local connection state events */
  Connected = "connected",
  Disconnected = "disconnected",
  TransportStateChanged = "transportStateChanged",

  /** remote connection state events */
  BotStarted = "botStarted",
  BotConnected = "botConnected",
  BotReady = "botReady",
  BotDisconnected = "botDisconnected",
  Error = "error",

  /** server messaging */
  ServerMessage = "serverMessage",
  ServerResponse = "serverResponse",
  MessageError = "messageError",
  SystemLog = "systemLog",

  /** UI Worker Protocol */
  UICommand = "uiCommand",
  UIJobGroup = "uiJobGroup",

  /** conversation flows */
  FlowNodeEntered = "flowNodeEntered",

  /** service events */
  Metrics = "metrics",

  // vad events
  BotStartedSpeaking = "botStartedSpeaking",
  BotStoppedSpeaking = "botStoppedSpeaking",
  BotInterrupted = "botInterrupted",
  UserStartedSpeaking = "userStartedSpeaking",
  UserStoppedSpeaking = "userStoppedSpeaking",

  // user mute strategy events
  UserMuteStarted = "userMuteStarted",
  UserMuteStopped = "userMuteStopped",

  // voice activity events
  VadUserStartedSpeaking = "vadUserStartedSpeaking",
  VadUserStoppedSpeaking = "vadUserStoppedSpeaking",

  // audio level events, as the bot measures them
  UserAudioLevel = "userAudioLevel",
  BotAudioLevel = "botAudioLevel",

  // stt events
  /**
   * @deprecated Use `UserInput` to show what the user said, or `SttRawText` to
   * inspect what the STT produced.
   */
  UserTranscript = "userTranscript",
  UserInput = "userInput",
  BotOutput = "botOutput",
  /** The bot's delivery changed, in expressive conversation (RTVI 2.3.0+). */
  BotDeliveryUpdated = "botDeliveryUpdated",
  /** The bot performed a sound or pause, in expressive conversation (RTVI 2.3.0+). */
  BotExpression = "botExpression",
  // DEPRECATED
  BotTranscript = "botTranscript",

  // llm events
  UserLlmText = "userLlmText",
  /**
   * @deprecated Use `BotOutput` to show the bot's text, or `LlmRawText` to
   * inspect what the LLM produced.
   */
  BotLlmText = "botLlmText",
  BotLlmStarted = "botLlmStarted",
  BotLlmStopped = "botLlmStopped",
  BotLlmMarker = "botLlmMarker",

  // DEPRECATED
  LLMFunctionCall = "llmFunctionCall",
  LLMFunctionCallStarted = "llmFunctionCallStarted",
  LLMFunctionCallInProgress = "llmFunctionCallInProgress",
  LLMFunctionCallStopped = "llmFunctionCallStopped",

  BotLlmSearchResponse = "botLlmSearchResponse",

  // tts events
  /**
   * @deprecated Use `BotOutput` to show the bot's text, or `TtsRawText` to
   * inspect what the TTS produced.
   */
  BotTtsText = "botTtsText",
  BotTtsStarted = "botTtsStarted",
  BotTtsStopped = "botTtsStopped",

  // Raw text events for debugging: what the STT, LLM and TTS produced
  // (RTVI 2.2.0+). The bot sends them only when enabled, with Pipecat's
  // stt_raw_text_enabled, llm_raw_text_enabled and tts_raw_text_enabled
  // RTVIObserverParams.
  SttRawText = "sttRawText",
  LlmRawText = "llmRawText",
  TtsRawText = "ttsRawText",

  /** participant events */
  ParticipantConnected = "participantConnected",
  ParticipantLeft = "participantLeft",

  /** media events */
  TrackStarted = "trackStarted",
  TrackStopped = "trackStopped",
  ScreenTrackStarted = "screenTrackStarted",
  ScreenTrackStopped = "screenTrackStopped",
  ScreenShareError = "screenShareError",

  LocalAudioLevel = "localAudioLevel",
  RemoteAudioLevel = "remoteAudioLevel",

  /** media device events */
  AvailableCamsUpdated = "availableCamsUpdated",
  AvailableMicsUpdated = "availableMicsUpdated",
  AvailableSpeakersUpdated = "availableSpeakersUpdated",
  CamUpdated = "camUpdated",
  MicUpdated = "micUpdated",
  SpeakerUpdated = "speakerUpdated",
  DeviceError = "deviceError",
  MediaStateUpdated = "mediaStateUpdated",
  MediaSupportUpdated = "mediaSupportUpdated",
  UnsupportedFeature = "unsupportedFeature",
}

export type RTVIEvents = Partial<{
  /** local connection state events */
  connected: () => void;
  disconnected: () => void;
  transportStateChanged: (state: TransportState) => void;

  /** remote connection state events */
  botStarted: (botResponse: unknown) => void;
  botConnected: (participant: Participant) => void;
  botReady: (botData: BotReadyData) => void;
  botDisconnected: (participant: Participant) => void;
  error: (message: RTVIMessage) => void;

  /** server messaging */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverMessage: (data: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverResponse: (data: any) => void;
  messageError: (message: RTVIMessage) => void;
  /**
   * A line of the bot's log, for debugging. The bot sends it only when
   * enabled, with Pipecat's `system_logs_enabled` RTVIObserverParams.
   */
  systemLog: (data: SystemLogData) => void;

  /** UI Worker Protocol */
  uiCommand: (data: UICommandData) => void;
  uiJobGroup: (data: UIJobGroupData) => void;

  /** conversation flows */
  flowNodeEntered: (data: FlowNodeEnteredData) => void;

  /** service events */
  metrics: (data: PipecatMetricsData) => void;

  // vad events
  botStartedSpeaking: () => void;
  botStoppedSpeaking: () => void;
  /**
   * The bot's in-flight output was cut off, whether by the user speaking or
   * by text sent with `run_immediately`. Whatever it was mid-saying will not
   * be spoken. Sent by bots on RTVI 2.0.0+.
   */
  botInterrupted: () => void;
  userStartedSpeaking: () => void;
  userStoppedSpeaking: () => void;

  // user mute strategy events
  userMuteStarted: () => void;
  userMuteStopped: () => void;

  // voice activity events
  /**
   * The bot's voice activity detection heard the user start speaking. It
   * reacts to any voice, sooner than `userStartedSpeaking`, which comes when
   * the bot decides the user's turn started. The bot sends it only when
   * enabled, with Pipecat's `vad_user_speaking_enabled` RTVIObserverParams.
   */
  vadUserStartedSpeaking: () => void;
  /**
   * The bot's voice activity detection heard the user stop speaking. It
   * reacts to any pause, sooner than `userStoppedSpeaking`, which comes when
   * the bot decides the user's turn ended. The bot sends it only when
   * enabled, with Pipecat's `vad_user_speaking_enabled` RTVIObserverParams.
   */
  vadUserStoppedSpeaking: () => void;

  // audio level events, as the bot measures them
  /**
   * How loud the user's audio is, from 0 (quiet) to 1 (loud), as the bot
   * received it, sent regularly while it comes in. Unlike `localAudioLevel`,
   * which the transport measures, the bot measures it. The bot sends it only
   * when enabled, with Pipecat's `user_audio_level_enabled` RTVIObserverParams.
   */
  userAudioLevel: (data: AudioLevelData) => void;
  /**
   * How loud the bot's audio is, from 0 (quiet) to 1 (loud), as the bot
   * produced it, sent regularly while it speaks. Unlike `remoteAudioLevel`,
   * which the transport measures, the bot measures it. The bot sends it only
   * when enabled, with Pipecat's `bot_audio_level_enabled` RTVIObserverParams.
   */
  botAudioLevel: (data: AudioLevelData) => void;

  // stt events
  /**
   * @deprecated Use `userInput` to show what the user said, or `sttRawText` to
   * inspect what the STT produced.
   */
  userTranscript: (data: TranscriptData) => void;
  userInput: (data: UserInputData) => void;
  botOutput: (data: BotOutputData) => void;
  botDeliveryUpdated: (data: BotDeliveryUpdatedData) => void;
  botExpression: (data: BotExpressionData) => void;
  botTranscript: (data: BotLLMTextData) => void;

  // llm events
  userLlmText: (data: UserLLMTextData) => void;
  /**
   * @deprecated Use `botOutput` to show the bot's text, or `llmRawText` to
   * inspect what the LLM produced.
   */
  botLlmText: (data: BotLLMTextData) => void;
  botLlmStarted: () => void;
  botLlmStopped: () => void;
  /**
   * The marker the bot's LLM put in a response, outside the text it speaks,
   * such as one saying whether the user's turn was complete; sent once per
   * response, when it ends. It carries the response's raw text, so it's for
   * evaluating and debugging the bot, not for showing to the user. The bot
   * sends it only when enabled, with Pipecat's `bot_llm_marker_enabled`
   * RTVIObserverParams.
   */
  botLlmMarker: (data: BotLLMMarkerData) => void;

  /** @deprecated Use LLMFunctionCallInProgress instead */
  llmFunctionCall: (func: LLMFunctionCallData) => void;
  llmFunctionCallStarted: (data: LLMFunctionCallStartedData) => void;
  llmFunctionCallInProgress: (data: LLMFunctionCallInProgressData) => void;
  llmFunctionCallStopped: (data: LLMFunctionCallStoppedData) => void;

  botLlmSearchResponse: (data: BotLLMSearchResponseData) => void;

  // tts events
  /**
   * @deprecated Use `botOutput` to show the bot's text, or `ttsRawText` to
   * inspect what the TTS produced.
   */
  botTtsText: (data: BotTTSTextData) => void;
  botTtsStarted: () => void;
  botTtsStopped: () => void;

  // Raw text events for debugging: what the STT, LLM and TTS produced
  // (RTVI 2.2.0+). The bot sends them only when enabled, with Pipecat's
  // stt_raw_text_enabled, llm_raw_text_enabled and tts_raw_text_enabled
  // RTVIObserverParams.
  sttRawText: (data: STTRawTextData) => void;
  llmRawText: (data: LLMRawTextData) => void;
  ttsRawText: (data: TTSRawTextData) => void;

  /** participant events */
  participantConnected: (participant: Participant) => void;
  participantLeft: (participant: Participant) => void;

  /** media events */
  trackStarted: (track: MediaStreamTrack, participant?: Participant) => void;
  trackStopped: (track: MediaStreamTrack, participant?: Participant) => void;
  screenTrackStarted: (track: MediaStreamTrack, p?: Participant) => void;
  screenTrackStopped: (track: MediaStreamTrack, p?: Participant) => void;
  screenShareError: (errorMessage: string) => void;

  localAudioLevel: (level: number) => void;
  remoteAudioLevel: (level: number, p: Participant) => void;

  /** media device events */
  availableCamsUpdated: (cams: MediaDeviceInfo[]) => void;
  availableMicsUpdated: (mics: MediaDeviceInfo[]) => void;
  availableSpeakersUpdated: (speakers: MediaDeviceInfo[]) => void;
  camUpdated: (cam: MediaDeviceInfo) => void;
  micUpdated: (mic: MediaDeviceInfo) => void;
  speakerUpdated: (speaker: MediaDeviceInfo) => void;
  deviceError: (error: DeviceError) => void;
  mediaStateUpdated: (mediaState: MediaState) => void;
  mediaSupportUpdated: (mediaSupport: MediaSupport) => void;
  unsupportedFeature: (error: UnsupportedFeatureError) => void;
}>;

export type RTVIEventHandler<E extends RTVIEvent> = E extends keyof RTVIEvents
  ? RTVIEvents[E]
  : never;
