import { Client, RTVIMessage } from "..";

export type RTVIClientHelpers = Partial<Record<string, RTVIClientHelper>>;

export type RTVIClientHelperCallbacks = Partial<object>;

export interface RTVIClientHelperOptions {
  /**
   * Callback methods for events / messages
   */
  callbacks?: RTVIClientHelperCallbacks;
}

export abstract class RTVIClientHelper {
  protected _options: RTVIClientHelperOptions;
  protected declare _client: Client;
  protected declare _service: string;

  constructor(options: RTVIClientHelperOptions) {
    this._options = options;
  }

  public abstract handleMessage(ev: RTVIMessage): void;
  public abstract getMessageTypes(): string[];
  public set client(client: Client) {
    this._client = client;
  }
  public set service(service: string) {
    this._service = service;
  }
}
