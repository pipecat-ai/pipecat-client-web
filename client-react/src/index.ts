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
import {
  useDefaultClickHandler,
  useDefaultFocusHandler,
  useDefaultHighlightHandler,
  useDefaultScrollToHandler,
  useDefaultSelectTextHandler,
  useDefaultSetInputValueHandler,
  useDefaultUICommandHandlers,
  useNavigateHandler,
  useToastHandler,
} from "./defaultUICommandHandlers";
import { PipecatClientAudio } from "./PipecatClientAudio";
import { PipecatClientCamToggle } from "./PipecatClientCamToggle";
import { useMediaState } from "./PipecatClientMediaState";
import { PipecatClientMicToggle } from "./PipecatClientMicToggle";
import { PipecatClientProvider } from "./PipecatClientProvider";
import { PipecatClientScreenShareToggle } from "./PipecatClientScreenShareToggle";
import { PipecatClientVideo } from "./PipecatClientVideo";
import { UITasksContext } from "./UITasksContext";
import { UITasksProvider } from "./UITasksProvider";
import { usePipecatClient } from "./usePipecatClient";
import { usePipecatClientCamControl } from "./usePipecatClientCamControl";
import { usePipecatClientMediaDevices } from "./usePipecatClientMediaDevices";
import { usePipecatClientMediaTrack } from "./usePipecatClientMediaTrack";
import { usePipecatClientMicControl } from "./usePipecatClientMicControl";
import { usePipecatClientScreenShareControl } from "./usePipecatClientScreenShareControl";
import { usePipecatClientTransportState } from "./usePipecatClientTransportState";
import { usePipecatConversation } from "./usePipecatConversation";
import { useRTVIClientEvent } from "./useRTVIClientEvent";
import { useUICommandHandler } from "./useUICommandHandler";
import { useUIEventSender } from "./useUIEventSender";
import { useUISnapshot } from "./useUISnapshot";
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
  UITasksContext,
  UITasksProvider,
  // Conversation
  useConversationContext,
  useDefaultClickHandler,
  useDefaultFocusHandler,
  useDefaultHighlightHandler,
  useDefaultScrollToHandler,
  useDefaultSelectTextHandler,
  useDefaultSetInputValueHandler,
  useDefaultUICommandHandlers,
  useMediaState,
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
  useToastHandler,
  useUICommandHandler,
  useUIEventSender,
  useUISnapshot,
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
export type {
  DefaultFocusOptions,
  DefaultHighlightOptions,
  DefaultScrollToOptions,
  DefaultSelectTextOptions,
  DefaultSetInputValueOptions,
  DefaultUICommandHandlerOptions,
} from "./defaultUICommandHandlers";
export type { UITasksProviderProps } from "./UITasksProvider";
export type { UICommandHandler } from "./useUICommandHandler";
export type { UseUISnapshotOptions } from "./useUISnapshot";
