import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import {
  executionMonitorService,
  type AlertConfig,
  type NotificationChannel,
} from "./execution-monitor-service";

const channelSchema = z.object({
  enabled: z.boolean(),
  target: z.string().default(""),
});

const alertConfigSchema = z.object({
  thresholds: z.object({
    maxDrawdown: z.number().min(0).max(1),
    maxDailyLoss: z.number().min(0).max(1),
    maxVar95: z.number().min(0).max(1),
    maxConcentration: z.number().min(0).max(1),
  }),
  channels: z.object({
    in_app: channelSchema,
    email: channelSchema,
    sms: channelSchema,
  }),
});

export const executionMonitorRouter = router({
  getSnapshot: publicProcedure
    .input(
      z
        .object({
          eventLimit: z.number().int().min(10).max(200).default(80),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return executionMonitorService.getSnapshot(ctx.user?.id ?? 0, input?.eventLimit ?? 80);
    }),

  startEngine: publicProcedure
    .input(z.object({ strategyId: z.number().int().nonnegative() }))
    .mutation(async ({ ctx, input }) => {
      return executionMonitorService.startEngine(ctx.user?.id ?? 0, input.strategyId);
    }),

  stopEngine: publicProcedure
    .input(z.object({ strategyId: z.number().int().nonnegative() }))
    .mutation(async ({ ctx, input }) => {
      return executionMonitorService.stopEngine(ctx.user?.id ?? 0, input.strategyId);
    }),

  applyOptimalParameters: publicProcedure
    .input(
      z.object({
        strategyId: z.number().int().nonnegative(),
        scanConfigId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return executionMonitorService.applyOptimalParameters(ctx.user?.id ?? 0, {
        strategyId: input.strategyId,
        scanConfigId: input.scanConfigId,
      });
    }),

  setAutoOptimization: publicProcedure
    .input(
      z.object({
        strategyId: z.number().int().nonnegative(),
        enabled: z.boolean(),
        intervalMinutes: z.number().int().min(1).max(24 * 60),
        scanConfigId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return executionMonitorService.setAutoOptimization(ctx.user?.id ?? 0, {
        strategyId: input.strategyId,
        enabled: input.enabled,
        intervalMinutes: input.intervalMinutes,
        scanConfigId: input.scanConfigId,
      });
    }),

  getAlertConfig: publicProcedure.query(async ({ ctx }) => {
    return executionMonitorService.getAlertConfig(ctx.user?.id ?? 0);
  }),

  updateAlertConfig: publicProcedure
    .input(alertConfigSchema)
    .mutation(async ({ ctx, input }) => {
      return executionMonitorService.updateAlertConfig(ctx.user?.id ?? 0, input as AlertConfig);
    }),

  getNotifications: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(50),
          channel: z.enum(["in_app", "email", "sms"] as [NotificationChannel, ...NotificationChannel[]]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const list = await executionMonitorService.getNotifications(ctx.user?.id ?? 0, input?.limit ?? 50);
      if (!input?.channel) {
        return list;
      }
      return list.filter((item) => item.channel === input.channel);
    }),

  markNotificationRead: publicProcedure
    .input(
      z.object({
        notificationId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return executionMonitorService.markNotificationRead(ctx.user?.id ?? 0, input.notificationId);
    }),

  sendTestNotification: publicProcedure
    .input(
      z.object({
        channel: z.enum(["in_app", "email", "sms"] as [NotificationChannel, ...NotificationChannel[]]),
        target: z.string().optional(),
        title: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return executionMonitorService.sendTestNotification(ctx.user?.id ?? 0, input);
    }),
});
