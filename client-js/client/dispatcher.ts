/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import { ClientMessageData, RTVIMessage, RTVIMessageType } from "../rtvi";
import { logger } from "./logger";

interface QueuedRTVIMessage {
  message: RTVIMessage;
  timestamp: number;
  timeout: number;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export class MessageDispatcher {
  protected _sendMethod: (message: RTVIMessage) => void;
  protected _queue = new Array<QueuedRTVIMessage>();
  protected _gcInterval: ReturnType<typeof setInterval> | undefined = undefined;

  constructor(sendMethod: (message: RTVIMessage) => void) {
    this._queue = [];
    this._sendMethod = sendMethod;
  }

  public disconnect() {
    this.clearQueue();
    clearInterval(this._gcInterval);
    this._gcInterval = undefined;
  }

  public dispatch(
    message_data: unknown,
    type = RTVIMessageType.CLIENT_MESSAGE,
    timeout = 10000
  ): Promise<RTVIMessage> {
    if (!this._gcInterval) {
      // start garbage collection if not already running
      this._gcInterval = setInterval(() => {
        this._gc();
      }, 2000); // Run garbage collection every 2 seconds
    }

    const message = new RTVIMessage(type, message_data);
    const promise = new Promise((resolve, reject) => {
      this._queue.push({
        message,
        timestamp: Date.now(),
        timeout,
        resolve,
        reject,
      });
    });

    logger.debug("[MessageDispatcher] dispatch", message);

    try {
      this._sendMethod(message);
    } catch (e) {
      logger.error("[MessageDispatcher] Error sending message", e);
      return Promise.reject(e);
    }

    this._gc();

    return promise as Promise<RTVIMessage>;
  }

  public clearQueue() {
    this._queue = [];
  }

  private _resolveReject(
    message: RTVIMessage,
    resolve: boolean = true
  ): RTVIMessage {
    const queuedMessage = this._queue.find(
      (msg) => msg.message.id === message.id
    );

    if (queuedMessage) {
      if (resolve) {
        logger.debug("[MessageDispatcher] Resolve", message);
        queuedMessage.resolve(message as RTVIMessage);
      } else {
        logger.debug("[MessageDispatcher] Reject", message);
        queuedMessage.reject(message as RTVIMessage);
      }
      // Remove message from queue
      this._queue = this._queue.filter((msg) => msg.message.id !== message.id);
      logger.debug("[MessageDispatcher] Queue", this._queue);
    }

    return message;
  }

  public resolve(message: RTVIMessage): RTVIMessage {
    return this._resolveReject(message, true);
  }

  public reject(message: RTVIMessage): RTVIMessage {
    return this._resolveReject(message, false);
  }

  protected _gc() {
    const expired: QueuedRTVIMessage[] = [];
    this._queue = this._queue.filter((msg) => {
      const isValid = Date.now() - msg.timestamp < msg.timeout;
      if (!isValid) {
        expired.push(msg);
      }
      return isValid;
    });

    expired.forEach((msg) => {
      if (msg.message.type === RTVIMessageType.CLIENT_MESSAGE) {
        msg.reject(
          new RTVIMessage(RTVIMessageType.ERROR_RESPONSE, {
            error: "Timed out waiting for response",
            msgType: (msg.message.data as ClientMessageData).t,
            data: (msg.message.data as ClientMessageData).d,
            fatal: false,
          })
        );
      }
    });
    logger.debug("[MessageDispatcher] GC", this._queue);
  }
}
