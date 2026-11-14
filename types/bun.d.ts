declare module "bun:sqlite" {
  export class Statement<ReturnType = unknown, ParamsType extends unknown[] = unknown[]> {
    all(...params: ParamsType): ReturnType[];
    get(...params: ParamsType): ReturnType | null;
    run(...params: ParamsType): { changes: number; lastInsertRowid: number | bigint };
    values(...params: ParamsType): unknown[][];
    finalize(): void;
  }

  export class Database {
    constructor(
      filename?: string,
      options?:
        | number
        | {
            readonly?: boolean;
            create?: boolean;
            readwrite?: boolean;
            strict?: boolean;
          },
    );
    exec(sql: string): this;
    run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    query<ReturnType = unknown, ParamsType extends unknown[] = unknown[]>(
      sql: string,
    ): Statement<ReturnType, ParamsType>;
    prepare<ReturnType = unknown, ParamsType extends unknown[] = unknown[]>(
      sql: string,
    ): Statement<ReturnType, ParamsType>;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    close(throwOnError?: boolean): void;
  }
}

declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;

  export interface Matchers<T> {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toHaveLength(length: number): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toContain(expected: unknown): void;
    toMatch(expected: string | RegExp): void;
    toThrow(expected?: string | RegExp): void;
    not: Matchers<T>;
  }

  export function expect<T>(actual: T): Matchers<T>;
}
