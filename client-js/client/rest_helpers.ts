import { logger } from "./logger";

type Serializable =
  | string
  | number
  | boolean
  | null
  | Serializable[]
  | { [key: number | string]: Serializable };

export interface APIRequest {
  endpoint: string | URL | globalThis.Request;
  headers?: Headers;
  requestData?: Serializable;
  timeout?: number;
}

/**
 * @deprecated Use APIRequest instead
 */
export type ConnectionEndpoint = APIRequest;

export function isAPIRequest(value: unknown): boolean {
  if (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).includes("endpoint")
  ) {
    const endpoint = (value as APIRequest)["endpoint"];
    return (
      typeof endpoint === "string" ||
      endpoint instanceof URL ||
      (typeof Request !== "undefined" && endpoint instanceof Request)
    );
  }
  return false;
}

export async function makeRequest(
  cxnOpts: APIRequest,
  abortController?: AbortController
): Promise<unknown> {
  if (!abortController) {
    abortController = new AbortController();
  }
  let handshakeTimeout: ReturnType<typeof setTimeout> | undefined;

  return new Promise((resolve, reject) => {
    (async () => {
      if (cxnOpts.timeout) {
        handshakeTimeout = setTimeout(async () => {
          abortController.abort();
          reject(new Error("Timed out"));
        }, cxnOpts.timeout);
      }

      let request: globalThis.Request;
      if (
        typeof Request !== "undefined" &&
        cxnOpts.endpoint instanceof Request
      ) {
        request = new Request(cxnOpts.endpoint, {
          signal: abortController.signal,
        });
        if (cxnOpts.requestData) {
          logger.warn(
            "[Pipecat Client] requestData in APIRequest is ignored when endpoint is a Request object"
          );
        }
        if (cxnOpts.headers) {
          logger.warn(
            "[Pipecat Client] headers in APIRequest is ignored when endpoint is a Request object"
          );
        }
      } else {
        request = new Request(cxnOpts.endpoint, {
          method: "POST",
          mode: "cors",
          headers: new Headers({
            "Content-Type": "application/json",
            ...Object.fromEntries((cxnOpts.headers ?? new Headers()).entries()),
          }),
          body: JSON.stringify(cxnOpts.requestData),
          signal: abortController?.signal,
        });
      }
      logger.debug(`[Pipecat Client] Fetching from ${request.url}`);
      fetch(request)
        .then((res) => {
          logger.debug(
            `[Pipecat Client] Received response from ${request.url}`,
            res
          );
          if (!res.ok) {
            throw new Error(`Got ${res.status} response (${res.statusText})`);
          }
          res.json().then((data) => resolve(data));
        })
        .catch((err) => {
          logger.error(`[Pipecat Client] Error fetching: ${err}`);
          reject(err);
        })
        .finally(() => {
          if (handshakeTimeout) {
            clearTimeout(handshakeTimeout);
          }
        });
    })();
  });
}
