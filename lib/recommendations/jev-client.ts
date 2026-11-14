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
 * Returns the lazily-instantiated singleton `TypeSafeClient` for Jev calls.
 */
export function getDefaultJevClient(): JevClient {
  if (!defaultJevClient) {
    defaultJevClient = new TypeSafeClient();
  }
  return defaultJevClient;
}
