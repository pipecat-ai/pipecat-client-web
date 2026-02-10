/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { Participant, TransportState } from "./common_types";
import { DeviceError } from "./errors";
import {
  BotLLMSearchResponseData,
  BotLLMTextData,
  BotOutputData,
  BotReadyData,
  BotTTSTextData,
  LLMFunctionCallData,
  LLMFunctionCallInProgressData,
  LLMFunctionCallStartedData,
  LLMFunctionCallStoppedData,
  PipecatMetricsData,
  RTVIMessage,
  TranscriptData,
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
  UserTranscript = "userTranscript",
  BotOutput = "botOutput",
  // DEPRECATED
  BotTranscript = "botTranscript",

  // llm events
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
  BotTtsText = "botTtsText",
  BotTtsStarted = "botTtsStarted",
  BotTtsStopped = "botTtsStopped",

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
  userTranscript: (data: TranscriptData) => void;
  botOutput: (data: BotOutputData) => void;
  botTranscript: (data: BotLLMTextData) => void;

  // llm events
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
  botTtsText: (data: BotTTSTextData) => void;
  botTtsStarted: () => void;
  botTtsStopped: () => void;

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
}>;

export type RTVIEventHandler<E extends RTVIEvent> = E extends keyof RTVIEvents
  ? RTVIEvents[E]
  : never;
