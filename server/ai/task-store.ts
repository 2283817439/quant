import crypto from "node:crypto";

export type StrategyTaskStage =
  | "queued"
  | "analyzing"
  | "generating"
  | "backtesting"
  | "optimizing"
  | "deploying"
  | "completed"
  | "failed"
  | "cancelled";

export interface StrategyTaskInput {
  title: string;
  description: string;
  symbols?: string[];
  benchmark?: string;
  objective?: {
    annualReturn?: number;
    maxDrawdown?: number;
    sharpe?: number;
  };
  backtestRange?: {
    start: string;
    end: string;
  };
  deployToSimulation?: boolean;
}

export interface StrategyTaskRecord {
  id: string;
  status: StrategyTaskStage;
  createdAt: Date;
  updatedAt: Date;
  input: StrategyTaskInput;
  result?: Record<string, unknown>;
  error?: string;
  logs: Array<{ ts: number; message: string }>;
  cancelled?: boolean;
}

const tasks = new Map<string, StrategyTaskRecord>();

export function createTask(input: StrategyTaskInput): StrategyTaskRecord {
  const id = crypto.randomUUID();
  const now = new Date();
  const record: StrategyTaskRecord = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    input,
    logs: [],
  };
  tasks.set(id, record);
  return record;
}

export function getTask(id: string): StrategyTaskRecord | undefined {
  return tasks.get(id);
}

export function listTasks(): StrategyTaskRecord[] {
  return Array.from(tasks.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function appendLog(id: string, message: string) {
  const task = tasks.get(id);
  if (!task) return;
  task.logs.push({ ts: Date.now(), message });
  task.updatedAt = new Date();
}

export function updateTask(
  id: string,
  patch: Partial<Pick<StrategyTaskRecord, "status" | "result" | "error">>
) {
  const task = tasks.get(id);
  if (!task) return;
  Object.assign(task, patch);
  task.updatedAt = new Date();
  if (patch.status) {
    appendLog(id, `Task status → ${patch.status}`);
  }
}

export function markCancelled(id: string) {
  const task = tasks.get(id);
  if (!task) return;
  task.cancelled = true;
  task.status = "cancelled";
  task.updatedAt = new Date();
  appendLog(id, "Task cancelled by user");
}
