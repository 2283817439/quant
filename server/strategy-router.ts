/**
 * 策略代码管理 tRPC 路由
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";

// 策略代码存储目录
const STRATEGY_CODE_DIR = path.join(process.cwd(), "strategies", "user_code");
const SETTINGS_FILE_PATH = path.join(process.cwd(), "config", "settings.yaml");
const DEFAULT_STRATEGY_DIR = path.join(process.cwd(), "strategy");

function resolveDefaultStrategyClass(): string {
  try {
    if (!fs.existsSync(SETTINGS_FILE_PATH)) {
      return "FactorCapitalStrategy";
    }
    const raw = fs.readFileSync(SETTINGS_FILE_PATH, "utf-8");
    const config = yaml.load(raw) as Record<string, any> | undefined;
    return (config?.strategy?.class as string) || "FactorCapitalStrategy";
  } catch (error) {
    console.warn("[StrategyRouter] Failed to parse settings.yaml:", error);
    return "FactorCapitalStrategy";
  }
}

const DEFAULT_STRATEGY_CLASS = resolveDefaultStrategyClass();
const DEFAULT_STRATEGY_FILE = path.join(DEFAULT_STRATEGY_DIR, `${DEFAULT_STRATEGY_CLASS}.py`);

// 确保目录存在
if (!fs.existsSync(STRATEGY_CODE_DIR)) {
  fs.mkdirSync(STRATEGY_CODE_DIR, { recursive: true });
}

function loadDefaultStrategyCode() {
  if (!fs.existsSync(DEFAULT_STRATEGY_FILE)) {
    return null;
  }
  const content = fs.readFileSync(DEFAULT_STRATEGY_FILE, "utf-8");
  return {
    code: content,
    filePath: DEFAULT_STRATEGY_FILE,
    lastModified: fs.statSync(DEFAULT_STRATEGY_FILE).mtime.toISOString(),
  };
}

export const strategyRouter = router({
  /**
   * 保存策略代码
   */
  saveCode: publicProcedure
    .input(
      z.object({
        code: z.string().min(1),
        strategyName: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // 生成安全的文件名
        const safeFileName = input.strategyName
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")
          .replace(/\s+/g, "_");
        
        const filePath = path.join(STRATEGY_CODE_DIR, `${safeFileName}.py`);
        
        // 添加保存时间戳
        const timestamp = new Date().toISOString();
        const codeWithMetadata = `# Saved at: ${timestamp}\n# Strategy: ${input.strategyName}\n\n${input.code}`;
        
        // 写入文件
        fs.writeFileSync(filePath, codeWithMetadata, "utf-8");
        
        return { 
          success: true, 
          message: "策略代码已保存",
          filePath,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "保存失败",
        });
      }
    }),

  /**
   * 提交策略代码审核
   */
  submitCode: publicProcedure
    .input(
      z.object({
        code: z.string().min(1),
        strategyName: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // 生成安全的文件名
        const safeFileName = input.strategyName
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")
          .replace(/\s+/g, "_");
        
        const submitDir = path.join(process.cwd(), "strategies", "submitted");
        if (!fs.existsSync(submitDir)) {
          fs.mkdirSync(submitDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filePath = path.join(submitDir, `${safeFileName}_${timestamp}.py`);
        
        // 添加提交元数据
        const metadata = `"""
Strategy Submission
===================
Name: ${input.strategyName}
Submitted At: ${new Date().toISOString()}
Status: Pending Review
"""

`;
        const codeWithMetadata = metadata + input.code;
        
        // 写入文件
        fs.writeFileSync(filePath, codeWithMetadata, "utf-8");
        
        // TODO: 这里可以添加邮件通知、代码质量检查等逻辑
        
        return { 
          success: true, 
          message: "策略代码已提交审核",
          filePath,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "提交失败",
        });
      }
    }),

  /**
   * 获取已保存的策略代码
   */
  getSavedCode: publicProcedure
    .input(
      z.object({
        strategyName: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const safeFileName = input.strategyName
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")
          .replace(/\s+/g, "_");
        
        const filePath = path.join(STRATEGY_CODE_DIR, `${safeFileName}.py`);
        
        if (!fs.existsSync(filePath)) {
          return loadDefaultStrategyCode();
        }
        
        const content = fs.readFileSync(filePath, "utf-8");
        
        // 移除元数据行，只返回实际代码
        const lines = content.split("\n");
        const codeLines = lines.filter(line => !line.startsWith("# Saved at:") && !line.startsWith("# Strategy:"));
        
        return {
          code: codeLines.join("\n"),
          filePath,
          lastModified: fs.statSync(filePath).mtime.toISOString(),
        };
      } catch (error) {
        console.error("Failed to load saved code:", error);
        return loadDefaultStrategyCode();
      }
    }),

  listAvailable: publicProcedure.query(async () => {
    try {
      const entries: Array<{ name: string; source: "system" | "user"; filePath: string }> = [];
      if (fs.existsSync(DEFAULT_STRATEGY_FILE)) {
        entries.push({
          name: DEFAULT_STRATEGY_CLASS,
          source: "system",
          filePath: DEFAULT_STRATEGY_FILE,
        });
      }

      if (fs.existsSync(STRATEGY_CODE_DIR)) {
        const files = fs.readdirSync(STRATEGY_CODE_DIR).filter(file => file.endsWith(".py"));
        for (const file of files) {
          entries.push({
            name: file.replace(/\.py$/, ""),
            source: "user",
            filePath: path.join(STRATEGY_CODE_DIR, file),
          });
        }
      }

      return entries;
    } catch (error) {
      console.error("[StrategyRouter] listAvailable failed", error);
      return [];
    }
  }),

  /**
   * 获取所有已提交的策略列表
   */
  getSubmittedStrategies: publicProcedure.query(async () => {
    try {
      const submitDir = path.join(process.cwd(), "strategies", "submitted");
      
      if (!fs.existsSync(submitDir)) {
        return [];
      }
      
      const files = fs.readdirSync(submitDir)
        .filter(file => file.endsWith(".py"))
        .map(file => {
          const filePath = path.join(submitDir, file);
          const stats = fs.statSync(filePath);
          
          // 从文件名中提取策略名称
          const nameMatch = file.match(/^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.py$/);
          const strategyName = nameMatch ? nameMatch[1] : file.replace(".py", "");
          
          return {
            fileName: file,
            strategyName: strategyName.replace(/_/g, " "),
            submittedAt: stats.mtime.toISOString(),
            size: stats.size,
          };
        })
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      
      return files;
    } catch (error) {
      console.error("Failed to list submitted strategies:", error);
      return [];
    }
  }),
});
