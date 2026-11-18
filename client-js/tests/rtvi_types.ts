/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * Compile-time checks that client-js's public message types agree with the
 * types generated from the RTVI document. `npm run typecheck` fails when they
 * don't, naming the messages that disagree.
 */

import type * as Wire from "../rtvi/generated/protocol";
import type {
  AudioLevelData,
  BotLLMTextData,
  BotOutputData,
  BotReadyData,
  BotTTSTextData,
  ClientMessageData,
  ClientReadyData,
  DTMFData,
  ErrorData,
  LLMFunctionCallData,
  LLMFunctionCallInProgressData,
  LLMFunctionCallResultResponse,
  LLMFunctionCallStartedData,
  LLMFunctionCallStoppedData,
  LLMRawTextData,
  PipecatMetricsData,
  RTVIFile,
  SendFileOptions,
  SendTextOptions,
  STTRawTextData,
  SystemLogData,
  TranscriptData,
  TTSRawTextData,
  UICancelJobGroupData,
  UICommandData,
  UIEventData,
  UIJobGroupData,
  UISnapshotData,
  UserInputData,
  UserLLMTextData,
} from "../rtvi/messages";

/** The public type each server message's `data` reaches the app as. */
type ServerData = {
  "bot-ready": BotReadyData;
  error: ErrorData;
  metrics: PipecatMetricsData;
  "user-transcription": TranscriptData;
  "user-llm-text": UserLLMTextData;
  "user-input": UserInputData;
  "bot-output": BotOutputData;
  "bot-transcription": BotLLMTextData;
  "bot-llm-text": BotLLMTextData;
  "bot-tts-text": BotTTSTextData;
  "stt-raw-text": STTRawTextData;
  "llm-raw-text": LLMRawTextData;
  "tts-raw-text": TTSRawTextData;
  "system-log": SystemLogData;
  "user-audio-level": AudioLevelData;
  "bot-audio-level": AudioLevelData;
  "ui-command": UICommandData;
  "ui-job-group": UIJobGroupData;
  "llm-function-call-started": LLMFunctionCallStartedData;
  "llm-function-call-in-progress": LLMFunctionCallInProgressData;
  "llm-function-call-stopped": LLMFunctionCallStoppedData;
  "llm-function-call": LLMFunctionCallData;
};

/** The public type each client message's `data` is built from. */
type ClientData = {
  "client-ready": ClientReadyData;
  "client-message": ClientMessageData;
  "send-text": { content: string; options?: SendTextOptions };
  "send-file": { file: RTVIFile; content: string; options?: SendFileOptions };
  dtmf: DTMFData;
  "llm-function-call-result": LLMFunctionCallResultResponse;
  "ui-event": UIEventData;
  "ui-snapshot": UISnapshotData;
  "ui-cancel-job-group": UICancelJobGroupData;
};

/** What `JSON.stringify` makes of a value, as it reaches the server. */
type Json<T> = T extends URL
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

/** Messages whose types knowingly differ from the document's, and why. */
type Known =
  // sendDTMF rejects an empty sequence before it builds the message; the type
  // can't say that a list of keys isn't empty.
  | "dtmf"
  // The server sends a job's status as one of its JobStatus values, which
  // JobStatus here lists; the document types it as any string.
  | "ui-job-group";

// Every key names a message of the document.
type NotServerMessages = Exclude<keyof ServerData, Wire.ServerMessageType>;
type NotClientMessages = Exclude<keyof ClientData, Wire.ClientMessageType>;

// What the server can send, the public type accepts.
type ServerMismatches = {
  [K in Exclude<keyof ServerData, Known>]: Wire.ServerMessageData[K &
    Wire.ServerMessageType] extends ServerData[K]
    ? never
    : K;
}[Exclude<keyof ServerData, Known>];

// What the client builds, the server accepts.
type ClientMismatches = {
  [K in Exclude<keyof ClientData, Known>]: Json<
    ClientData[K]
  > extends Wire.ClientMessageData[K & Wire.ClientMessageType]
    ? never
    : K;
}[Exclude<keyof ClientData, Known>];

type None<T> = [T] extends [never] ? true : T;

export const checks: [
  None<NotServerMessages>,
  None<NotClientMessages>,
  None<ServerMismatches>,
  None<ClientMismatches>,
] = [true, true, true, true];
