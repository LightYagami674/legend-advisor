import {
  TypeSafeClient,
  type Questions,
  type RequestOptions,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";

/**
 * Minimal interface for TypeSafe Jev `systemOne` clients, allowing test stubs.
 */
export interface JevClient {
  systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions,
  ): Promise<SystemOneResult<Q>>;
}

export type JevClientLike = JevClient;

let defaultJevClient: TypeSafeClient | null = null;

/**
 * Buffers fetch responses into a plain text-backed Response-like object so
 * `@typesafe-ai/sdk`'s `bufferResponse` does not lock `res.body` in Bun before
 * `res.text()` is called.
 */
const bunSafeFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
    url: res.url,
    redirected: res.redirected,
    type: res.type,
    bodyUsed: false,
    body: null,
    clone() {
      return this;
    },
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
    async arrayBuffer() {
      return new TextEncoder().encode(text).buffer;
    },
  } as unknown as Response;
};

/**
 * Returns the lazily-instantiated singleton `TypeSafeClient` for Jev calls.
 */
export function getDefaultJevClient(): JevClient {
  if (!defaultJevClient) {
    defaultJevClient = new TypeSafeClient({ fetch: bunSafeFetch });
  }
  return defaultJevClient;
}
