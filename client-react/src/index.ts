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
import { usePipecatClient } from "./usePipecatClient";
import { usePipecatClientCamControl } from "./usePipecatClientCamControl";
import { usePipecatClientMediaDevices } from "./usePipecatClientMediaDevices";
import { usePipecatClientMediaTrack } from "./usePipecatClientMediaTrack";
import { usePipecatClientMicControl } from "./usePipecatClientMicControl";
import { usePipecatClientScreenShareControl } from "./usePipecatClientScreenShareControl";
import { usePipecatClientTransportState } from "./usePipecatClientTransportState";
import { usePipecatConversation } from "./usePipecatConversation";
import { useRTVIClientEvent } from "./useRTVIClientEvent";
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
  // Conversation
  useConversationContext,
  usePipecatClient,
  usePipecatClientCamControl,
  usePipecatClientMediaDevices,
  usePipecatClientMediaTrack,
  usePipecatClientMicControl,
  usePipecatClientScreenShareControl,
  usePipecatClientTransportState,
  usePipecatConversation,
  useRTVIClientEvent,
  VoiceVisualizer,
};

// Conversation types
export type {
  AggregationMetadata,
  BotOutputFilter,
  BotOutputText,
  ConversationMessage,
  ConversationMessagePart,
  FunctionCallData,
  FunctionCallRenderer,
} from "./conversation/types";
