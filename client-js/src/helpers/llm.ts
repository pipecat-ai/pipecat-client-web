/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

import * as RTVIErrors from "./../errors";
import { RTVIEvent } from "./../events";
import {
  RTVIActionRequestData,
  RTVIActionResponse,
  RTVIMessage,
} from "./../messages";
import { RTVIClientHelper, RTVIClientHelperOptions } from ".";

// --- Types

export type LLMFunctionCallData = {
  function_name: string;
  tool_call_id: string;
  arguments: unknown;
  result?: unknown;
};

export type LLMContextMessage = {
  role: string;
  content: unknown;
};

export type LLMContext = Partial<{
  messages?: LLMContextMessage[];
  tools?: [];
}>;

export type FunctionCallParams = {
  functionName: string;
  arguments: unknown;
};

export type FunctionCallCallback = (fn: FunctionCallParams) => Promise<unknown>;

// --- Message types
export enum LLMMessageType {
  LLM_FUNCTION_CALL = "llm-function-call",
  LLM_FUNCTION_CALL_START = "llm-function-call-start",
  LLM_FUNCTION_CALL_RESULT = "llm-function-call-result",
  LLM_JSON_COMPLETION = "llm-json-completion",
}

export enum LLMActionType {
  APPEND_TO_MESSAGES = "append_to_messages",
  GET_CONTEXT = "get_context",
  SET_CONTEXT = "set_context",
  RUN = "run",
}

// --- Callbacks
export type LLMHelperCallbacks = Partial<{
  onLLMJsonCompletion: (jsonString: string) => void;
  onLLMFunctionCall: (func: LLMFunctionCallData) => void;
  onLLMFunctionCallStart: (functionName: string) => void;
  onLLMMessage: (message: LLMContextMessage) => void;
}>;

// --- Interface and class
export interface LLMHelperOptions extends RTVIClientHelperOptions {
  callbacks?: LLMHelperCallbacks;
}

export class LLMHelper extends RTVIClientHelper {
  protected declare _options: LLMHelperOptions;
  private _functionCallCallback: FunctionCallCallback | null;

  constructor(options: LLMHelperOptions) {
    super(options);

    this._functionCallCallback = null;
  }

  public getMessageTypes(): string[] {
    return Object.values(LLMMessageType) as string[];
  }

  // --- Actions

  /**
   * Retrieve the bot's current LLM context.
   * @returns Promise<LLMContext>
   */
  public async getContext(): Promise<LLMContext> {
    if (this._client.state !== "ready") {
      throw new RTVIErrors.BotNotReadyError(
        "getContext called while transport not in ready state"
      );
    }
    const actionResponseMsg: RTVIActionResponse = await this._client.action({
      service: this._service,
      action: LLMActionType.GET_CONTEXT,
    } as RTVIActionRequestData);
    return actionResponseMsg.data.result as LLMContext;
  }

  /**
   * Update the bot's LLM context.
   * If this is called while the transport is not in the ready state, the local context will be updated
   * @param context LLMContext - The new context
   * @param interrupt boolean - Whether to interrupt the bot, or wait until it has finished speaking
   * @returns Promise<boolean>
   */

  public async setContext(
    context: LLMContext,
    interrupt: boolean = false
  ): Promise<boolean> {
    if (this._client.state !== "ready") {
      throw new RTVIErrors.BotNotReadyError(
        "setContext called while transport not in ready state"
      );
    }

    const actionResponse: RTVIActionResponse = (await this._client.action({
      service: this._service,
      action: LLMActionType.SET_CONTEXT,
      arguments: [
        {
          name: "messages",
          value: context.messages,
        },
        {
          name: "interrupt",
          value: interrupt,
        },
      ],
    } as RTVIActionRequestData)) as RTVIActionResponse;

    return !!actionResponse.data.result;
  }

  /**
   * Append a new message to the LLM context.
   * If this is called while the transport is not in the ready state, the local context will be updated
   * @param context LLMContextMessage
   * @param runImmediately boolean - wait until pipeline is idle before running
   * @returns boolean
   */

  public async appendToMessages(
    message: LLMContextMessage,
    runImmediately: boolean = false
  ): Promise<boolean> {
    if (this._client.state !== "ready") {
      throw new RTVIErrors.BotNotReadyError(
        "setContext called while transport not in ready state"
      );
    }

    const actionResponse = (await this._client.action({
      service: this._service,
      action: LLMActionType.APPEND_TO_MESSAGES,
      arguments: [
        {
          name: "messages",
          value: [message],
        },
        {
          name: "run_immediately",
          value: runImmediately,
        },
      ],
    } as RTVIActionRequestData)) as RTVIActionResponse;
    return !!actionResponse.data.result;
  }

  /**
   * Run the bot's current LLM context.
   * Useful when appending messages to the context without runImmediately set to true.
   * Will do nothing if the bot is not in the ready state.
   * @param interrupt boolean - Whether to interrupt the bot, or wait until it has finished speaking
   * @returns Promise<unknown>
   */
  public async run(interrupt: boolean = false): Promise<unknown> {
    if (this._client.state !== "ready") {
      return;
    }

    return this._client.action({
      service: this._service,
      action: LLMActionType.RUN,
      arguments: [
        {
          name: "interrupt",
          value: interrupt,
        },
      ],
    } as RTVIActionRequestData);
  }

  // --- Handlers

  /**
   * If the LLM wants to call a function, RTVI will invoke the callback defined
   * here. Whatever the callback returns will be sent to the LLM as the function result.
   * @param callback
   * @returns void
   */
  public handleFunctionCall(callback: FunctionCallCallback): void {
    this._functionCallCallback = callback;
  }

  public handleMessage(ev: RTVIMessage): void {
    switch (ev.type) {
      case LLMMessageType.LLM_JSON_COMPLETION:
        this._options.callbacks?.onLLMJsonCompletion?.(ev.data as string);
        this._client.emit(RTVIEvent.LLMJsonCompletion, ev.data as string);
        break;
      case LLMMessageType.LLM_FUNCTION_CALL: {
        const d = ev.data as LLMFunctionCallData;
        this._options.callbacks?.onLLMFunctionCall?.(
          ev.data as LLMFunctionCallData
        );
        this._client.emit(
          RTVIEvent.LLMFunctionCall,
          ev.data as LLMFunctionCallData
        );
        if (this._functionCallCallback) {
          const fn = {
            functionName: d.function_name,
            arguments: d.arguments,
          };
          if (this._client.state === "ready") {
            this._functionCallCallback(fn).then((result) => {
              this._client.sendMessage(
                new RTVIMessage(LLMMessageType.LLM_FUNCTION_CALL_RESULT, {
                  function_name: d.function_name,
                  tool_call_id: d.tool_call_id,
                  arguments: d.arguments,
                  result,
                })
              );
            });
          } else {
            throw new RTVIErrors.BotNotReadyError(
              "Attempted to send a function call result from bot while transport not in ready state"
            );
          }
        }
        break;
      }
      case LLMMessageType.LLM_FUNCTION_CALL_START: {
        const e = ev.data as LLMFunctionCallData;
        this._options.callbacks?.onLLMFunctionCallStart?.(
          e.function_name as string
        );
        this._client.emit(RTVIEvent.LLMFunctionCallStart, e.function_name);
        break;
      }
    }
  }
}
