import { router, publicProcedure } from './_core/trpc';
import { z } from 'zod';
import * as runnerService from './paperclip-services/runner-service';

export const runnerRouter = router({
  list: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1)
    }))
    .query(async ({ input }) => {
      return await runnerService.listRunners(input.companyId);
    }),

  get: publicProcedure
    .input(z.object({
      runnerId: z.number()
    }))
    .query(async ({ input }) => {
      return await runnerService.getRunner(input.runnerId);
    }),

  create: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1),
      name: z.string(),
      type: z.enum(['local', 'docker', 'kubernetes', 'lambda']),
      config: z.any().optional(),
      capacity: z.number().optional().default(1)
    }))
    .mutation(async ({ input }) => {
      return await runnerService.createRunner(input);
    }),

  update: publicProcedure
    .input(z.object({
      runnerId: z.number(),
      name: z.string().optional(),
      status: z.enum(['online', 'offline', 'busy', 'error']).optional(),
      config: z.any().optional(),
      capacity: z.number().optional(),
      currentLoad: z.number().optional()
    }))
    .mutation(async ({ input }) => {
      return await runnerService.updateRunner(input);
    }),

  delete: publicProcedure
    .input(z.object({
      runnerId: z.number()
    }))
    .mutation(async ({ input }) => {
      await runnerService.deleteRunner(input.runnerId);
      return { success: true };
    }),

  heartbeat: publicProcedure
    .input(z.object({
      runnerId: z.number()
    }))
    .mutation(async ({ input }) => {
      await runnerService.updateRunnerHeartbeat(input.runnerId);
      return { success: true };
    })
});