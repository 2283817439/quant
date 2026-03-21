import { AI_DEFAULT_TIMEOUT_MS, QMT_API_BASE_URL } from "./config";

type HttpMethod = "GET" | "POST";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

async function httpRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${QMT_API_BASE_URL}${path}`, {
      method: options.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`QMT API ${response.status} ${response.statusText}: ${text}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export class QmtToolEngine {
  getHistoryKline(params: {
    stock_code: string;
    period: string;
    start_time: string;
    end_time: string;
  }) {
    return httpRequest<{ data: unknown }>("/qmt/get_history_kline", { body: params });
  }

  submitBacktest(params: {
    strategy_code: string;
    backtest_config: Record<string, unknown>;
  }) {
    return httpRequest<{ task_id: string }>("/qmt/submit_backtest", { body: params });
  }

  getBacktestStatus(params: { task_id: string }) {
    return httpRequest<{ status: string; progress?: number }>("/qmt/backtest_status", {
      body: params,
    });
  }

  getBacktestReport(params: { task_id: string }) {
    return httpRequest<{ report: Record<string, unknown> }>("/qmt/backtest_report", {
      body: params,
    });
  }

  deployStrategy(params: {
    strategy_code: string;
    metadata?: Record<string, unknown>;
  }) {
    return httpRequest<{ deployment_id: string }>("/qmt/strategy/deploy", { body: params });
  }

  getDeploymentStatus(params: { deployment_id: string }) {
    return httpRequest<{ status: string; metrics?: Record<string, unknown> }>(
      "/qmt/strategy/status",
      { body: params }
    );
  }

  fetchAccountSnapshot(params: { account_id?: number }) {
    return httpRequest<{ data: Record<string, unknown> }>("/qmt/account/positions", {
      body: params,
    });
  }

  fetchRiskMetrics() {
    return httpRequest<{ metrics: Record<string, unknown> }>("/qmt/risk_metrics", {
      body: {},
    });
  }

  fetchNewsDigest(params: { keywords?: string[] }) {
    return httpRequest<{ items: Array<Record<string, unknown>> }>("/qmt/news_feed", {
      body: params,
    });
  }
}
