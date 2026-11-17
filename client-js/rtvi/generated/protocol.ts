/**
 * Generated from rtvi/spec/2.3.0/rtvi.asyncapi.json by
 * scripts/rtvi-protocol.mjs. Do not edit; run `npm run rtvi:generate`.
 */

/** The protocol version this file describes. */
export const PROTOCOL_VERSION = "2.3.0";

/**
 * One node in the UI accessibility snapshot tree.
 */
export interface A11YNode {
  /**
   * Stable client-assigned element reference.
   */
  ref: string;
  /**
   * ARIA-style role for the node.
   */
  role: string;
  /**
   * Optional accessible name.
   */
  name?: string | null;
  /**
   * Optional current value for inputs/progress/etc.
   */
  value?: string | null;
  /**
   * Optional short state tags (e.g. `"focused"`, `"disabled"`, `"offscreen"`).
   */
  state?: string[] | null;
  /**
   * Optional heading level.
   */
  level?: number | null;
  /**
   * Optional column count for grid-like containers.
   */
  colcount?: number | null;
  /**
   * Optional row count for grid-like containers.
   */
  rowcount?: number | null;
  /**
   * Optional child nodes.
   */
  children?: A11YNode[] | null;
  [k: string]: unknown;
}

/**
 * The user's current text selection in the UI snapshot.
 */
export interface A11YSelection {
  /**
   * Ref of the element that carries the selection.
   */
  ref: string;
  /**
   * Selected text.
   */
  text: string;
  /**
   * Optional selection start offset.
   */
  start_offset?: number | null;
  /**
   * Optional selection end offset.
   */
  end_offset?: number | null;
  [k: string]: unknown;
}

/**
 * Client accessibility snapshot sent in a `ui-snapshot` message.
 */
export interface A11YSnapshot {
  /**
   * Root accessibility node.
   */
  root: A11YNode;
  /**
   * Client-side epoch milliseconds when captured.
   */
  captured_at: number;
  /**
   * Optional current text selection.
   */
  selection?: A11YSelection | null;
  [k: string]: unknown;
}

/**
 * Data about the RTVI client.
 */
export interface AboutClientData {
  /**
   * The RTVI library the client uses, such as `@pipecat-ai/client-js`.
   */
  library: string;
  /**
   * The version of that library.
   */
  library_version?: string | null;
  /**
   * The platform the client runs on, such as a browser or `iOS`.
   */
  platform?: string | null;
  /**
   * The platform's version.
   */
  platform_version?: string | null;
  platform_details?: unknown;
}

/**
 * Data format for sending audio levels.
 */
export interface AudioLevelMessageData {
  /**
   * How loud the audio is, from 0 (quiet) to 1 (loud).
   */
  value: number;
}

/**
 * What a bot does in a session.
 */
export interface BotCapabilities {
  /**
   * Whether the bot receives the user's audio.
   */
  audio_in?: boolean;
  /**
   * Whether the bot sends audio to the user.
   */
  audio_out?: boolean;
  /**
   * Whether the bot receives the user's video.
   */
  video_in?: boolean;
  /**
   * Whether the bot receives the user's screen share. Known when the transport captures its video sources from `video_in_sources`; unknown when the application captures them itself.
   */
  screen_in?: boolean;
  /**
   * Whether the bot sends video to the user.
   */
  video_out?: boolean;
  /**
   * Whether the bot reports metrics.
   */
  metrics?: boolean;
}

/**
 * Data for a bot LLM marker message.
 */
export interface BotLLMMarkerMessageData {
  /**
   * The marker as the LLM produced it; empty when the response carried none.
   */
  text: string;
  /**
   * What the marker means, such as `complete`, `short` or `long` for the markers that say whether the user's turn was complete, or `null` when it means nothing the server knows.
   */
  kind?: string;
  /**
   * The response's text as the LLM produced it, markers included.
   */
  raw: string;
  /**
   * Every marker the emitter recognizes.
   */
  markers: string[];
}

/**
 * Data for bot output RTVI messages.
 */
export interface BotOutputMessageData {
  /**
   * The text.
   */
  text: string;
  /**
   * What form the text is in (e.g., sentence, code, etc.).
   */
  output_type: TextType | string;
  /**
   * @deprecated
   * What form the text is in, always the same as `output_type`. Deprecated: Use `output_type` instead.
   */
  text_type?: TextType | string;
  /**
   * @deprecated
   * What form the text is in, always the same as `output_type`. Deprecated: Use `output_type` instead.
   */
  aggregated_by?: TextType | string;
  /**
   * Identifies the segment the text belongs to; every message about one segment, such as its spoken progress, carries the same id.
   */
  segment_id?: number;
  /**
   * **(v1 only)** Whether the text has been spoken by TTS.
   */
  spoken?: boolean;
  /**
   * **(v2+)** Whether the text will be spoken by TTS.
   */
  will_be_spoken?: boolean;
  /**
   * **(v2+)** Lifecycle status of the segment: `"new"` on its first message, the only one for text that isn't spoken; `"in-progress"` as each of its words is spoken, for TTS services with word timestamps; `"completed"` once its last word is spoken.
   */
  spoken_status?: "new" | "in-progress" | "completed";
  /**
   * **(v2+)** Accumulated / remaining text breakdown. Present when `will_be_spoken` is `true`.
   */
  spoken_progress?: SpokenProgressData;
  /**
   * **(2.3.0+)** The delivery of the text just spoken, by its universal names, such as `["warm", "emphasis"]`, empty for the voice's baseline. They change within a segment where its delivery does, so a segment's `"new"` message has none. Present in expressive conversation (alpha).
   */
  delivery?: string[];
}

/**
 * Data for bot ready notification.
 */
export interface BotReadyData {
  /**
   * The RTVI protocol version the bot speaks with this client.
   */
  version: string;
  /**
   * Information about the bot, such as the Pipecat library and version.
   */
  about?: {
    [k: string]: unknown;
  };
  /**
   * What the bot does in this session (media sent and received, metrics), so the client can show only the UI that applies. Added in protocol 2.2.0.
   */
  capabilities?: BotCapabilities;
}

/**
 * Click an element on the client.
 */
export interface Click {
  /**
   * Snapshot ref from `<ui_state>`.
   */
  ref?: string;
  /**
   * Element id registered on the client. Used as a fallback when `ref` is not set or has gone stale.
   */
  target_id?: string;
}

/**
 * Data format of client ready messages.
 */
export interface ClientReadyData {
  /**
   * The RTVI protocol version the client speaks, such as `2.3.0`.
   */
  version: string;
  /**
   * Information about the client. A server receiving a `client-ready` without it, or with an invalid one, still starts the session, as a client of an unknown library.
   */
  about: AboutClientData;
}

/**
 * Data format for DTMF keypresses sent from the client.
 */
export interface DTMFInputData {
  /**
   * The keys pressed, in order: `0`-`9`, `*` or `#`.
   *
   * @minItems 1
   */
  buttons: [KeypadEntry, ...KeypadEntry[]];
}

/**
 * Data for an RTVI error event.
 */
export interface ErrorData {
  /**
   * What went wrong.
   */
  error: string;
  /**
   * Whether the bot stopped because of the error.
   */
  fatal: boolean;
}

/**
 * Data for an RTVI error response.
 */
export interface ErrorResponseData {
  /**
   * What went wrong.
   */
  error: string;
}

/**
 * File data structure for RTVI file sending.
 */
export interface File {
  /**
   * The file's MIME type, such as `application/pdf` or `image/png`.
   */
  format: string;
  /**
   * The file's name.
   */
  name?: string | null;
  /**
   * Where the file's content is: its bytes, or a URL.
   */
  source: FileBytes | FileUrl;
}

/**
 * File source as base64-encoded bytes.
 */
export interface FileBytes {
  /**
   * Always `"bytes"`.
   */
  type?: "bytes" | "url";
  /**
   * The file's content, base64-encoded.
   */
  bytes: string;
  /**
   * For an image, its width in pixels.
   */
  width?: number | null;
  /**
   * For an image, its height in pixels.
   */
  height?: number | null;
}

/**
 * File source as a URL.
 */
export interface FileUrl {
  /**
   * Always `"url"`.
   */
  type?: "bytes" | "url";
  /**
   * The file's URL: whatever the `POST /files` upload endpoint returned (`pipecat:<id>` with the default local storage, or a URL minted by a custom storage backend), a cloud-storage URI (`s3://`, `gs://`), or a plain `http(s)` URL. The URL is resolved at completion time: the LLM provider fetches it itself when it can (public URLs, its own cloud IAM), and otherwise the LLM service's `FileResolver` downloads the bytes and inlines them.
   */
  url: string;
}

/**
 * Move input focus to a target element.
 */
export interface Focus {
  /**
   * Snapshot ref from `<ui_state>`.
   */
  ref?: string;
  /**
   * Element id registered on the client.
   */
  target_id?: string;
}

/**
 * Briefly emphasize a target element (flash, glow, pulse).
 */
export interface Highlight {
  /**
   * Snapshot ref from `<ui_state>`.
   */
  ref?: string;
  /**
   * Element id registered on the client.
   */
  target_id?: string;
  /**
   * Optional highlight duration. Client default applies when None.
   */
  duration_ms?: number;
}

/**
 * DTMF keypad entries for phone system integration.
 */
export type KeypadEntry =
  "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0" | "#" | "*";

/**
 * Data for LLM function call in-progress notification.
 */
export interface LLMFunctionCallInProgressMessageData {
  /**
   * Unique identifier of the call.
   */
  tool_call_id: string;
  /**
   * Name of the function called.
   */
  function_name?: string;
  /**
   * Arguments passed to the function.
   */
  arguments?: {
    [k: string]: unknown;
  };
}

/**
 * @deprecated
 * Data for LLM function call notification.
 */
export interface LLMFunctionCallMessageData {
  /**
   * Name of the function called.
   */
  function_name: string;
  /**
   * Unique identifier of the call.
   */
  tool_call_id: string;
  /**
   * Arguments passed to the function.
   */
  args: {
    [k: string]: unknown;
  };
}

/**
 * Data for LLM function call result.
 */
export interface LLMFunctionCallResultData {
  /**
   * Name of the function called.
   */
  function_name: string;
  /**
   * Unique identifier of the call, as the server reported it.
   */
  tool_call_id: string;
  /**
   * Arguments the function was called with.
   */
  arguments: {
    [k: string]: unknown;
  };
  /**
   * What the function returned.
   */
  result:
    | {
        [k: string]: unknown;
      }
    | string;
}

/**
 * Data for LLM function call start notification.
 */
export interface LLMFunctionCallStartMessageData {
  /**
   * Name of the function called.
   */
  function_name?: string;
}

/**
 * Data for LLM function call stopped notification.
 */
export interface LLMFunctionCallStoppedMessageData {
  /**
   * Unique identifier of the call.
   */
  tool_call_id: string;
  /**
   * Whether the call was cancelled rather than completed.
   */
  cancelled: boolean;
  /**
   * Name of the function called.
   */
  function_name?: string;
  /**
   * The result, when the call completed with one.
   */
  result?: unknown;
}

/**
 * Token usage statistics for LLM operations.
 */
export interface LLMTokenUsage {
  /**
   * Number of tokens in the input prompt, net or gross of the cache counts depending on the service. Includes tool results the provider feeds back to the model, which are billed as input.
   */
  prompt_tokens: number;
  /**
   * Number of tokens in the generated completion, including any reasoning tokens.
   */
  completion_tokens: number;
  /**
   * Total number of tokens used, including any cached input tokens.
   */
  total_tokens: number;
  /**
   * Number of tokens read from cache, if applicable. Billed below the input rate.
   */
  cache_read_input_tokens?: number;
  /**
   * Number of tokens written to cache, if applicable. Billed at or above the input rate.
   */
  cache_creation_input_tokens?: number;
  /**
   * Number of completion tokens used for reasoning, if applicable.
   */
  reasoning_tokens?: number;
  /**
   * Number of prompt tokens that were audio, if applicable.
   */
  input_audio_tokens?: number;
  /**
   * Number of completion tokens that were audio, if applicable.
   */
  output_audio_tokens?: number;
  /**
   * Number of cache-read tokens that were audio, if applicable.
   */
  cache_read_input_audio_tokens?: number;
}

/**
 * Data for a metrics message: the metrics the bot's services reported.
 */
export interface MetricsMessageData {
  /**
   * How long each service took to process, in seconds.
   */
  processing?: ProcessingMetricsData[];
  /**
   * Each service's time to first byte, in seconds.
   */
  ttfb?: TTFBMetricsData[];
  /**
   * Each TTS service's time to first audio: its time to first byte plus any silence before the first audible sample.
   */
  ttfa?: TTFAMetricsData[];
  /**
   * Each LLM service's time to first answer token: its time to first byte plus any reasoning it streamed first.
   */
  ttfat?: TTFATMetricsData[];
  /**
   * The tokens each LLM call used.
   */
  tokens?: LLMTokenUsage[];
  /**
   * How much audio each STT service received.
   */
  stt_usage?: STTUsageMetricsData[];
  /**
   * How many characters each TTS service spoke.
   */
  characters?: TTSUsageMetricsData[];
}

/**
 * Client-side navigation to a named view.
 */
export interface Navigate {
  /**
   * App-defined view name (route, screen id, tab key, etc.).
   */
  view: string;
  /**
   * Optional view-specific parameters.
   */
  params?: {
    [k: string]: unknown;
  };
}

/**
 * General processing time metrics data.
 */
export interface ProcessingMetricsData {
  /**
   * Name of the processor generating the metrics.
   */
  processor: string;
  /**
   * Optional model name associated with the metrics.
   */
  model?: string;
  /**
   * Processing time measurement in seconds.
   */
  value: number;
}

/**
 * Data format for a `raw-audio-batch` message: several chunks of the user's audio.
 */
export interface RawAudioBatchData {
  /**
   * Chunks of 16-bit PCM audio, each base64-encoded, in order.
   */
  base64AudioBatch: string[];
  /**
   * The audio's sample rate, in Hz.
   */
  sampleRate: number;
  /**
   * The audio's number of channels.
   */
  numChannels: number;
}

/**
 * Data format for a `raw-audio` message: one chunk of the user's audio.
 */
export interface RawAudioData {
  /**
   * 16-bit PCM audio, base64-encoded.
   */
  base64Audio: string;
  /**
   * The audio's sample rate, in Hz.
   */
  sampleRate: number;
  /**
   * The audio's number of channels.
   */
  numChannels: number;
}

/**
 * Data structure expected from client messages sent to the RTVI server.
 */
export interface RawClientMessageData {
  /**
   * The message's type, one of the application's own.
   */
  t: string;
  d?: unknown;
}

/**
 * Data structure for server responses to client messages.
 */
export interface RawServerResponseData {
  /**
   * The `t` of the client message this answers.
   */
  t: string;
  /**
   * The answer's data, of the application's own.
   */
  d?: unknown;
}

/**
 * Data for STT raw text messages.
 */
export interface STTRawTextMessageData {
  /**
   * The transcribed text.
   */
  text: string;
  /**
   * Identifier for the user who spoke.
   */
  user_id: string;
  /**
   * When the user said it.
   */
  timestamp: string;
  /**
   * Whether the transcription is final, as opposed to interim.
   */
  final: boolean;
  /**
   * Who said it, when the STT service's diarization tells speakers apart.
   */
  speaker?: TranscriptionSpeaker;
}

/**
 * Usage statistics for STT operations.
 */
export interface STTUsage {
  /**
   * Client-measured seconds of audio submitted to the service since the last usage report.
   */
  audio_seconds: number;
}

/**
 * Speech-to-Text usage metrics data.
 */
export interface STTUsageMetricsData {
  /**
   * Name of the processor generating the metrics.
   */
  processor: string;
  /**
   * Optional model name associated with the metrics.
   */
  model?: string;
  /**
   * Usage statistics for the STT operation.
   */
  value: STTUsage;
}

/**
 * Scroll a target element into view.
 */
export interface ScrollTo {
  /**
   * Snapshot ref from `<ui_state>`.
   */
  ref?: string;
  /**
   * Element id registered on the client.
   */
  target_id?: string;
  /**
   * Optional scroll behavior hint. Typical values: `"smooth"` or `"instant"`. Clients may ignore.
   */
  behavior?: string;
}

/**
 * Select text on the page so the user can see what the worker means.
 */
export interface SelectText {
  /**
   * Snapshot ref from `<ui_state>`. Typically the ref of a paragraph or input element.
   */
  ref?: string;
  /**
   * Element id registered on the client. Used as a fallback when `ref` is not set or has gone stale.
   */
  target_id?: string;
  /**
   * Character offset within the target's text where the selection should start. For `<input>` and `<textarea>` this is the value offset; for document elements it is computed against the concatenation of descendant text nodes in document order.
   */
  start_offset?: number;
  /**
   * End character offset, exclusive. Same coordinate system as `start_offset`.
   */
  end_offset?: number;
}

/**
 * Data format for sending a file to the LLM.
 */
export interface SendFileData {
  /**
   * Text that goes with the file, such as a question about it.
   */
  content: string;
  /**
   * The file.
   */
  file: File;
  /**
   * How the bot handles the file.
   */
  options?: SendFileOptions | null;
}

/**
 * Options for sending a file to the LLM.
 */
export interface SendFileOptions {
  /**
   * Whether the bot responds to the file right away, interrupting itself if it is speaking. When false, the file waits in the conversation for the bot's next response.
   */
  run_immediately?: boolean;
  /**
   * Whether the bot speaks its response. When false, the response is text only.
   */
  audio_response?: boolean;
  /**
   * Options for the LLM provider, such as OpenAI's `detail` or Bedrock's `citations`.
   */
  custom_options?: {
    [k: string]: unknown;
  } | null;
}

/**
 * Data format for sending text input to the LLM.
 */
export interface SendTextData {
  /**
   * The text.
   */
  content: string;
  /**
   * How the bot handles the text.
   */
  options?: SendTextOptions | null;
}

/**
 * Options for sending text input to the LLM.
 */
export interface SendTextOptions {
  /**
   * Whether the bot responds to the text right away, interrupting itself if it is speaking. When false, the text waits in the conversation for the bot's next response.
   */
  run_immediately?: boolean;
  /**
   * Whether the bot speaks its response. When false, the response is text only.
   */
  audio_response?: boolean;
}

/**
 * Write a value into a text input or textarea on the client.
 */
export interface SetInputValue {
  /**
   * The text to write.
   */
  value: string;
  /**
   * Snapshot ref from `<ui_state>`. Typically the ref of an `<input>` or `<textarea>`.
   */
  ref?: string;
  /**
   * Element id registered on the client. Used as a fallback when `ref` is not set or has gone stale.
   */
  target_id?: string;
  /**
   * When True (the default), overwrite the current value. When False, append to it.
   */
  replace: boolean;
}

/**
 * Word-level TTS progress within a spoken segment.
 */
export interface SpokenProgressData {
  /**
   * Text already spoken in this segment, including the current word.
   */
  accumulated_text: string;
  /**
   * Text not yet spoken in this segment.
   */
  remaining_text: string;
}

/**
 * Time To First Audio (TTFA) metrics data.
 */
export interface TTFAMetricsData {
  /**
   * Name of the processor generating the metrics.
   */
  processor: string;
  /**
   * Optional model name associated with the metrics.
   */
  model?: string;
  /**
   * TTFA measurement in seconds (`ttfb` plus `leading_silence`).
   */
  ttfa: number;
  /**
   * Time-to-first-byte that TTFA builds on, in seconds. This mirrors the standalone `TTFBMetricsData` (emitted earlier) for convenience; it is not a separate measurement, so don't aggregate both.
   */
  ttfb: number;
  /**
   * Silence padding before the first audible sample, in seconds (`ttfa` minus `ttfb`).
   */
  leading_silence: number;
}

/**
 * Time To First Answer Token (TTFAT) metrics data.
 */
export interface TTFATMetricsData {
  /**
   * Name of the processor generating the metrics.
   */
  processor: string;
  /**
   * Optional model name associated with the metrics.
   */
  model?: string;
  /**
   * TTFAT measurement in seconds (`ttfb` plus `thinking_time`).
   */
  ttfat: number;
  /**
   * Time-to-first-byte that TTFAT builds on, in seconds. This mirrors the standalone `TTFBMetricsData` (emitted earlier) for convenience; it is not a separate measurement, so don't aggregate both.
   */
  ttfb: number;
  /**
   * Time between the model's first output and the first answer token, in seconds (`ttfat` minus `ttfb`). Reasoning is the usual reason a model streams something before it starts answering, though a model that reasons none still spends a little time here.
   */
  thinking_time: number;
}

/**
 * Time To First Byte (TTFB) metrics data.
 */
export interface TTFBMetricsData {
  /**
   * Name of the processor generating the metrics.
   */
  processor: string;
  /**
   * Optional model name associated with the metrics.
   */
  model?: string;
  /**
   * TTFB measurement in seconds.
   */
  value: number;
}

/**
 * Text-to-Speech usage metrics data.
 */
export interface TTSUsageMetricsData {
  /**
   * Name of the processor generating the metrics.
   */
  processor: string;
  /**
   * Optional model name associated with the metrics.
   */
  model?: string;
  /**
   * Number of characters processed by TTS.
   */
  value: number;
}

/**
 * Data for text-based RTVI messages.
 */
export interface TextMessageData {
  /**
   * The text.
   */
  text: string;
}

/**
 * Built-in text types.
 */
export type TextType =
  | "backchannel"
  | "expression_sound"
  | "expression_pause"
  | "sentence"
  | "token"
  | "word";

/**
 * A transient notification surface shown on the client.
 */
export interface Toast {
  /**
   * Required headline.
   */
  title: string;
  /**
   * Optional second line beneath the title.
   */
  subtitle?: string;
  /**
   * Optional body text.
   */
  description?: string;
  /**
   * Optional leading image.
   */
  image_url?: string;
  /**
   * Optional dismiss timer. Client default applies when None.
   */
  duration_ms?: number;
}

/**
 * A speaker an STT service's diarization told apart in a transcription stream.
 */
export interface TranscriptionSpeaker {
  /**
   * The provider's label for the speaker (e.g. `"A"`, `"S1"`, `"2"`).
   */
  label: string;
  /**
   * The speaker's place in the order speakers first appeared, starting at `1`.
   */
  number: number;
}

/**
 * A command of the application's own, with a name and payload it defines.
 */
export interface UIAppCommand {
  /**
   * The command's name, other than a standard command's.
   */
  command: string;
  /**
   * The command's payload, a JSON object.
   */
  payload?: unknown;
}

/**
 * Inner `data` for a `ui-cancel-job-group` message.
 */
export interface UICancelJobGroupData {
  /**
   * The job group id the client wants cancelled.
   */
  job_id: string;
  /**
   * Optional human-readable reason.
   */
  reason?: string | null;
}

/**
 * The standard `click` command: click an element on the client.
 */
export interface UIClickCommand {
  /**
   * The command's name.
   */
  command: "click";
  /**
   * The command's payload.
   */
  payload: Click;
}

/**
 * Inner `data` for a `ui-event` message.
 */
export interface UIEventData {
  /**
   * App-defined event.
   */
  event: string;
  payload?: unknown;
}

/**
 * The standard `focus` command: move input focus to a target element.
 */
export interface UIFocusCommand {
  /**
   * The command's name.
   */
  command: "focus";
  /**
   * The command's payload.
   */
  payload: Focus;
}

/**
 * The standard `highlight` command: briefly emphasize a target element (flash, glow, pulse).
 */
export interface UIHighlightCommand {
  /**
   * The command's name.
   */
  command: "highlight";
  /**
   * The command's payload.
   */
  payload: Highlight;
}

/**
 * `data` for a `ui-job-group` envelope with kind `job_completed`.
 */
export interface UIJobCompletedData {
  /**
   * Always `"job_completed"`.
   */
  kind: "job_completed";
  /**
   * The shared job-group identifier.
   */
  job_id: string;
  /**
   * The worker that produced the response.
   */
  worker_name: string;
  /**
   * Completion status string.
   */
  status: string;
  /**
   * The worker's response payload.
   */
  response?: unknown;
  /**
   * Epoch milliseconds when the response was received.
   */
  at: number;
}

/**
 * `data` for a `ui-job-group` envelope with kind `group_completed`.
 */
export interface UIJobGroupCompletedData {
  /**
   * Always `"group_completed"`.
   */
  kind: "group_completed";
  /**
   * The shared job-group identifier.
   */
  job_id: string;
  /**
   * Epoch milliseconds when the group completed.
   */
  at: number;
}

/**
 * `data` for a `ui-job-group` envelope with kind `group_started`.
 */
export interface UIJobGroupStartedData {
  /**
   * Always `"group_started"`.
   */
  kind: "group_started";
  /**
   * Shared job-group identifier for the group.
   */
  job_id: string;
  /**
   * Names of the workers the work was dispatched to.
   */
  workers?: string[];
  /**
   * Optional human-readable label for the group.
   */
  label?: string;
  /**
   * Whether the client may request cancellation.
   */
  cancellable: boolean;
  /**
   * Epoch milliseconds when the group started.
   */
  at: number;
}

/**
 * `data` for a `ui-job-group` envelope with kind `job_update`.
 */
export interface UIJobUpdateData {
  /**
   * Always `"job_update"`.
   */
  kind: "job_update";
  /**
   * The shared job-group identifier.
   */
  job_id: string;
  /**
   * The worker that produced the update.
   */
  worker_name: string;
  /**
   * The worker's update payload, forwarded verbatim.
   */
  data?: unknown;
  /**
   * Epoch milliseconds when the update was emitted.
   */
  at: number;
}

/**
 * The standard `navigate` command: client-side navigation to a named view.
 */
export interface UINavigateCommand {
  /**
   * The command's name.
   */
  command: "navigate";
  /**
   * The command's payload.
   */
  payload: Navigate;
}

/**
 * The standard `scroll_to` command: scroll a target element into view.
 */
export interface UIScrollToCommand {
  /**
   * The command's name.
   */
  command: "scroll_to";
  /**
   * The command's payload.
   */
  payload: ScrollTo;
}

/**
 * The standard `select_text` command: select text on the page so the user can see what the worker means.
 */
export interface UISelectTextCommand {
  /**
   * The command's name.
   */
  command: "select_text";
  /**
   * The command's payload.
   */
  payload: SelectText;
}

/**
 * The standard `set_input_value` command: write a value into a text input or textarea on the client.
 */
export interface UISetInputValueCommand {
  /**
   * The command's name.
   */
  command: "set_input_value";
  /**
   * The command's payload.
   */
  payload: SetInputValue;
}

/**
 * Inner `data` for a `ui-snapshot` message.
 */
export interface UISnapshotData {
  /**
   * The serialized accessibility tree.
   */
  tree: A11YSnapshot;
}

/**
 * The standard `toast` command: a transient notification surface shown on the client.
 */
export interface UIToastCommand {
  /**
   * The command's name.
   */
  command: "toast";
  /**
   * The command's payload.
   */
  payload: Toast;
}

/**
 * Data for user input messages.
 */
export interface UserInputMessageData {
  /**
   * What the user said or typed.
   */
  text: string;
  /**
   * What kind of input it is: `"transcription"` for speech transcribed by the STT, `"chat"` for text the client sent, or `"backchannel"` for a short acknowledgment the user said while the bot talks, such as "mhm".
   */
  input_type: "transcription" | "chat" | "backchannel";
  /**
   * When the user said or sent it.
   */
  timestamp: string;
  /**
   * Whether the text is final. Only an interim transcription isn't.
   */
  final: boolean;
  /**
   * Identifier for the user who spoke or typed. For chat, set only when the transport knows the sender, such as Daily and LiveKit.
   */
  user_id?: string;
  /**
   * For chat, the id of the client's `send-text` message.
   */
  msg_id?: string;
  /**
   * For a transcription, how the user said it, when the STT service reports a reading with it. Part of expressive conversation (alpha).
   */
  perception?: UserPerceptionSignal[];
  /**
   * For a transcription, who said it, when the STT service's diarization tells speakers apart.
   */
  speaker?: TranscriptionSpeaker;
}

/**
 * A label of a perception signal, with how sure the reading is.
 */
export interface UserPerceptionLabel {
  /**
   * The label, such as `"frustrated"`.
   */
  label: string;
  /**
   * How sure the reading is, from 0 to 1.
   */
  confidence: number;
}

/**
 * One signal of a reading of how the user spoke.
 */
export interface UserPerceptionSignal {
  /**
   * What is read, such as `"tone"`.
   */
  name: string;
  /**
   * The likeliest labels, likeliest first, for a signal read as labels.
   */
  labels: UserPerceptionLabel[];
  /**
   * The measure, for a signal read as a value.
   */
  value?: number;
}

/**
 * Data for user transcription messages.
 */
export interface UserTranscriptionMessageData {
  /**
   * The transcribed text.
   */
  text: string;
  /**
   * Identifier for the user who spoke.
   */
  user_id: string;
  /**
   * When the user said it.
   */
  timestamp: string;
  /**
   * Whether the transcription is final, as opposed to interim.
   */
  final: boolean;
}

/** The type of every message a client sends. */
export type ClientMessageType =
  | "client-ready"
  | "disconnect-bot"
  | "client-message"
  | "send-text"
  | "send-file"
  | "dtmf"
  | "llm-function-call-result"
  | "raw-audio"
  | "raw-audio-batch"
  | "ui-event"
  | "ui-snapshot"
  | "ui-cancel-job-group";

/** The type of every message the server sends. */
export type ServerMessageType =
  | "bot-ready"
  | "error"
  | "error-response"
  | "server-response"
  | "server-message"
  | "metrics"
  | "system-log"
  | "user-started-speaking"
  | "user-stopped-speaking"
  | "vad-user-started-speaking"
  | "vad-user-stopped-speaking"
  | "user-mute-started"
  | "user-mute-stopped"
  | "bot-started-speaking"
  | "bot-stopped-speaking"
  | "bot-interrupted"
  | "user-audio-level"
  | "bot-audio-level"
  | "user-input"
  | "user-llm-text"
  | "stt-raw-text"
  | "user-transcription"
  | "bot-output"
  | "bot-llm-started"
  | "bot-llm-stopped"
  | "bot-tts-started"
  | "bot-tts-stopped"
  | "llm-raw-text"
  | "tts-raw-text"
  | "bot-llm-marker"
  | "bot-transcription"
  | "bot-llm-text"
  | "bot-tts-text"
  | "llm-function-call-started"
  | "llm-function-call-in-progress"
  | "llm-function-call-stopped"
  | "llm-function-call"
  | "ui-command"
  | "ui-job-group";

/** The `data` of each client message, `undefined` for one that carries none. */
export interface ClientMessageData {
  "client-ready": ClientReadyData;
  "disconnect-bot": undefined;
  "client-message": RawClientMessageData;
  "send-text": SendTextData;
  "send-file": SendFileData;
  dtmf: DTMFInputData;
  "llm-function-call-result": LLMFunctionCallResultData;
  "raw-audio": RawAudioData;
  "raw-audio-batch": RawAudioBatchData;
  "ui-event": UIEventData;
  "ui-snapshot": UISnapshotData;
  "ui-cancel-job-group": UICancelJobGroupData;
}

/** The `data` of each server message, `undefined` for one that carries none. */
export interface ServerMessageData {
  "bot-ready": BotReadyData;
  error: ErrorData;
  "error-response": ErrorResponseData;
  "server-response": RawServerResponseData;
  "server-message": unknown;
  metrics: MetricsMessageData;
  "system-log": TextMessageData;
  "user-started-speaking": undefined;
  "user-stopped-speaking": undefined;
  "vad-user-started-speaking": undefined;
  "vad-user-stopped-speaking": undefined;
  "user-mute-started": undefined;
  "user-mute-stopped": undefined;
  "bot-started-speaking": undefined;
  "bot-stopped-speaking": undefined;
  "bot-interrupted": undefined;
  "user-audio-level": AudioLevelMessageData;
  "bot-audio-level": AudioLevelMessageData;
  "user-input": UserInputMessageData;
  "user-llm-text": TextMessageData;
  "stt-raw-text": STTRawTextMessageData;
  "user-transcription": UserTranscriptionMessageData;
  "bot-output": BotOutputMessageData;
  "bot-llm-started": undefined;
  "bot-llm-stopped": undefined;
  "bot-tts-started": undefined;
  "bot-tts-stopped": undefined;
  "llm-raw-text": TextMessageData;
  "tts-raw-text": TextMessageData;
  "bot-llm-marker": BotLLMMarkerMessageData;
  "bot-transcription": TextMessageData;
  "bot-llm-text": TextMessageData;
  "bot-tts-text": TextMessageData;
  "llm-function-call-started": LLMFunctionCallStartMessageData;
  "llm-function-call-in-progress": LLMFunctionCallInProgressMessageData;
  "llm-function-call-stopped": LLMFunctionCallStoppedMessageData;
  "llm-function-call": LLMFunctionCallMessageData;
  "ui-command":
    | UIToastCommand
    | UINavigateCommand
    | UIScrollToCommand
    | UIHighlightCommand
    | UIFocusCommand
    | UIClickCommand
    | UISetInputValueCommand
    | UISelectTextCommand
    | UIAppCommand;
  "ui-job-group":
    | UIJobGroupStartedData
    | UIJobUpdateData
    | UIJobCompletedData
    | UIJobGroupCompletedData;
}

/**
 * For each server message: the server setting that turns it on, the lowest
 * client protocol version the server sends it to, and what replaces it when
 * it is deprecated.
 */
export const SERVER_MESSAGES: Record<
  ServerMessageType,
  { enabledBy?: string; minClientVersion?: string; deprecated?: string }
> = {
  "bot-ready": {},
  error: {},
  "error-response": {},
  "server-response": {},
  "server-message": {},
  metrics: { enabledBy: "metrics_enabled" },
  "system-log": { enabledBy: "system_logs_enabled" },
  "user-started-speaking": { enabledBy: "user_speaking_enabled" },
  "user-stopped-speaking": { enabledBy: "user_speaking_enabled" },
  "vad-user-started-speaking": { enabledBy: "vad_user_speaking_enabled" },
  "vad-user-stopped-speaking": { enabledBy: "vad_user_speaking_enabled" },
  "user-mute-started": { enabledBy: "user_mute_enabled" },
  "user-mute-stopped": { enabledBy: "user_mute_enabled" },
  "bot-started-speaking": { enabledBy: "bot_speaking_enabled" },
  "bot-stopped-speaking": { enabledBy: "bot_speaking_enabled" },
  "bot-interrupted": { enabledBy: "bot_speaking_enabled" },
  "user-audio-level": { enabledBy: "user_audio_level_enabled" },
  "bot-audio-level": { enabledBy: "bot_audio_level_enabled" },
  "user-input": { enabledBy: "user_input_enabled" },
  "user-llm-text": { enabledBy: "user_llm_enabled" },
  "stt-raw-text": {
    enabledBy: "stt_raw_text_enabled",
    minClientVersion: "2.2.0",
  },
  "user-transcription": {
    enabledBy: "user_transcription_enabled",
    deprecated: "Use user-input or stt-raw-text instead.",
  },
  "bot-output": { enabledBy: "bot_output_enabled" },
  "bot-llm-started": { enabledBy: "bot_llm_enabled" },
  "bot-llm-stopped": { enabledBy: "bot_llm_enabled" },
  "bot-tts-started": { enabledBy: "bot_tts_enabled" },
  "bot-tts-stopped": { enabledBy: "bot_tts_enabled" },
  "llm-raw-text": {
    enabledBy: "llm_raw_text_enabled",
    minClientVersion: "2.2.0",
  },
  "tts-raw-text": {
    enabledBy: "tts_raw_text_enabled",
    minClientVersion: "2.2.0",
  },
  "bot-llm-marker": { enabledBy: "bot_llm_marker_enabled" },
  "bot-transcription": {
    enabledBy: "bot_llm_enabled",
    deprecated: "Use bot-output instead.",
  },
  "bot-llm-text": {
    enabledBy: "bot_llm_enabled",
    deprecated: "Use llm-raw-text instead.",
  },
  "bot-tts-text": {
    enabledBy: "bot_tts_enabled",
    deprecated: "Use tts-raw-text instead.",
  },
  "llm-function-call-started": {},
  "llm-function-call-in-progress": {},
  "llm-function-call-stopped": {},
  "llm-function-call": {
    deprecated: "Use llm-function-call-in-progress instead.",
  },
  "ui-command": {},
  "ui-job-group": {},
};
