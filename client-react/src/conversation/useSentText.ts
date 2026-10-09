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
import { useCallback, useEffect, useRef } from "react";

import { usePipecatClient } from "../usePipecatClient";
import { useRTVIClientEvent } from "../useRTVIClientEvent";
import { addSentText, setSentTextStatus } from "./conversationActions";
import { botAcknowledgesSentTextAtom } from "./conversationAtoms";

/** How long (ms) the bot has to acknowledge sent text before it is marked failed. */
const SENT_TEXT_ACK_TIMEOUT_MS = 10_000;

/**
 * Internal hook behind the conversation's `sendText()`. It sends text to the
 * bot, adds it to the conversation as a user message, and follows whether the
 * bot received it through the message's `status`.
 */
export function useSentText() {
  const client = usePipecatClient();
  // One per message awaiting the bot's acknowledgment, keyed by msgId.
  const ackTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearAckTimeouts = useCallback(() => {
    ackTimeouts.current.forEach((timeout) => clearTimeout(timeout));
    ackTimeouts.current.clear();
  }, []);

  useEffect(() => clearAckTimeouts, [clearAckTimeouts]);

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

        addSentText(get, set, text, { msgId, status: "sent" });
        if (get(botAcknowledgesSentTextAtom)) {
          ackTimeouts.current.set(
            msgId,
            setTimeout(() => {
              ackTimeouts.current.delete(msgId);
              setSentTextStatus(get, set, "failed", [msgId]);
            }, SENT_TEXT_ACK_TIMEOUT_MS)
          );
        }
        return msgId;
      },
      [client]
    )
  );

  useRTVIClientEvent(
    RTVIEvent.UserInput,
    useAtomCallback(
      useCallback((get, set, data: UserInputData) => {
        if (data.input_type !== "chat" || !data.msg_id) return;
        // Text sent with client.sendText() directly is acknowledged too, but
        // no message here has its id, so nothing changes.
        clearTimeout(ackTimeouts.current.get(data.msg_id));
        ackTimeouts.current.delete(data.msg_id);
        setSentTextStatus(get, set, "received", [data.msg_id]);
      }, [])
    )
  );

  useRTVIClientEvent(
    RTVIEvent.Connected,
    useCallback(() => {
      clearAckTimeouts();
    }, [clearAckTimeouts])
  );

  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useAtomCallback(
      useCallback(
        (get, set) => {
          const awaitingAck = [...ackTimeouts.current.keys()];
          clearAckTimeouts();
          setSentTextStatus(get, set, "failed", awaitingAck);
        },
        [clearAckTimeouts]
      )
    )
  );

  return sendText;
}
