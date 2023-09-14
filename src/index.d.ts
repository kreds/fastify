import 'fastify';

import { FastifyPreHandler, UserPredicate } from './types.js';

declare module 'fastify' {
  interface FastifyInstance {
    expect?: {
      // property(propertyKey: string): {
      //   toBe(value: any): FastifyPreHandler;
      //   toEqual(value: any): FastifyPreHandler;
      //   toBeNull(): FastifyPreHandler;
      //   toBeTruthy(): FastifyPreHandler;
      //   toBeFalsy(): FastifyPreHandler;
      //   array(): {
      //     toContain(value: any): FastifyPreHandler;
      //   }
      // };
      toBeAuthenticated(): FastifyPreHandler;
      toMatch(predicate: UserPredicate): FastifyPreHandler;
    };
  }

  interface FastifyRequest {
    user?: any;
  }
}
