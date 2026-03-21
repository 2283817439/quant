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
    throw new Error(`[QMT monitor] ${response.status} ${response.statusText}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export interface MonitorEntry {
  id: number;
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  status: string;
  quantity: number;
  buy_price?: number | null;
  buy_price_type?: string | null;
  sell_price?: number | null;
  sell_price_type?: string | null;
  dynamic_take_profit?: number | null;
  dynamic_stop_loss?: number | null;
  time_limit_minutes?: number | null;
  last_price?: number | null;
  last_check?: string | null;
  triggered_side?: string | null;
  target_account?: string | null;
  order_strategy?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MonitorFill {
  id: number;
  monitor_id: number;
  symbol: string;
  name?: string | null;
  side: string;
  quantity: number;
  trigger_price?: number | null;
  execution_price?: number | null;
  order_id?: string | null;
  status: string;
  filled_at?: string | null;
  extra?: unknown;
}

export type MonitorEntryPayload = {
  symbol: string;
  quantity: number;
  name?: string;
  exchange?: string;
  buy_price?: number;
  buy_price_type?: string;
  sell_price?: number;
  sell_price_type?: string;
  dynamic_take_profit?: number;
  dynamic_stop_loss?: number;
  time_limit_minutes?: number;
  target_account?: string;
  order_strategy?: string;
  notes?: string;
  status?: string;
};

export type MonitorEntryUpdate = Partial<
  Omit<MonitorEntryPayload, "symbol" | "status"> & { status?: string; quantity?: number }
>;

export async function fetchMonitorConfig(): Promise<Record<string, unknown>> {
  const result = await requestQmt<{ data?: Record<string, unknown> }>("/ai/monitor/config", {
    method: "GET",
  });
  return result.data ?? {};
}

export async function fetchMonitorEntries(params?: {
  status?: string;
}): Promise<MonitorEntry[]> {
  const query = new URLSearchParams();
  if (params?.status) {
    query.set("status", params.status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await requestQmt<{ data?: MonitorEntry[] }>(
    `/ai/monitor/pool${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}

export async function fetchMonitorFills(limit?: number): Promise<MonitorFill[]> {
  const query = new URLSearchParams();
  if (limit) {
    query.set("limit", String(limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const result = await requestQmt<{ data?: MonitorFill[] }>(
    `/ai/monitor/fills${suffix}`,
    { method: "GET" }
  );
  return result.data ?? [];
}

export async function createMonitorEntry(payload: MonitorEntryPayload): Promise<MonitorEntry> {
  const result = await requestQmt<{ data: MonitorEntry }>(`/ai/monitor/pool`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return result.data;
}

export async function updateMonitorEntry(
  id: number,
  patch: MonitorEntryUpdate
): Promise<MonitorEntry> {
  const result = await requestQmt<{ data: MonitorEntry }>(`/ai/monitor/pool/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return result.data;
}

export async function deleteMonitorEntry(id: number): Promise<boolean> {
  const result = await requestQmt<{ success?: boolean }>(`/ai/monitor/pool/${id}`, {
    method: "DELETE",
  });
  return Boolean(result.success);
}
