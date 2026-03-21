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
});
