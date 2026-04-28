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
  useStandardSelectTextHandler,
  useToastHandler,
} from "./standardHandlers";
import { UIAgentContext } from "./UIAgentContext";
import { UIAgentProvider } from "./UIAgentProvider";
import { UITasksContext } from "./UITasksContext";
import { UITasksProvider } from "./UITasksProvider";
import { useA11ySnapshot } from "./useA11ySnapshot";
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
import { useUITasks } from "./useUITasks";
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
  UITasksContext,
  UITasksProvider,
  useA11ySnapshot,
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
  useStandardSelectTextHandler,
  useToastHandler,
  useUIAgentClient,
  useUICommandHandler,
  useUIEventSender,
  useUITasks,
  VoiceVisualizer,
};

// UI tasks types
export type {
  Task,
  TaskGroup,
  TaskUpdate,
  UITasksAPI,
} from "./uiTasksTypes";

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
  A11yNode,
  A11ySnapshot,
  FocusPayload,
  HighlightPayload,
  NavigatePayload,
  ScrollToPayload,
  SelectTextPayload,
  TaskStatus,
  ToastPayload,
  UICommandEnvelope,
  UICommandHandler,
  UIEventEnvelope,
  UITaskCompletedEnvelope,
  UITaskEnvelope,
  UITaskGroupCompletedEnvelope,
  UITaskGroupStartedEnvelope,
  UITaskListener,
  UITaskUpdateEnvelope,
} from "@pipecat-ai/client-js";
export type { A11ySnapshotStreamerOptions } from "@pipecat-ai/client-js";
export {
  A11ySnapshotStreamer,
  findElementByRef,
  snapshotDocument,
  UI_CANCEL_TASK_EVENT_NAME,
  UI_COMMAND_MESSAGE_TYPE,
  UI_EVENT_MESSAGE_TYPE,
  UI_SNAPSHOT_EVENT_NAME,
  UI_TASK_MESSAGE_TYPE,
} from "@pipecat-ai/client-js";
