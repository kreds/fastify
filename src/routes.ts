import {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import fp from 'fastify-plugin';
import createError from 'http-errors';
import { FromSchema } from 'json-schema-to-ts';

import { Kreds } from '@kreds/server';
import {
  KredsResult,
  KredsStrategiesResult,
  KredsUserResult,
  KredsContext,
  KredsContextHttp,
} from '@kreds/types';
import { KredsHttpAdapterFastify } from './adapter.js';
import { UserPredicate } from './types.js';

const nameParamSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
  },
  required: ['name'],
} as const;

const unauthenticateBodySchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      payload: {},
    },
    required: ['name'],
  },
} as const;

interface FastifyKredsRoutesOptions<TUser> {
  kreds: Kreds<TUser>;
  isUserEnabled?: boolean;
}

interface FastifyKredsUserOptions<TUser> {
  kreds: Kreds<TUser>;
  strategyName?: string;
}

function contextFromRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: Omit<KredsContextHttp, 'transport' | 'adapter'>,
): KredsContextHttp {
  return {
    transport: 'http',
    adapter: new KredsHttpAdapterFastify(request, reply),
    ...options,
  };
}

async function userFromRequest<TUser>(
  kreds: Kreds<TUser>,
  context: KredsContext,
): Promise<TUser | undefined> {
  const outcome = await kreds.authenticate(context);
  return outcome?.user;
}

export const fastifyKredsUser: FastifyPluginCallback<
  FastifyKredsUserOptions<any>
> = fp(
  async (
    fastify: FastifyInstance,
    options: FastifyKredsUserOptions<any>,
  ): Promise<void> => {
    const { kreds, strategyName } = options;

    fastify.decorateRequest('user', null);
    fastify.decorate('expect', {
      toBeAuthenticated: () => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
          if (!request.user) {
            throw createError(403, 'Unauthorized');
          }
        };
      },
      toMatch: (predicate: UserPredicate) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
          if (!request.user || !(await predicate(request.user))) {
            throw createError(403, 'Unauthorized');
          }
        };
      },
    });

    fastify.addHook('onRequest', async (request, reply) => {
      request.user = await userFromRequest(
        kreds,
        contextFromRequest(request, reply, { strategyName }),
      );
    });
  },
  {
    name: 'fastify-kreds-user',
  },
);

export const fastifyKredsRoutes: FastifyPluginCallback<
  FastifyKredsRoutesOptions<any>
> = fp(
  async (
    fastify: FastifyInstance,
    options: FastifyKredsRoutesOptions<any>,
  ): Promise<void> => {
    const { kreds } = options;

    fastify.setErrorHandler((error, request, reply) => {
      console.trace(error);
      if (error instanceof Error) {
        return kreds.errorResult(error.message);
      } else {
        reply.send(error);
      }
    });

    fastify.get<{
      Reply: KredsUserResult;
    }>('/user', async request => {
      return {
        ok: true,
        user: kreds.displayUser
          ? await kreds.displayUser(request.user)
          : request.user,
      };
    });

    fastify.get<{ Reply: KredsStrategiesResult }>('/strategies', () => {
      return kreds.strategiesResult();
    });

    fastify.get<{ Params: FromSchema<typeof nameParamSchema> }>(
      '/callback/:name',
      { schema: { params: nameParamSchema } },
      (request, reply) => {
        reply.redirect(
          kreds.buildCallbackUrl(request.params.name, request.query),
        );
      },
    );

    fastify.post<{
      Params: FromSchema<typeof nameParamSchema>;
      Reply: KredsResult;
    }>(
      '/authenticate/:name',
      { schema: { params: nameParamSchema } },
      async (request, reply) => {
        const context = contextFromRequest(request, reply, {
          strategyName: request.params.name,
          payload: request.body,
        });

        const outcome = await kreds.authenticate(context);

        if (!outcome) {
          return {
            ok: false,
            done: false,
          };
        }

        const { done, action, state, refreshStrategy } = outcome;

        if (done) {
          return {
            ok: true,
            done: true,
            authorization: context.authorization,
            refreshStrategy,
          };
        } else {
          return {
            ok: true,
            done: false,
            action,
            state,
          };
        }
      },
    );

    fastify.post<{
      Body: FromSchema<typeof unauthenticateBodySchema>;
      Reply: KredsResult;
    }>(
      '/unauthenticate',
      { schema: { body: unauthenticateBodySchema } },
      async (request, reply) => {
        await Promise.all(
          request.body.map(({ name, payload }) =>
            kreds.unauthenticate(name, payload),
          ),
        );

        return {
          ok: true,
          done: true,
        };
      },
    );
  },
  {
    name: 'fastify-kreds',
    dependencies: ['fastify-kreds-user'],
    encapsulate: true,
  },
);
