/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  deduplicateFunctionCalls,
  filterEmptyMessages,
  isMessageEmpty,
  mergeMessages,
  sortByCreatedAt,
} from "./conversation/conversationActions";
import { filterBotOutputText } from "./conversation/filterBotOutputText";
import { useConversationContext } from "./conversation/PipecatConversationProvider";
import { PipecatClientAudio } from "./PipecatClientAudio";
import { PipecatClientCamToggle } from "./PipecatClientCamToggle";
import { PipecatClientMicToggle } from "./PipecatClientMicToggle";
import { PipecatClientProvider } from "./PipecatClientProvider";
import { PipecatClientScreenShareToggle } from "./PipecatClientScreenShareToggle";
import { PipecatClientVideo } from "./PipecatClientVideo";
import {
  useNavigateHandler,
  useStandardCommandHandlers,
  useStandardFocusHandler,
  useStandardHighlightHandler,
  useStandardScrollToHandler,
  useToastHandler,
} from "./standardHandlers";
import { UIAgentContext } from "./UIAgentContext";
import { UIAgentProvider } from "./UIAgentProvider";
import { usePipecatClient } from "./usePipecatClient";
import { usePipecatClientCamControl } from "./usePipecatClientCamControl";
import { usePipecatClientMediaDevices } from "./usePipecatClientMediaDevices";
import { usePipecatClientMediaTrack } from "./usePipecatClientMediaTrack";
import { usePipecatClientMicControl } from "./usePipecatClientMicControl";
import { usePipecatClientScreenShareControl } from "./usePipecatClientScreenShareControl";
import { usePipecatClientTransportState } from "./usePipecatClientTransportState";
import { usePipecatConversation } from "./usePipecatConversation";
import { useRTVIClientEvent } from "./useRTVIClientEvent";
import { useUIAgentClient } from "./useUIAgentClient";
import { useUICommandHandler } from "./useUICommandHandler";
import { useUIEventSender } from "./useUIEventSender";
import { VoiceVisualizer } from "./VoiceVisualizer";

export {
  deduplicateFunctionCalls,
  filterBotOutputText,
  filterEmptyMessages,
  isMessageEmpty,
  mergeMessages,
  PipecatClientAudio,
  PipecatClientCamToggle,
  PipecatClientMicToggle,
  PipecatClientProvider,
  PipecatClientScreenShareToggle,
  PipecatClientVideo,
  sortByCreatedAt,
  UIAgentContext,
  UIAgentProvider,
  // Conversation
  useConversationContext,
  useNavigateHandler,
  usePipecatClient,
  usePipecatClientCamControl,
  usePipecatClientMediaDevices,
  usePipecatClientMediaTrack,
  usePipecatClientMicControl,
  usePipecatClientScreenShareControl,
  usePipecatClientTransportState,
  usePipecatConversation,
  useRTVIClientEvent,
  useStandardCommandHandlers,
  useStandardFocusHandler,
  useStandardHighlightHandler,
  useStandardScrollToHandler,
  useToastHandler,
  useUIAgentClient,
  useUICommandHandler,
  useUIEventSender,
  VoiceVisualizer,
};

// Conversation types
export type {
  AggregationMetadata,
  BotOutputEvent,
  BotOutputFilter,
  BotOutputText,
  ConversationMessage,
  ConversationMessagePart,
  FunctionCallData,
  FunctionCallRenderer,
} from "./conversation/types";

// UI agent protocol re-exports from @pipecat-ai/client-js so React
// consumers don't need a second import.
export type {
  FocusPayload,
  HighlightPayload,
  NavigatePayload,
  ScrollToPayload,
  ToastPayload,
  UICommandEnvelope,
  UICommandHandler,
  UIEventEnvelope,
} from "@pipecat-ai/client-js";
export {
  UI_COMMAND_MESSAGE_TYPE,
  UI_EVENT_MESSAGE_TYPE,
} from "@pipecat-ai/client-js";
