import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import {
  createTask,
  getTask,
  listTasks,
  markCancelled,
  StrategyTaskInput,
} from "./ai";
import { strategyTaskRunner } from "./ai/task-runner";
import { QmtToolEngine } from "./ai/toolkit";
import { chatPick } from "./market-data-service";
import {
  fetchWorkflows,
  triggerWorkflow as triggerWorkflowRequest,
  fetchWorkflowRuns,
  fetchWorkflowTasks,
  fetchWorkflowEvents,
} from "./ai-workflow-service";
import {
  loadAiWorkflowSettings,
  saveAiWorkflowSettings,
  AiWorkflowSettings,
} from "./ai-config-store";

const engine = new QmtToolEngine();

const taskInputSchema: z.ZodType<StrategyTaskInput> = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  symbols: z.array(z.string()).optional(),
  benchmark: z.string().optional(),
  objective: z
    .object({
      annualReturn: z.number().optional(),
      maxDrawdown: z.number().optional(),
      sharpe: z.number().optional(),
    })
    .optional(),
  backtestRange: z
    .object({
      start: z.string().length(8),
      end: z.string().length(8),
    })
    .optional(),
  deployToSimulation: z.boolean().optional(),
});

const aiWorkflowSettingsSchema: z.ZodType<AiWorkflowSettings> = z.object({
  scheduler: z.object({
    interval_seconds: z.number(),
    max_parallel_runs: z.number(),
    max_tasks_per_run: z.number(),
    default_timeout_seconds: z.number(),
    default_budget_units: z.number(),
    max_retry: z.number(),
  }),
  skills: z.object({
    roots: z.array(z.string()),
    python_entrypoint: z.string(),
    node_entrypoint: z.string(),
    default_runtime: z.string(),
    hot_reload: z.boolean(),
  }),
  adapters: z.object({
    quant_local: z.object({
      enabled: z.boolean(),
      python_entrypoint: z.string(),
      max_concurrency: z.number(),
      services: z.object({
        market_data: z.string(),
        trading: z.string(),
        portfolio: z.string(),
      }),
      endpoints: z.object({
        market_api: z.string(),
        trading_api: z.string(),
        monitor_api: z.string(),
      }),
    }),
  }),
  events: z.object({
    log_path: z.string(),
    watchdog_on_failure: z.boolean(),
  }),
});

export const aiRouter = router({
  createTask: publicProcedure.input(taskInputSchema).mutation(({ input }) => {
    const task = createTask(input);
    strategyTaskRunner.enqueue(task.id);
    return { taskId: task.id };
  }),

  getTask: publicProcedure.input(z.object({ taskId: z.string().uuid() })).query(({ input }) => {
    const task = getTask(input.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    return task;
  }),

  listTasks: publicProcedure.query(() => {
    return listTasks();
  }),

  cancelTask: publicProcedure.input(z.object({ taskId: z.string().uuid() })).mutation(({ input }) => {
    markCancelled(input.taskId);
    return { success: true };
  }),

  newsDigest: publicProcedure
    .input(
      z.object({
        keywords: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input }) => {
      return await engine.fetchNewsDigest({ keywords: input.keywords });
    }),

  chatPick: publicProcedure
    .input(z.object({
      question: z.string().min(1),
      filters: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await chatPick(input.question, input.filters as Record<string, unknown> | undefined);
    }),

  workflowList: publicProcedure.query(async () => {
    return await fetchWorkflows();
  }),

  workflowRuns: publicProcedure
    .input(
      z.object({
        code: z.string().min(1),
        limit: z.number().int().positive().max(500).optional(),
      })
    )
    .query(async ({ input }) => {
      return await fetchWorkflowRuns(input);
    }),

  workflowTasks: publicProcedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        status: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      })
    )
    .query(async ({ input }) => {
      return await fetchWorkflowTasks(input);
    }),

  workflowEvents: publicProcedure
    .input(
      z.object({
        runId: z.number().int().positive(),
        limit: z.number().int().positive().max(1000).optional(),
      })
    )
    .query(async ({ input }) => {
      return await fetchWorkflowEvents(input);
    }),

  triggerWorkflow: publicProcedure
    .input(
      z.object({
        code: z.string().min(1),
        payload: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await triggerWorkflowRequest(
        input.code,
        input.payload as Record<string, unknown> | undefined
      );
    }),

  workflowSettings: publicProcedure.query(() => {
    return loadAiWorkflowSettings();
  }),

  saveWorkflowSettings: publicProcedure
    .input(aiWorkflowSettingsSchema)
    .mutation(({ input }) => {
      saveAiWorkflowSettings(input);
      return { success: true } as const;
    }),
});
