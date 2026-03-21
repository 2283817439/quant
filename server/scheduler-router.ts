import { router, publicProcedure } from './_core/trpc';
import { z } from 'zod';
import * as schedulerService from './paperclip-services/scheduler-service';

export const schedulerRouter = router({
  list: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1),
      agentId: z.number().optional()
    }))
    .query(async ({ input }) => {
      return await schedulerService.listSchedules(input);
    }),

  create: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1),
      agentId: z.number(),
      cronExpression: z.string(),
      enabled: z.boolean().optional().default(true)
    }))
    .mutation(async ({ input }) => {
      return await schedulerService.createSchedule(input);
    }),

  toggle: publicProcedure
    .input(z.object({
      scheduleId: z.number(),
      enabled: z.boolean()
    }))
    .mutation(async ({ input }) => {
      return await schedulerService.updateSchedule(input);
    }),

  update: publicProcedure
    .input(z.object({
      scheduleId: z.number(),
      cronExpression: z.string().optional(),
      enabled: z.boolean().optional()
    }))
    .mutation(async ({ input }) => {
      return await schedulerService.updateSchedule(input);
    }),

  delete: publicProcedure
    .input(z.object({
      scheduleId: z.number()
    }))
    .mutation(async ({ input }) => {
      await schedulerService.deleteSchedule(input.scheduleId);
      return { success: true };
    }),

  getNextRuns: publicProcedure
    .input(z.object({
      companyId: z.number().optional().default(1),
      limit: z.number().optional().default(10)
    }))
    .query(async ({ input }) => {
      return await schedulerService.getNextScheduledRuns(input.companyId, input.limit);
    })
});