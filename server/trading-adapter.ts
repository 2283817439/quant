/**
 * 实盘交易接口适配器
 * 支持 QMT、XTP、CTP 等多种交易接口
 */

import { getSettingsFallback } from "./_core/settings-fallback";

export interface IMarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  amount: number;
  change: number;
  changePercent: number;
  timestamp: Date;
}

export interface IOrder {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  status: "pending" | "partial" | "filled" | "cancelled" | "rejected";
  filledQuantity: number;
  filledPrice?: number;
  submitTime: Date;
  fillTime?: Date;
  commission: number;
}

export interface IPosition {
  symbol: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
  floatingProfit: number;
  floatingProfitPercent: number;
  openDate: Date;
}

export interface IAccountInfo {
  totalAssets: number;
  availableCash: number;
  marketValue: number;
  isConnected: boolean;
}

export interface ITradingAdapter {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  getAccountInfo(): Promise<IAccountInfo>;
  getPositions(): Promise<IPosition[]>;
  getOrders(status?: string): Promise<IOrder[]>;
  submitOrder(symbol: string, side: "buy" | "sell", quantity: number, price: number): Promise<string>;
  cancelOrder(orderId: string): Promise<boolean>;
  subscribeMarketData(symbols: string[], callback: (data: IMarketData) => void): void;
  unsubscribeMarketData(symbols: string[]): void;
}

export type TradingAdapterOptions = {
  accountCode?: string;
  config?: Record<string, unknown> | null;
};

type BridgeConfig = {
  enabled: boolean;
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  miniQmtPath: string;
  miniQmtSessionId: string;
  miniQmtAccountId: string;
};

type BridgeLoginResponse = {
  access_token: string;
};

type BridgeAssetResponse = {
  total_asset: number;
  available_cash: number;
  market_value: number;
};

type BridgePositionResponse = {
  symbol: string;
  total_volume: number;
  avg_price: number;
  market_value: number;
  unrealized_pnl: number;
};

type BridgeOrderResponse = {
  order_id: number;
  symbol: string;
  direction: string;
  order_type: string;
  price: number;
  volume: number;
  filled_volume: number;
  filled_price: number;
  status: string;
  create_time: string;
  update_time: string;
};

type BridgeQuoteResponse = {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
  timestamp: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeBridgeConfig(options?: TradingAdapterOptions): BridgeConfig {
  const config = asRecord(options?.config);
  const settingsFallback = getSettingsFallback();

  const envEnabled = process.env.TRADING_WEB_API_BRIDGE_ENABLED;
  const enabled =
    config.useWebApiBridge !== undefined
      ? asBoolean(config.useWebApiBridge, true)
      : envEnabled !== undefined
      ? asBoolean(envEnabled, true)
      : true;

  const baseUrl =
    asString(config.webApiBaseUrl) ||
    process.env.TRADING_WEB_API_URL ||
    "http://127.0.0.1:8080";

  const username =
    asString(config.apiUsername) ||
    process.env.TRADING_WEB_API_USERNAME ||
    "admin";

  const password =
    asString(config.apiPassword) ||
    process.env.TRADING_WEB_API_PASSWORD ||
    "admin123";

  const timeoutMs =
    config.requestTimeoutMs !== undefined
      ? Math.max(1000, asNumber(config.requestTimeoutMs, 8000))
      : Math.max(1000, asNumber(process.env.TRADING_WEB_API_TIMEOUT_MS, 8000));

  const miniQmtPath =
    asString(config.miniQmtPath) ||
    asString(config.qmtPath) ||
    process.env.MINIQMT_PATH ||
    process.env.QMT_MINI_PATH ||
    asString(settingsFallback.xtPluginPath) ||
    "";

  const miniQmtSessionId =
    asString(config.miniQmtSessionId) ||
    asString(config.qmtSessionId) ||
    process.env.MINIQMT_SESSION_ID ||
    process.env.QMT_SESSION_ID ||
    "";

  const miniQmtAccountId =
    asString(config.miniQmtAccountId) ||
    asString(config.qmtAccountId) ||
    process.env.MINIQMT_ACCOUNT_ID ||
    process.env.QMT_ACCOUNT_ID ||
    asString(settingsFallback.accountId) ||
    "";

  return {
    enabled,
    baseUrl: baseUrl.replace(/\/$/, ""),
    username,
    password,
    timeoutMs,
    miniQmtPath,
    miniQmtSessionId,
    miniQmtAccountId,
  };
}

function unsupportedAdapterError(name: string): Error {
  return new Error(`${name} adapter is not implemented. Please use QMT web_api bridge.`);
}

class WebApiBridgeClient {
  private token: string | null = null;

  constructor(private readonly config: BridgeConfig) {}

  async connect(): Promise<void> {
    await this.login();
  }

  async disconnect(): Promise<void> {
    this.token = null;
  }

  private async login(): Promise<void> {
    const data = await this.request<BridgeLoginResponse>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
          miniqmt_path: this.config.miniQmtPath,
          miniqmt_session_id: this.config.miniQmtSessionId,
          miniqmt_account_id: this.config.miniQmtAccountId,
        }),
      },
      false,
      false
    );

    if (!data?.access_token) {
      throw new Error("登录失败: 未获取到访问令牌");
    }

    this.token = data.access_token;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    requireAuth = true,
    allowRetry = true
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers = new Headers(init.headers ?? {});
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      // Avoid passing MiniQMT metadata via headers because non-ASCII characters (e.g. Chinese paths)
      // force undici to throw ByteString conversion errors. The login payload already transports
      // these settings, so headers are unnecessary.

      if (requireAuth) {
        if (!this.token) {
          await this.login();
        }
        headers.set("token", this.token!);
      }

      const response = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (response.status === 401 && requireAuth && allowRetry) {
        await this.login();
        return this.request<T>(path, init, requireAuth, false);
      }

      if (!response.ok) {
        const text = await response.text();
        // 将非 ASCII 字符替换为 Unicode 转义序列，避免 ByteString 编码错误
        const safeText = text.replace(/[\u0080-\uFFFF]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
        throw new Error(`请求失败 (${response.status}): ${safeText || response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`连接超时: 无法连接到交易服务 ${this.config.baseUrl}`);
        }
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
          throw new Error(`连接失败: 交易服务未启动 ${this.config.baseUrl}`);
        }
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async getAsset(): Promise<BridgeAssetResponse> {
    return this.request<BridgeAssetResponse>("/api/asset");
  }

  async getPositions(): Promise<BridgePositionResponse[]> {
    return this.request<BridgePositionResponse[]>("/api/positions");
  }

  async getOrders(): Promise<BridgeOrderResponse[]> {
    return this.request<BridgeOrderResponse[]>("/api/orders");
  }

  async placeOrder(payload: {
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    strategyId?: string;
  }): Promise<string> {
    const now = new Date().toISOString();
    // 使用 timestamp + 随机6位数，避免高频场景下的碰撞
    const localOrderId = `${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`;

    const response = await this.request<{ success: boolean; order_id?: number | string }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        order_id: localOrderId,
        strategy_id: payload.strategyId ?? null,
        symbol: payload.symbol,
        direction: payload.side,
        order_type: "limit",
        price: payload.price,
        volume: payload.quantity,
        filled_volume: 0,
        filled_price: 0,
        status: "pending",
        create_time: now,
        update_time: now,
      }),
    });

    if (response?.order_id !== undefined && response.order_id !== null) {
      return String(response.order_id);
    }
    // Keep local generated id as canonical id in Node layer when bridge does not return one.
    return String(localOrderId);
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const maybeNumber = Number.parseInt(orderId, 10);
    const safeOrderId = Number.isFinite(maybeNumber) ? maybeNumber : 0;

    await this.request<{ success: boolean }>(`/api/orders/${safeOrderId}`, {
      method: "DELETE",
    });
    return true;
  }

  async getQuotes(symbols?: string[]): Promise<BridgeQuoteResponse[]> {
    try {
      const query =
        symbols && symbols.length > 0
          ? `?symbols=${encodeURIComponent(
              symbols
                .map((symbol) => symbol.trim())
                .filter((symbol) => symbol.length > 0)
                .join(",")
            )}`
          : "";
      return await this.request<BridgeQuoteResponse[]>(`/api/quotes${query}`);
    } catch {
      return [];
    }
  }
}

/**
 * QMT 接口适配器（仅支持 Web API 桥接）
 */
export class QMTAdapter implements ITradingAdapter {
  private isConnected = false;
  private readonly bridgeConfig: BridgeConfig;
  private readonly bridgeClient?: WebApiBridgeClient;
  private accountInfo: IAccountInfo = {
    totalAssets: 1000000,
    availableCash: 500000,
    marketValue: 500000,
    isConnected: false,
  };
  private readonly localOrders = new Map<string, IOrder>();
  private readonly subscriptions = new Map<string, NodeJS.Timeout>();

  constructor(private readonly options?: TradingAdapterOptions) {
    this.bridgeConfig = normalizeBridgeConfig(options);
    if (this.bridgeConfig.enabled) {
      this.bridgeClient = new WebApiBridgeClient(this.bridgeConfig);
    }
  }

  async connect(): Promise<boolean> {
    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is disabled");
    }
    await this.bridgeClient.connect();

    console.log("[QMT] Connected successfully", {
      mode: "web_api_bridge",
      accountCode: this.options?.accountCode,
    });

    this.isConnected = true;
    this.accountInfo.isConnected = true;
    return true;
  }

  async disconnect(): Promise<void> {
    this.subscriptions.forEach((timer) => clearInterval(timer));
    this.subscriptions.clear();

    if (this.bridgeClient) {
      await this.bridgeClient.disconnect();
    }

    this.isConnected = false;
    this.accountInfo.isConnected = false;
    console.log("[QMT] Disconnected");
  }

  async getAccountInfo(): Promise<IAccountInfo> {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }

    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is not available");
    }

    const asset = await this.bridgeClient.getAsset();
    this.accountInfo = {
      totalAssets: asNumber(asset.total_asset),
      availableCash: asNumber(asset.available_cash),
      marketValue: asNumber(asset.market_value),
      isConnected: true,
    };
    return this.accountInfo;
  }

  async getPositions(): Promise<IPosition[]> {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }

    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is not available");
    }

    const rows = await this.bridgeClient.getPositions();
    return rows.map((row) => {
      const quantity = asNumber(row.total_volume);
      const costPrice = asNumber(row.avg_price);
      const marketValue = asNumber(row.market_value);
      const floatingProfit = asNumber(row.unrealized_pnl);
      const currentPrice = quantity > 0 ? marketValue / quantity : costPrice;
      return {
        symbol: row.symbol,
        quantity,
        costPrice,
        currentPrice,
        marketValue,
        floatingProfit,
        floatingProfitPercent: marketValue > 0 ? floatingProfit / Math.max(marketValue - floatingProfit, 1e-9) : 0,
        openDate: new Date(),
      };
    });
  }

  async getOrders(status?: string): Promise<IOrder[]> {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }

    if (this.bridgeClient) {
      const rows = await this.bridgeClient.getOrders();
      if (rows.length > 0) {
        const mapped = rows.map((row): IOrder => ({
          orderId: String(row.order_id),
          symbol: row.symbol,
          side: row.direction === "sell" ? "sell" : "buy",
          quantity: asNumber(row.volume),
          price: asNumber(row.price),
          status: ([
            "pending",
            "partial",
            "filled",
            "cancelled",
            "rejected",
          ].includes(row.status)
            ? row.status
            : "pending") as IOrder["status"],
          filledQuantity: asNumber(row.filled_volume),
          filledPrice: asNumber(row.filled_price),
          submitTime: new Date(row.create_time || Date.now()),
          fillTime: row.filled_volume ? new Date(row.update_time || Date.now()) : undefined,
          commission: 0,
        }));

        mapped.forEach((order) => this.localOrders.set(order.orderId, order));
        return status ? mapped.filter((order) => order.status === status) : mapped;
      }
    }

    const fallback = Array.from(this.localOrders.values());
    return status ? fallback.filter((order) => order.status === status) : fallback;
  }

  async submitOrder(
    symbol: string,
    side: "buy" | "sell",
    quantity: number,
    price: number
  ): Promise<string> {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }

    const now = new Date();
    if (!this.bridgeClient) {
      throw new Error("QMT web_api bridge is not available");
    }
    const orderId = await this.bridgeClient.placeOrder({
      symbol,
      side,
      quantity,
      price,
      strategyId: this.options?.accountCode,
    });

    this.localOrders.set(orderId, {
      orderId,
      symbol,
      side,
      quantity,
      price,
      status: "pending",
      filledQuantity: 0,
      submitTime: now,
      commission: 0,
    });

    console.log(`[QMT] Order submitted: ${orderId}`);
    return orderId;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }

    if (this.bridgeClient) {
      await this.bridgeClient.cancelOrder(orderId);
    }

    const local = this.localOrders.get(orderId);
    if (local) {
      local.status = "cancelled";
      this.localOrders.set(orderId, local);
    }

    console.log(`[QMT] Order cancelled: ${orderId}`);
    return true;
  }

  subscribeMarketData(symbols: string[], callback: (data: IMarketData) => void): void {
    if (!this.isConnected) {
      throw new Error("QMT adapter not connected");
    }

    const key = Array.from(new Set(symbols)).sort().join(",");
    if (!key || this.subscriptions.has(key)) return;

    const timer = setInterval(async () => {
      try {
        if (!this.bridgeClient) {
          throw new Error("QMT web_api bridge is not available");
        }

        const quotes = await this.bridgeClient.getQuotes(symbols);
        symbols.forEach((symbol) => {
          const q = quotes.find((item) => item.symbol === symbol);
          if (!q) return;
          callback({
            symbol,
            price: asNumber(q.price),
            bid: asNumber(q.price),
            ask: asNumber(q.price),
            volume: asNumber(q.volume),
            amount: asNumber(q.amount),
            change: asNumber(q.change),
            changePercent: asNumber(q.change_percent),
            timestamp: new Date(q.timestamp || Date.now()),
          });
        });
      } catch (error) {
        console.error("[QMT] subscribeMarketData failed:", error);
      }
    }, 1000);

    this.subscriptions.set(key, timer);
  }

  unsubscribeMarketData(symbols: string[]): void {
    this.subscriptions.forEach((timer, key) => {
      const subscribed = key.split(",");
      if (symbols.some((symbol) => subscribed.includes(symbol))) {
        clearInterval(timer);
        this.subscriptions.delete(key);
      }
    });
    console.log(`[QMT] Unsubscribed from: ${symbols.join(",")}`);
  }
}

/**
 * XTP 接口适配器（未实现）
 */
export class XTPAdapter implements ITradingAdapter {
  async connect(): Promise<boolean> {
    throw unsupportedAdapterError("XTP");
  }

  async disconnect(): Promise<void> {}

  async getAccountInfo(): Promise<IAccountInfo> {
    throw unsupportedAdapterError("XTP");
  }

  async getPositions(): Promise<IPosition[]> {
    throw unsupportedAdapterError("XTP");
  }

  async getOrders(status?: string): Promise<IOrder[]> {
    void status;
    throw unsupportedAdapterError("XTP");
  }

  async submitOrder(
    symbol: string,
    side: "buy" | "sell",
    quantity: number,
    price: number
  ): Promise<string> {
    void symbol;
    void side;
    void quantity;
    void price;
    throw unsupportedAdapterError("XTP");
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    void orderId;
    throw unsupportedAdapterError("XTP");
  }

  subscribeMarketData(symbols: string[], callback: (data: IMarketData) => void): void {
    void symbols;
    void callback;
    throw unsupportedAdapterError("XTP");
  }

  unsubscribeMarketData(symbols: string[]): void {
    void symbols;
  }
}

/**
 * 交易适配器工厂
 */
export function createTradingAdapter(
  type: "qmt" | "xtp" | "ctp" | "other",
  options?: TradingAdapterOptions
): ITradingAdapter {
  switch (type) {
    case "qmt":
      return new QMTAdapter(options);
    case "xtp":
      return new XTPAdapter();
    default:
      throw new Error(`Unsupported trading adapter: ${type}`);
  }
}
