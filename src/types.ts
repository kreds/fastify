import { FastifyReply, FastifyRequest } from 'fastify';

export type FastifyPreHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;
export type UserPredicate = (user: unknown) => boolean | Promise<boolean>;
