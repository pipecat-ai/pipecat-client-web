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
  BotExpressionData,
  BotLLMSearchResponseData,
  BotLLMTextData,
  BotOutputData,
  BotReadyData,
  BotToneChangedData,
  BotTTSTextData,
  LLMFunctionCallData,
  LLMFunctionCallInProgressData,
  LLMFunctionCallStartedData,
  LLMFunctionCallStoppedData,
  LLMRawTextData,
  PipecatMetricsData,
  RTVIMessage,
  STTRawTextData,
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

  /** UI Worker Protocol */
  UICommand = "uiCommand",
  UIJobGroup = "uiJobGroup",

  /** service events */
  Metrics = "metrics",

  // vad events
  BotStartedSpeaking = "botStartedSpeaking",
  BotStoppedSpeaking = "botStoppedSpeaking",
  UserStartedSpeaking = "userStartedSpeaking",
  UserStoppedSpeaking = "userStoppedSpeaking",

  // user mute strategy events
  UserMuteStarted = "userMuteStarted",
  UserMuteStopped = "userMuteStopped",

  // stt events
  /**
   * @deprecated Use `UserInput` to show what the user said, or `SttRawText` to
   * inspect what the STT produced.
   */
  UserTranscript = "userTranscript",
  UserInput = "userInput",
  BotOutput = "botOutput",
  /** The bot's tones changed, in expressive conversation (RTVI 2.3.0+). */
  BotToneChanged = "botToneChanged",
  /** The bot performed an event or pause, in expressive conversation (RTVI 2.3.0+). */
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

  /** UI Worker Protocol */
  uiCommand: (data: UICommandData) => void;
  uiJobGroup: (data: UIJobGroupData) => void;

  /** service events */
  metrics: (data: PipecatMetricsData) => void;

  // vad events
  botStartedSpeaking: () => void;
  botStoppedSpeaking: () => void;
  userStartedSpeaking: () => void;
  userStoppedSpeaking: () => void;

  // user mute strategy events
  userMuteStarted: () => void;
  userMuteStopped: () => void;

  // stt events
  /**
   * @deprecated Use `userInput` to show what the user said, or `sttRawText` to
   * inspect what the STT produced.
   */
  userTranscript: (data: TranscriptData) => void;
  userInput: (data: UserInputData) => void;
  botOutput: (data: BotOutputData) => void;
  botToneChanged: (data: BotToneChangedData) => void;
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
