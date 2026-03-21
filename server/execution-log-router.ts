import { router, publicProcedure } from './_core/trpc';
import { z } from 'zod';
import * as executionLogService from './paperclip-services/execution-log-service';

export const executionLogRouter = router({
  list: publicProcedure
    .input(z.object({
      scheduleId: z.number().optional(),
      agentId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0)
    }))
    .query(async ({ input }) => {
      return await executionLogService.listExecutionLogs(input);
    }),

  get: publicProcedure
    .input(z.object({
      logId: z.number()
    }))
    .query(async ({ input }) => {
      return await executionLogService.getExecutionLog(input.logId);
    }),

  stats: publicProcedure
    .input(z.object({
      scheduleId: z.number()
    }))
    .query(async ({ input }) => {
      return await executionLogService.getExecutionStats(input.scheduleId);
    }),

  create: publicProcedure
    .input(z.object({
      scheduleId: z.number(),
      agentId: z.number(),
      runnerId: z.number().optional(),
      status: z.enum(['pending', 'running', 'success', 'failed', 'timeout'])
    }))
    .mutation(async ({ input }) => {
      return await executionLogService.createExecutionLog(input);
    }),

  update: publicProcedure
    .input(z.object({
      logId: z.number(),
      status: z.enum(['pending', 'running', 'success', 'failed', 'timeout']).optional(),
      finishedAt: z.date().optional(),
      duration: z.number().optional(),
      output: z.string().optional(),
      errorMessage: z.string().optional(),
      retryCount: z.number().optional()
    }))
    .mutation(async ({ input }) => {
      return await executionLogService.updateExecutionLog(input);
    })
});