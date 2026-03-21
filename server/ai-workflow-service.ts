import { ENV } from "./_core/env";

const QMT_API_BASE_URL =
  process.env.QMT_API_BASE_URL ?? ENV.QMT_API_BASE_URL ?? "http://127.0.0.1:8080/qmt";

async function requestQmt<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${QMT_API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`[QMT workflow] ${response.status} ${response.statusText}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type AIWorkflowConfig = Record<string, unknown> | null | undefined;

export interface AIWorkflowRecord {
  id?: number;
  code: string;
  name: string;
  description?: string | null;
  schedule_cron?: string | null;
  timezone?: string | null;
  is_enabled?: boolean;
  max_concurrency?: number | null;
  default_agent?: string | null;
  budget_limit?: number | null;
  timeout_seconds?: number | null;
  config?: AIWorkflowConfig;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AIWorkflowRunRecord {
  id: number;
  workflow_id: number;
  status: string;
  trigger_type: string;
  trigger_payload?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
  cost?: number | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  retry_count?: number | null;
}

export interface AIWorkflowTaskRecord {
  id: number;
  run_id: number;
  step_name?: string | null;
  adapter: string;
  skill_name?: string | null;
  status: string;
  attempt?: number | null;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface AIWorkflowEventRecord {
  id: number;
  run_id?: number | null;
  task_id?: number | null;
  event_type: string;
  level: string;
  message: string;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
}

export async function fetchWorkflows(): Promise<AIWorkflowRecord[]> {
  const result = await requestQmt<{ data?: AIWorkflowRecord[] }>("/ai/workflows", {
    method: "GET",
  });
  return result.data ?? [];
}

export async function triggerWorkflow(
  code: string,
  payload?: Record<string, unknown>
): Promise<AIWorkflowRunRecord> {
  const result = await requestQmt<{ data: AIWorkflowRunRecord }>(
    `/ai/workflows/${encodeURIComponent(code)}/runs`,
    {
      method: "POST",
      body: JSON.stringify({ payload }),
    }
  );
  return result.data;
}

export async function fetchWorkflowRuns(params: {
  code: string;
  limit?: number;
}): Promise<AIWorkflowRunRecord[]> {
  const query = new URLSearchParams();
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const result = await requestQmt<{ data?: AIWorkflowRunRecord[] }>(
    `/ai/workflows/${encodeURIComponent(params.code)}/runs${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}

export async function fetchWorkflowTasks(params: {
  runId: number;
  status?: string;
  limit?: number;
}): Promise<AIWorkflowTaskRecord[]> {
  const query = new URLSearchParams();
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const result = await requestQmt<{ data?: AIWorkflowTaskRecord[] }>(
    `/ai/workflow-runs/${params.runId}/tasks${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}

export async function fetchWorkflowEvents(params: {
  runId: number;
  limit?: number;
}): Promise<AIWorkflowEventRecord[]> {
  const query = new URLSearchParams();
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.toString() ? `?${query}` : "";
  const result = await requestQmt<{ data?: AIWorkflowEventRecord[] }>(
    `/ai/workflow-runs/${params.runId}/events${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}
