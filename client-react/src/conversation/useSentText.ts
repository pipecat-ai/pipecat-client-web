/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import {
  RTVIEvent,
  type SendTextOptions,
  type UserInputData,
} from "@pipecat-ai/client-js";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";

import { usePipecatClient } from "../usePipecatClient";
import { useRTVIClientEvent } from "../useRTVIClientEvent";
import { addSentText, setSentTextStatus } from "./conversationActions";

/**
 * Internal hook behind the conversation's `sendText()`. It sends text to the
 * bot, adds it to the conversation as a user message, and follows whether the
 * bot received it through the message's `status`.
 *
 * @param finalizeLastAssistantMessageIfPending Ends the bot's turn once the
 *   text is sent. Text produces no UserStartedSpeaking, so without it the
 *   bot's reply is added to the turn the text interrupted.
 */
export function useSentText(finalizeLastAssistantMessageIfPending: () => void) {
  const client = usePipecatClient();

  const sendText = useAtomCallback(
    useCallback(
      async (get, set, text: string, options?: SendTextOptions) => {
        if (!client) {
          throw new Error("sendText() requires a PipecatClientProvider client");
        }

        let msgId: string;
        try {
          msgId = await client.sendText(text, options);
        } catch (error) {
          addSentText(get, set, text, { status: "failed" });
          throw error;
        }

        // Text the bot never got leaves its turn open.
        finalizeLastAssistantMessageIfPending();
        addSentText(get, set, text, { msgId, status: "sent" });
        return msgId;
      },
      [client, finalizeLastAssistantMessageIfPending]
    )
  );

  useRTVIClientEvent(
    RTVIEvent.UserInput,
    useAtomCallback(
      useCallback((get, set, data: UserInputData) => {
        if (data.input_type !== "chat" || !data.msg_id) return;
        // Text sent with client.sendText() directly is acknowledged too, but
        // no message here has its id, so nothing changes.
        setSentTextStatus(get, set, "received", [data.msg_id]);
      }, [])
    )
  );

  return sendText;
}
