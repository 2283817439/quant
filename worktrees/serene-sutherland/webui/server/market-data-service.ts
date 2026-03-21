/**
 * 市场数据服务
 *
 * 架构链路：Web UI / tRPC -> (本文件) Node 代理 -> Python FastAPI (`services/market_data_api.py`) -> xtdata/xtquant
 * Python 端负责所有行情聚合与指标计算，TS 端仅做一次 HTTP 封装，统一从 `/api/...` endpoint 获取数据。
 */

import type { MarketIndex, MarketHeat, CapitalFlow, HotSector } from "../client/src/lib/api";

const PYTHON_API_BASE = "http://127.0.0.1:8081";

// 缓存配置（毫秒）
const CACHE_TTL: Partial<Record<keyof EndpointMap, number>> = {
  indices: 5_000,       // 大盘指数 5秒
  heat: 10_000,         // 市场热度 10秒
  capitalFlow: 10_000,  // 资金流向 10秒
  hotSectors: 15_000,   // 热点板块 15秒
  changeRanking: 10_000,
  turnoverRanking: 10_000,
  turnoverRateRanking: 10_000,
  mainFlowRanking: 10_000,
  volumeRatioRanking: 10_000,
  amplitudeRanking: 10_000,
};

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// 排行榜数据类型
export interface ChangeRanking {
  gainers: Array<{
    code: string;
    name: string;
    changePercent: number;
    price: number;
  }>;
  losers: Array<{
    code: string;
    name: string;
    changePercent: number;
    price: number;
  }>;
}

export interface TurnoverRank {
  code: string;
  name: string;
  turnover: number;
  turnoverYi: number;
}

export interface TurnoverRateRank {
  code: string;
  name: string;
  turnoverRate: number;
  volume: number;
}

export interface MainFlowRank {
  code: string;
  name: string;
  netInflow: number;
  netInflowWan: number;
}

export interface VolumeRatioRank {
  code: string;
  name: string;
  volumeRatio: number;
  todayVolume: number;
}

export interface AmplitudeRank {
  code: string;
  name: string;
  amplitude: number;
  high: number;
  low: number;
}

export interface StockPickResult {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  turnoverRate: number;
  volumeRatio: number;
  floatMv: number;
  kdjK: number;
  kdjD: number;
  kdjJ: number;
  limitUpDays: number;
}

export interface StockPickerResponse {
  data: StockPickResult[];
  count: number;
}

export interface ChatPickResponse {
  answer: string;
  stocks: StockPickResult[];
  filters_used: Record<string, unknown>;
  timestamp: string;
}

type EndpointMap = {
  indices: MarketIndex[];
  heat: MarketHeat;
  capitalFlow: CapitalFlow;
  hotSectors: HotSector[];
  changeRanking: ChangeRanking;
  turnoverRanking: TurnoverRank[];
  turnoverRateRanking: TurnoverRateRank[];
  mainFlowRanking: MainFlowRank[];
  volumeRatioRanking: VolumeRatioRank[];
  amplitudeRanking: AmplitudeRank[];
};

type QueryParams = Record<string, string | number>;

interface EndpointConfig<T> {
  path: string;
  required?: boolean;
  requireNonEmptyArray?: boolean;
  errorMessage?: string;
  defaultValue?: () => T;
}

const MARKET_ENDPOINTS: { [K in keyof EndpointMap]: EndpointConfig<EndpointMap[K]> } = {
  indices: {
    path: "/api/market/indices",
    required: true,
    requireNonEmptyArray: true,
    errorMessage: "无法获取实时大盘指数数据，请确认 Python 行情服务已启动",
  },
  heat: {
    path: "/api/market/heat",
    required: true,
    errorMessage: "无法获取市场热度数据，请确认 Python 行情服务已启动",
  },
  capitalFlow: {
    path: "/api/market/capital-flow",
    required: true,
    errorMessage: "无法获取资金流向数据，请确认 Python 行情服务已启动",
  },
  hotSectors: {
    path: "/api/market/hot-sectors",
    required: true,
    requireNonEmptyArray: true,
    errorMessage: "无法获取热点板块数据，请确认 Python 行情服务已启动",
  },
  changeRanking: {
    path: "/api/rank/change",
    defaultValue: () => ({ gainers: [], losers: [] }),
  },
  turnoverRanking: {
    path: "/api/rank/turnover",
    defaultValue: () => [],
  },
  turnoverRateRanking: {
    path: "/api/rank/turnover-rate",
    defaultValue: () => [],
  },
  mainFlowRanking: {
    path: "/api/rank/main-flow",
    defaultValue: () => [],
  },
  volumeRatioRanking: {
    path: "/api/rank/volume-ratio",
    defaultValue: () => [],
  },
  amplitudeRanking: {
    path: "/api/rank/amplitude",
    defaultValue: () => [],
  },
};

/**
 * 从 Python 服务获取数据
 */
async function fetchFromPythonService<T>(endpoint: string): Promise<T | null> {
  const url = `${PYTHON_API_BASE}${endpoint}`;

  if (process.env.DISABLE_PY_MARKET_DATA === "1") {
    console.warn(`[market-data] Python API disabled, skip request: ${url}`);
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[market-data] Python API returned ${response.status} for ${url}`);
      return null;
    }

    const result = await response.json();
    return result.data as T;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[market-data] Failed to fetch from Python API (${url}): ${errorMessage}`);
    return null;
  }
}

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    searchParams.append(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

async function fetchMarketData<K extends keyof EndpointMap>(
  key: K,
  options?: { query?: QueryParams }
): Promise<EndpointMap[K]> {
  const config = MARKET_ENDPOINTS[key];
  const query = buildQuery(options?.query);
  const cacheKey = `${key}${query}`;
  const ttl = CACHE_TTL[key];

  // 命中缓存直接返回
  if (ttl) {
    const cached = getCached<EndpointMap[K]>(cacheKey);
    if (cached !== null) return cached;
  }

  const data = await fetchFromPythonService<EndpointMap[K]>(`${config.path}${query}`);

  const hasData =
    data !== null &&
    data !== undefined &&
    (!config.requireNonEmptyArray || (Array.isArray(data) && data.length > 0));

  if (hasData) {
    if (ttl) setCached(cacheKey, data as EndpointMap[K], ttl);
    return data as EndpointMap[K];
  }

  if (config.required) {
    throw new Error(config.errorMessage ?? `Failed to fetch market data for "${String(key)}"`);
  }

  if (config.defaultValue) {
    return config.defaultValue();
  }

  return data as EndpointMap[K];
}

export const marketDataApi = {
  indices: () => fetchMarketData("indices"),
  heat: () => fetchMarketData("heat"),
  capitalFlow: () => fetchMarketData("capitalFlow"),
  hotSectors: (topN: number = 10) => fetchMarketData("hotSectors", { query: { top_n: topN } }),
  changeRanking: (topN: number = 50) => fetchMarketData("changeRanking", { query: { top_n: topN } }),
  turnoverRanking: (topN: number = 50) => fetchMarketData("turnoverRanking", { query: { top_n: topN } }),
  turnoverRateRanking: (topN: number = 50) =>
    fetchMarketData("turnoverRateRanking", { query: { top_n: topN } }),
  mainFlowRanking: (topN: number = 50) => fetchMarketData("mainFlowRanking", { query: { top_n: topN } }),
  volumeRatioRanking: (topN: number = 50) =>
    fetchMarketData("volumeRatioRanking", { query: { top_n: topN } }),
  amplitudeRanking: (topN: number = 50) =>
    fetchMarketData("amplitudeRanking", { query: { top_n: topN } }),
};

export const getMarketIndices = () => marketDataApi.indices();
export const getMarketHeat = () => marketDataApi.heat();
export const getCapitalFlow = () => marketDataApi.capitalFlow();
export const getHotSectors = (topN?: number) => marketDataApi.hotSectors(topN);
export const getChangeRanking = (topN?: number) => marketDataApi.changeRanking(topN);
export const getTurnoverRanking = (topN?: number) => marketDataApi.turnoverRanking(topN);
export const getTurnoverRateRanking = (topN?: number) => marketDataApi.turnoverRateRanking(topN);
export const getMainFlowRanking = (topN?: number) => marketDataApi.mainFlowRanking(topN);
export const getVolumeRatioRanking = (topN?: number) => marketDataApi.volumeRatioRanking(topN);
export const getAmplitudeRanking = (topN?: number) => marketDataApi.amplitudeRanking(topN);

export async function runStockPicker(filters: Record<string, unknown>): Promise<StockPickResult[]> {
  const url = `${PYTHON_API_BASE}/api/ai/stock-picker`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const result: StockPickerResponse = await response.json();
    return result.data ?? [];
  } catch (e) {
    console.warn(`[market-data] stock-picker failed: ${e}`);
    return [];
  }
}

export async function chatPick(question: string, filters?: Record<string, unknown>): Promise<ChatPickResponse> {
  const url = `${PYTHON_API_BASE.replace("8081", "8082")}/qmt/ai/chat-pick`;
  const empty: ChatPickResponse = { answer: "", stocks: [], filters_used: {}, timestamp: new Date().toISOString() };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, filters: filters ?? {} }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return empty;
    return (await response.json()) as ChatPickResponse;
  } catch (e) {
    console.warn(`[market-data] chat-pick failed: ${e}`);
    return empty;
  }
}
