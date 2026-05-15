import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Socket, createConnection } from 'node:net';
import { TLSSocket, connect as createTlsConnection } from 'node:tls';

type RedisSocket = Socket | TLSSocket;
type RedisValue = string | number | null | RedisValue[];

interface ParsedRedisValue {
  value: RedisValue;
  offset: number;
}

@Injectable()
export class RedisClientService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisClientService.name);
  private readonly redisUrl = process.env.REDIS_URL;
  private readonly commandTimeoutMs = Number(process.env.REDIS_COMMAND_TIMEOUT_MS) || 1000;
  private socket: RedisSocket | null = null;
  private connectPromise: Promise<RedisSocket> | null = null;
  private commandQueue: Promise<unknown> = Promise.resolve();

  isEnabled(): boolean {
    return Boolean(this.redisUrl);
  }

  async get(key: string): Promise<string | null> {
    const value = await this.command('GET', key);
    return typeof value === 'string' ? value : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command('SET', key, value, 'EX', Math.max(1, ttlSeconds));
  }

  async del(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    const deleted = await this.command('DEL', ...keys);
    return typeof deleted === 'number' ? deleted : 0;
  }

  async incr(key: string): Promise<number> {
    const value = await this.command('INCR', key);
    return typeof value === 'number' ? value : 0;
  }

  async pexpire(key: string, ttlMilliseconds: number): Promise<void> {
    await this.command('PEXPIRE', key, Math.max(1, ttlMilliseconds));
  }

  async pttl(key: string): Promise<number> {
    const value = await this.command('PTTL', key);
    return typeof value === 'number' ? value : -1;
  }

  async scanKeys(pattern: string, count = 100): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const reply = await this.command('SCAN', cursor, 'MATCH', pattern, 'COUNT', count);
      if (!Array.isArray(reply) || typeof reply[0] !== 'string' || !Array.isArray(reply[1])) {
        break;
      }

      cursor = reply[0];
      keys.push(...reply[1].filter((key): key is string => typeof key === 'string'));
    } while (cursor !== '0');

    return keys;
  }

  async command(command: string, ...args: Array<string | number>): Promise<RedisValue> {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL is not configured.');
    }

    const operation = this.commandQueue.then(() => this.executeCommand(command, args));
    this.commandQueue = operation.catch(() => undefined);
    return operation;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.socket) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.socket?.once('close', () => resolve());
      this.socket?.end();
      setTimeout(resolve, 100).unref();
    });
    this.socket = null;
  }

  private async executeCommand(command: string, args: Array<string | number>): Promise<RedisValue> {
    const socket = await this.getSocket();
    const payload = this.serializeCommand(command, args);

    return new Promise<RedisValue>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const timeout = setTimeout(() => {
        cleanup();
        this.closeSocket();
        reject(new Error(`Redis command ${command} timed out.`));
      }, this.commandTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);
      };

      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        let parsed: ParsedRedisValue | null;
        try {
          parsed = this.parseResponse(buffer);
        } catch (error) {
          cleanup();
          reject(error as Error);
          return;
        }

        if (!parsed) {
          return;
        }

        cleanup();
        resolve(parsed.value);
      };

      const onError = (error: Error) => {
        cleanup();
        this.closeSocket();
        reject(error);
      };

      const onClose = () => {
        cleanup();
        this.socket = null;
        reject(new Error('Redis connection closed.'));
      };

      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.write(payload);
    });
  }

  private async getSocket(): Promise<RedisSocket> {
    if (this.socket && !this.socket.destroyed) {
      return this.socket;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.connect();
    }

    try {
      this.socket = await this.connectPromise;
      return this.socket;
    } finally {
      this.connectPromise = null;
    }
  }

  private async connect(): Promise<RedisSocket> {
    const url = new URL(this.redisUrl as string);
    const port = Number(url.port) || 6379;
    const host = url.hostname || 'localhost';
    const socket =
      url.protocol === 'rediss:'
        ? createTlsConnection({ host, port })
        : createConnection({ host, port });

    socket.setNoDelay(true);
    socket.on('error', (error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
      this.closeSocket();
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        socket.destroy();
        reject(new Error('Redis connection timed out.'));
      }, this.commandTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('connect', onConnect);
        socket.off('secureConnect', onConnect);
        socket.off('error', onError);
      };

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      socket.once(url.protocol === 'rediss:' ? 'secureConnect' : 'connect', onConnect);
      socket.once('error', onError);
    });

    if (url.password) {
      const authArgs = url.username
        ? [decodeURIComponent(url.username), decodeURIComponent(url.password)]
        : [decodeURIComponent(url.password)];
      await this.executeAuthenticatedCommand(socket, 'AUTH', ...authArgs);
    }

    if (url.pathname && url.pathname !== '/') {
      await this.executeAuthenticatedCommand(socket, 'SELECT', url.pathname.slice(1));
    }

    return socket;
  }

  private async executeAuthenticatedCommand(
    socket: RedisSocket,
    command: string,
    ...args: Array<string | number>
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Redis ${command} timed out.`));
      }, this.commandTimeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('data', onData);
        socket.off('error', onError);
      };

      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        let parsed: ParsedRedisValue | null;
        try {
          parsed = this.parseResponse(buffer);
        } catch (error) {
          cleanup();
          reject(error as Error);
          return;
        }

        if (!parsed) {
          return;
        }

        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      socket.on('data', onData);
      socket.once('error', onError);
      socket.write(this.serializeCommand(command, args));
    });
  }

  private closeSocket(): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.socket = null;
    this.connectPromise = null;
  }

  private serializeCommand(command: string, args: Array<string | number>): string {
    const parts = [command, ...args.map(String)];
    return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
  }

  private parseResponse(buffer: Buffer, offset = 0): ParsedRedisValue | null {
    if (offset >= buffer.length) {
      return null;
    }

    const prefix = String.fromCharCode(buffer[offset]);
    const lineEnd = buffer.indexOf('\r\n', offset);
    if (lineEnd === -1) {
      return null;
    }

    const line = buffer.subarray(offset + 1, lineEnd).toString();
    const nextOffset = lineEnd + 2;

    if (prefix === '+') {
      return { value: line, offset: nextOffset };
    }

    if (prefix === '-') {
      throw new Error(`Redis error: ${line}`);
    }

    if (prefix === ':') {
      return { value: Number(line), offset: nextOffset };
    }

    if (prefix === '$') {
      const length = Number(line);
      if (length === -1) {
        return { value: null, offset: nextOffset };
      }

      const valueEnd = nextOffset + length;
      if (buffer.length < valueEnd + 2) {
        return null;
      }

      return {
        value: buffer.subarray(nextOffset, valueEnd).toString(),
        offset: valueEnd + 2,
      };
    }

    if (prefix === '*') {
      const count = Number(line);
      if (count === -1) {
        return { value: null, offset: nextOffset };
      }

      const values: RedisValue[] = [];
      let currentOffset = nextOffset;
      for (let index = 0; index < count; index += 1) {
        const parsed = this.parseResponse(buffer, currentOffset);
        if (!parsed) {
          return null;
        }
        values.push(parsed.value);
        currentOffset = parsed.offset;
      }

      return { value: values, offset: currentOffset };
    }

    throw new Error(`Unsupported Redis response prefix: ${prefix}`);
  }
}
