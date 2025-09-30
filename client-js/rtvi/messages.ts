/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { v4 as uuidv4 } from "uuid";

import {
  name as packageName,
  version as packageVersion,
} from "../package.json";

export const RTVI_PROTOCOL_VERSION = "1.0.0";
export const RTVI_MESSAGE_LABEL = "rtvi-ai";

/**
 * Messages the corresponding server-side client expects to receive about
 * our client-side state.
 */
export enum RTVIMessageType {
  /** Outbound Messages */
  CLIENT_READY = "client-ready",
  DISCONNECT_BOT = "disconnect-bot",
  // Client-to-server messages
  CLIENT_MESSAGE = "client-message",
  SEND_TEXT = "send-text",
  // DEPRECATED
  APPEND_TO_CONTEXT = "append-to-context",

  /**
   * Inbound Messages
   * Messages the server-side client sends to our client-side client regarding
   * its state or other non-service-specific messaging.
   */
  BOT_READY = "bot-ready", // Bot is connected and ready to receive messages
  ERROR = "error", // Bot initialization error
  METRICS = "metrics", // Bot reporting metrics
  SERVER_MESSAGE = "server-message", // Custom server-to-client message
  SERVER_RESPONSE = "server-response", // Server response to client message
  ERROR_RESPONSE = "error-response", // Error message in response to an outbound message
  APPEND_TO_CONTEXT_RESULT = "append-to-context-result", // Result of appending to context

  /** Transcription Messages */
  USER_TRANSCRIPTION = "user-transcription", // Local user speech to text transcription (partials and finals)
  BOT_TRANSCRIPTION = "bot-transcription", // Bot full text transcription (sentence aggregated)
  USER_STARTED_SPEAKING = "user-started-speaking", // User started speaking
  USER_STOPPED_SPEAKING = "user-stopped-speaking", // User stopped speaking
  BOT_STARTED_SPEAKING = "bot-started-speaking", // Bot started speaking
  BOT_STOPPED_SPEAKING = "bot-stopped-speaking", // Bot stopped speaking

  /** LLM Messages */
  USER_LLM_TEXT = "user-llm-text", // Aggregated user input text which is sent to LLM
  BOT_LLM_TEXT = "bot-llm-text", // Streamed token returned by the LLM
  BOT_LLM_STARTED = "bot-llm-started", // Bot LLM inference starts
  BOT_LLM_STOPPED = "bot-llm-stopped", // Bot LLM inference stops

  // Function calling
  LLM_FUNCTION_CALL = "llm-function-call", // Inbound function call from LLM
  LLM_FUNCTION_CALL_RESULT = "llm-function-call-result", // Outbound result of function call

  BOT_LLM_SEARCH_RESPONSE = "bot-llm-search-response", // Bot LLM search response

  /** TTS Messages */
  BOT_TTS_TEXT = "bot-tts-text", // Bot TTS text output (streamed word as it is spoken)
  BOT_TTS_STARTED = "bot-tts-started", // Bot TTS response starts
  BOT_TTS_STOPPED = "bot-tts-stopped", // Bot TTS response stops
}

// ----- Message Data Types

export type BotReadyData = {
  version: string;
  about?: unknown; // Optional about data from the bot
};

type PlatformDetailsValue = undefined | string | number | boolean;
type NestedPlatformDetails =
  | PlatformDetailsValue
  | Record<string, PlatformDetailsValue>;

// This is an interface so that different client libraries can provide their own
// implementation of the about data, e.g., with more platform-specific details.
// The client library should call `setAboutClient` to set this data before sending
// the `client-ready` message.
export interface AboutClientData {
  library: string; // Library name, e.g., "@pipecat-ai/client-js"
  library_version?: string; // Library version, e.g., "1.0.0"
  platform?: string; // Platform name, e.g., "Android"
  platform_version?: string; // Platform version, e.g., "14.0"
  platform_details?: Record<string, NestedPlatformDetails>; // Optional platform details, e.g., browser info
}

export type ClientReadyData = {
  version: string;
  about: AboutClientData; // Information about the client library
};

export type ErrorData = {
  message: string;
  fatal: boolean;
};

export type PipecatMetricData = {
  processor: string;
  value: number;
};

export type PipecatMetricsData = {
  processing?: PipecatMetricData[];
  ttfb?: PipecatMetricData[];
  characters?: PipecatMetricData[];
};

export type TranscriptData = {
  text: string;
  final: boolean;
  timestamp: string;
  user_id: string;
};

export type BotLLMTextData = {
  text: string;
};

export type BotTTSTextData = {
  text: string;
};

export type BotTranscriptData = BotLLMTextData & {
  source?: "llm" | "tts";
};

export type ServerMessageData = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

export type ClientMessageData = {
  t: string;
  d?: unknown;
};

export type LLMSearchResult = {
  text: string;
  confidence: number[];
};

export type BotLLMSearchResponseData = {
  search_result?: string;
  rendered_content?: string;
  origins: LLMSearchOrigin[];
};

export type LLMSearchOrigin = {
  site_uri?: string;
  site_title?: string;
  results: LLMSearchResult[];
};

export type LLMFunctionCallData = {
  function_name: string;
  tool_call_id: string;
  args: Record<string, unknown>;
};

export type LLMFunctionCallResult = Record<string, unknown> | string;

export type LLMFunctionCallResultResponse = {
  function_name: string;
  tool_call_id: string;
  args: Record<string, unknown>;
  result: LLMFunctionCallResult;
};

export type SendTextOptions = {
  run_immediately?: boolean;
  audio_response?: boolean;
};

/** DEPRECATED */
export type LLMContextMessage = {
  role: "user" | "assistant";
  content: unknown;
  run_immediately?: boolean;
};

/** DEPRECATED */
export type AppendToContextResultData = {
  result: Record<string, unknown> | string;
};

// ----- Message Classes

let _aboutClient: AboutClientData | undefined;
export function setAboutClient(about: AboutClientData) {
  // allow for partial updates to the about data
  // this allows the client to set the about data at any time
  // before sending the `client-ready` message and not worry about
  // overwriting existing data
  if (_aboutClient) {
    _aboutClient = { ..._aboutClient, ...about };
  } else {
    // if no about data is set, set it to the provided value
    _aboutClient = about;
  }
}

export class RTVIMessage {
  id: string;
  label: string = RTVI_MESSAGE_LABEL;
  type: string;
  data: unknown;

  constructor(type: string, data: unknown, id?: string) {
    this.type = type;
    this.data = data;
    this.id = id || uuidv4().slice(0, 8);
  }

  // Outbound message types
  static clientReady(): RTVIMessage {
    return new RTVIMessage(RTVIMessageType.CLIENT_READY, {
      version: RTVI_PROTOCOL_VERSION,
      about: _aboutClient || {
        library: packageName,
        library_version: packageVersion,
      },
    });
  }

  static disconnectBot(): RTVIMessage {
    return new RTVIMessage(RTVIMessageType.DISCONNECT_BOT, {});
  }

  static error(message: string, fatal = false): RTVIMessage {
    return new RTVIMessage(RTVIMessageType.ERROR, { message, fatal });
  }
}
