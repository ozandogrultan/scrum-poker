import { z } from 'zod';
import { DECK, SCORES } from '../shared/types';

const name = z.string().trim().min(1).max(60);
export const createSchema = z.object({
  name, title: z.string().trim().min(1).max(120),
  stories: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
}).strict();
export const joinSchema = z.object({ name }).strict();
const guard = { roundId: z.uuid(), revision: z.number().int().nonnegative() };
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('vote'), ...guard, estimate: z.enum(DECK) }).strict(),
  z.object({ type: z.literal('reveal'), ...guard }).strict(),
  z.object({ type: z.literal('reset'), ...guard }).strict(),
  z.object({ type: z.literal('finalize'), ...guard, score: z.enum(SCORES) }).strict(),
]);
