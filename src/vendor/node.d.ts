/**
 * node.d.ts — minimal type declarations for Node.js built-ins used in this project.
 * Vendored to avoid @types/node dependency.
 */

// ── Globals ───────────────────────────────────────────────────────────────────

interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

declare function fetch(url: string, init?: Record<string, unknown>): Promise<FetchResponse>;

// biome-ignore lint/complexity/noStaticOnlyClass: ambient declaration for Web API
declare class AbortSignal {
  static timeout(ms: number): AbortSignal;
}

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

declare function setTimeout(handler: () => void, timeout?: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(handler: () => void, timeout?: number): unknown;
declare function clearInterval(id: unknown): void;

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
};

declare class Buffer {
  static concat(buffers: Buffer[]): Buffer;
  static from(data: string, encoding?: string): Buffer;
  static from(data: Buffer | ArrayBuffer): Buffer;
  toString(encoding?: string): string;
  length: number;
}

declare namespace NodeJS {
  interface ReadableStream {
    on(event: 'data', listener: (chunk: Buffer) => void): this;
  }
}

interface ImportMeta {
  url: string;
}

// ── node:module ───────────────────────────────────────────────────────────────

declare module 'node:module' {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic require returns unknown types
  function createRequire(url: string): (id: string) => any;
  export { createRequire };
}

// ── node:sqlite ───────────────────────────────────────────────────────────────

declare module 'node:sqlite' {
  export interface StatementResultingChanges {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): StatementResultingChanges;
    iterate(...params: unknown[]): Iterator<Record<string, unknown>>;
    setReadBigInts(enabled: boolean): void;
    expandedSQL: string;
    sourceSQL: string;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    open(): void;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    function(name: string, fn: (...args: unknown[]) => unknown): void;
    loadExtension(path: string, entryPoint?: string): void;
    isOpen: boolean;
    isInTransaction: boolean;
  }
}

// ── node:child_process ────────────────────────────────────────────────────────

declare module 'node:child_process' {
  interface ChildProcess {
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    on(event: 'close', listener: (code: number | null) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  function spawn(command: string, args?: string[]): ChildProcess;

  export { spawn, ChildProcess };
}

// ── node:crypto ───────────────────────────────────────────────────────────────

declare module 'node:crypto' {
  function randomBytes(size: number): Buffer;
  function timingSafeEqual(a: Buffer, b: Buffer): boolean;
  function scrypt(
    password: string,
    salt: Buffer,
    keylen: number,
    callback: (err: Error | null, derivedKey: Buffer) => void,
  ): void;

  export { randomBytes, timingSafeEqual, scrypt };
}

// ── node:fs ───────────────────────────────────────────────────────────────────

declare module 'node:fs' {
  function existsSync(path: string): boolean;
  function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  function unlinkSync(path: string): void;
  function statSync(path: string): { size: number; atimeMs: number; mtimeMs: number };
  function writeFileSync(path: string, data: string | Buffer): void;
  function readdirSync(path: string): string[];
  function renameSync(oldPath: string, newPath: string): void;
  function createWriteStream(path: string): NodeJS.ReadableStream;
  function readFileSync(path: string, encoding: 'utf8'): string;
  function readFileSync(path: string): Buffer;

  export {
    existsSync,
    mkdirSync,
    unlinkSync,
    statSync,
    writeFileSync,
    readdirSync,
    renameSync,
    createWriteStream,
    readFileSync,
  };
}

// ── node:fs/promises ──────────────────────────────────────────────────────────

declare module 'node:fs/promises' {
  function writeFile(path: string, data: string | Buffer | Uint8Array): Promise<void>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  function unlink(path: string): Promise<void>;
  function stat(path: string): Promise<{ size: number; atimeMs: number }>;
  function readdir(path: string): Promise<string[]>;
  function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  export { writeFile, readFile, unlink, stat, readdir, mkdir };
}

// ── node:http ─────────────────────────────────────────────────────────────────

declare module 'node:http' {
  interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: { remoteAddress?: string };
    destroy(err?: Error): void;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  interface ServerResponse {
    headersSent: boolean;
    statusCode: number;
    setHeader(name: string, value: string | number): void;
    getHeader(name: string): string | number | string[] | undefined;
    writeHead(statusCode: number, headers?: Record<string, string | number>): void;
    write(chunk: string | Buffer): void;
    end(chunk?: string | Buffer): void;
  }

  interface Server {
    listen(port: number, host: string, callback?: () => void): void;
    close(): void;
  }

  function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;

  export { createServer, IncomingMessage, ServerResponse, Server };
}

// ── node:path ─────────────────────────────────────────────────────────────────

declare module 'node:path' {
  function join(...paths: string[]): string;
  function basename(path: string, ext?: string): string;
  function extname(path: string): string;
  function dirname(path: string): string;
  function resolve(...paths: string[]): string;

  export { join, basename, extname, dirname, resolve };
}

// ── node:stream ───────────────────────────────────────────────────────────────

declare module 'node:stream' {
  interface Readable {
    pipe<T extends Writable>(destination: T): T;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  interface Writable {
    write(chunk: string | Buffer): boolean;
    end(chunk?: string | Buffer): void;
    on(event: 'finish', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  export { Readable, Writable };
}
