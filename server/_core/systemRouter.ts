import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { updateSettingsFile, getStoredConfig, type ConfigSection } from "./settings-fallback";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  // 获取系统配置
  getConfig: publicProcedure
    .input(
      z.object({
        section: z.enum(["database", "web_api", "qmt", "oauth", "risk"]).optional(),
      })
    )
    .query(({ input }) => {
      const config = getStoredConfig(input.section);
      return {
        success: true,
        config,
      };
    }),

  // 保存系统配置
  saveConfig: publicProcedure
    .input(
      z.object({
        section: z.enum(["database", "web_api", "qmt", "oauth", "risk"]),
        config: z.object({}).passthrough(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await updateSettingsFile(input.section, input.config as Record<string, string>);
        return {
          success: true,
          message: `配置保存成功：${input.section}`,
        };
      } catch (error) {
        throw new Error(`保存配置失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }),

  serverTime: publicProcedure.query(() => {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
    return {
      serverTime: now.toISOString(),
      unixMillis: now.getTime(),
      timezone,
    };
  }),
});
