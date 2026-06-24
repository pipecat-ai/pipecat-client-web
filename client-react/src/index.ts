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
import { UIJobGroupsContext } from "./UIJobGroupsContext";
import { UIJobGroupsProvider } from "./UIJobGroupsProvider";
import { useDTMF } from "./useDTMF";
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
import { useUIJobGroups } from "./useUIJobGroups";
import { useUISnapshot } from "./useUISnapshot";
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
  UIJobGroupsContext,
  UIJobGroupsProvider,
  // Conversation
  useConversationContext,
  useDefaultClickHandler,
  useDefaultFocusHandler,
  useDefaultHighlightHandler,
  useDefaultScrollToHandler,
  useDefaultSelectTextHandler,
  useDefaultSetInputValueHandler,
  useDefaultUICommandHandlers,
  useDTMF,
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
  useUIJobGroups,
  useUISnapshot,
  VoiceVisualizer,
};

// UI job-group types
export type {
  Job,
  JobGroup,
  JobUpdate,
  UIJobGroupsAPI,
} from "./uiJobGroupsTypes";

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
export type { UIJobGroupsProviderProps } from "./UIJobGroupsProvider";
export type { UICommandHandler } from "./useUICommandHandler";
export type { UseUISnapshotOptions } from "./useUISnapshot";
