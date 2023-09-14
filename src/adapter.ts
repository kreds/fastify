import { parse, serialize } from 'cookie';
import { FastifyReply, FastifyRequest } from 'fastify';

import {
  KredsHttpCookieOptions,
  KredsHttpAuthorization,
  KredsHttpAdapter,
} from '@kreds/types';

export class KredsHttpAdapterFastify implements KredsHttpAdapter {
  private _authorizationResult: KredsHttpAuthorization | undefined = undefined;
  private _cookies: Record<string, string> = {};

  constructor(private request: FastifyRequest, private reply: FastifyReply) {
    if (typeof request.headers.cookie === 'string') {
      this._cookies = parse(request.headers.cookie);
    }
  }

  private addSetCookie(data: string) {
    const header = this.reply.getHeader('Set-Cookie');

    if (!header || typeof header === 'number') {
      this.reply.header('Set-Cookie', data);
      return;
    }

    const array = typeof header === 'string' ? [header] : header;
    array.push(data);
    this.reply.removeHeader('Set-Cookie');
    this.reply.header('Set-Cookie', array);
  }

  getCookie(name: string): string | undefined {
    return this._cookies[name];
  }

  setCookie(
    name: string,
    value: string,
    options?: KredsHttpCookieOptions
  ): void {
    const serialized = serialize(name, value, {
      expires: options?.expiresAt,
      httpOnly: options?.httpOnly,
      sameSite: options?.sameSite,
      secure: options?.secure,
    });
    this.addSetCookie(serialized);
  }

  clearCookie(name: string) {
    const serialized = serialize(name, '', {
      expires: new Date(1),
    });
    this.addSetCookie(serialized);
  }

  getRequestHeader(name: string): string | string[] | undefined {
    return this.request.headers[name];
  }

  setResponseHeader(name: string, value: string | string[] | undefined): void {
    this.reply.header(
      name,
      typeof value === 'string' ? encodeURI(value) : value
    );
  }

  getAuthorization(): KredsHttpAuthorization | undefined {
    const value = this.request.headers.authorization;
    if (typeof value !== 'string') {
      return undefined;
    }

    const split = value.split(' ');
    if (split.length === 0) {
      return undefined;
    } else if (split.length === 1) {
      return {
        type: split[0],
        credentials: undefined,
      };
    }

    const type = split.shift()!;
    const credentials = split.join(' ');
    return {
      type,
      credentials,
    };
  }
}
