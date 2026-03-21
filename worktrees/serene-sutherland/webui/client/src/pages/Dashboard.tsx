import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  DollarSign,
  Flame,
  Layers,
  ShieldCheck,
  Target,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Award,
} from 'lucide-react';
import { api, formatMoney, formatNum, formatPct, type DashboardOverview, type EquityPoint } from '@/lib/api';
import { trpc } from '@/lib/trpc';

type MetricCardProps = {
  title: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  tone?: 'primary' | 'profit' | 'loss' | 'warning';
  loading?: boolean;
};

const toneStyles = {
  primary: {
    color: 'oklch(0.61 0.18 251)',
    bg: 'oklch(0.61 0.18 251 / 0.14)',
  },
  profit: {
    color: 'var(--profit)',
    bg: 'rgb(239 68 68 / 0.14)',
  },
  loss: {
    color: 'var(--loss)',
    bg: 'rgb(16 185 129 / 0.14)',
  },
  warning: {
    color: 'oklch(0.79 0.16 81)',
    bg: 'oklch(0.79 0.16 81 / 0.16)',
  },
};

function MetricCard({ title, value, sub, icon: Icon, tone = 'primary', loading }: MetricCardProps) {
  const palette = toneStyles[tone];

  return (
    <div className="quant-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
          <div className="mt-3">
            {loading ? (
              <div className="h-8 w-28 animate-pulse rounded bg-white/6" />
            ) : (
              <div className="metric-value text-3xl font-semibold" style={{ color: palette.color }}>
                {value}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: palette.bg }}>
          <Icon className="h-5 w-5" style={{ color: palette.color }} />
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="space-y-1.5">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              {item.name}
            </div>
            <div className="metric-value font-medium text-foreground">{formatNum(item.value, 4)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // 获取大盘指数数据
  const { data: marketIndices, isLoading: indicesLoading } = trpc.trading.getMarketIndices.useQuery(undefined, {
    refetchInterval: 30000, // 30 秒刷新一次
  });

  // 获取市场热度数据
  const { data: marketHeat, isLoading: heatLoading, error: heatError } = trpc.trading.getMarketHeat.useQuery(undefined, {
    refetchInterval: 30000,
  });
  
  // 调试日志：检查市场热度数据
  useEffect(() => {
    if (marketHeat) {
      console.log('[Dashboard] Market heat data received:', {
        advanceCount: marketHeat.advanceCount,
        declineCount: marketHeat.declineCount,
        limitUpCount: marketHeat.limitUpCount,
        limitDownCount: marketHeat.limitDownCount,
        heatScore: marketHeat.heatScore,
      });
    } else {
      console.warn('[Dashboard] No market heat data received');
    }
    if (heatError) {
      console.error('[Dashboard] Market heat query error:', heatError);
    }
  }, [marketHeat, heatError]);

  // 获取资金流向数据
  const { data: capitalFlow, isLoading: flowLoading } = trpc.trading.getCapitalFlow.useQuery(undefined, {
    refetchInterval: 60000, // 1 分钟刷新一次
  });

  // 获取热点板块数据
  const { data: hotSectors, isLoading: sectorsLoading } = trpc.trading.getHotSectors.useQuery(undefined, {
    refetchInterval: 60000,
  });

  useEffect(() => {
    Promise.all([api.getDashboardOverview(), api.getEquityCurve()])
      .then(([ov, eq]) => {
        setOverview(ov);
        setEquity(eq.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalReturn = overview?.total_return ?? 0;
  const isProfit = totalReturn >= 0;
  const currentNav = overview ? overview.total_asset / overview.initial_capital : 0;

  const chartData = useMemo(
    () =>
      equity.filter((_, index) => index % 2 === 0).map((point) => ({
        date: point.date.slice(5),
        nav: point.nav,
        benchmark: point.benchmark ?? null,
      })),
    [equity],
  );

  const drawdownData = useMemo(
    () =>
      equity.filter((_, index) => index % 2 === 0).map((point, index, list) => {
        const peak = Math.max(...list.slice(0, index + 1).map((item) => item.nav));
        return {
          date: point.date.slice(5),
          drawdown: peak > 0 ? (point.nav - peak) / peak : 0,
        };
      }),
    [equity],
  );

  return (
    <div className="space-y-5">
      {/* 策略总览 Hero Panel */}
      <section className="hero-panel relative overflow-hidden rounded-[28px] px-6 py-6 lg:px-8 lg:py-7">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.08),transparent_55%)] lg:block" />
        <div className="relative grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
          <div>
            <p className="quant-kicker">Chief Allocation View</p>
            <h1 className="mt-3 text-3xl font-semibold text-white lg:text-4xl">小市值因子策略总览</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/62">
              从数据准备、策略执行到账户状态统一收口在同一条量化流水线里。当前视图聚焦净值曲线、回撤约束、
              资金状态和模块联机信号，服务于策略从研究到实盘的连续验证。
            </p>
            <div className="mt-6 flex flex-wrap items-end gap-6">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-white/46">当前净值</div>
                <div className="metric-value mt-2 text-5xl font-semibold text-white">{loading ? '--' : currentNav.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-white/46">累计收益</div>
                <div className={`metric-value mt-2 text-2xl font-semibold ${isProfit ? 'text-profit' : 'text-loss'}`}>
                  {loading ? '--' : formatPct(totalReturn)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-white/46">累计盈亏</div>
                <div className="metric-value mt-2 text-xl font-semibold text-white/86">
                  {loading ? '--' : formatMoney(overview?.total_pnl)}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="glass-pill rounded-3xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">风险提示</span>
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">最大回撤已接近预警阈值</div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">
                当前最大回撤 {loading ? '--' : formatPct(-(overview?.max_drawdown ?? 0))}，建议结合仓位控制和止损规则继续复核。
              </div>
            </div>
            <div className="glass-pill rounded-3xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">策略节律</span>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground">交易天数</div>
                  <div className="metric-value mt-1 text-xl font-semibold">{loading ? '--' : overview?.trading_days ?? 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">成交笔数</div>
                  <div className="metric-value mt-1 text-xl font-semibold">{loading ? '--' : overview?.trade_count ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 核心绩效指标 */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="总收益率"
          value={loading ? '--' : formatPct(overview?.total_return)}
          sub={`初始资金 ${formatMoney(overview?.initial_capital)}`}
          icon={TrendingUp}
          tone={isProfit ? 'profit' : 'loss'}
          loading={loading}
        />
        <MetricCard
          title="年化收益"
          value={loading ? '--' : formatPct(overview?.annual_return)}
          sub="复利年化口径"
          icon={Activity}
          tone={(overview?.annual_return ?? 0) >= 0 ? 'profit' : 'loss'}
          loading={loading}
        />
        <MetricCard
          title="夏普比率"
          value={loading ? '--' : formatNum(overview?.sharpe_ratio, 4)}
          sub="风险调整后收益"
          icon={BarChart2}
          tone={(overview?.sharpe_ratio ?? 0) >= 1 ? 'profit' : 'warning'}
          loading={loading}
        />
        <MetricCard
          title="持仓市值"
          value={loading ? '--' : formatMoney(overview?.position_value)}
          sub={`${overview?.position_count ?? 0} 个活跃仓位`}
          icon={Layers}
          tone="primary"
          loading={loading}
        />
      </section>

      {/* 大盘指数与市场热度 */}
      <section className="grid gap-4 lg:grid-cols-[1.6fr_0.8fr]">
        <div className="quant-card p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="quant-kicker">Market Indices</p>
              <h3 className="mt-2 text-xl font-semibold">大盘指数</h3>
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              实时
            </span>
          </div>
          {indicesLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-white/5" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {marketIndices?.map((index) => {
                const isUp = index.changePercent >= 0;
                return (
                  <div key={index.code} className="rounded-xl border border-white/6 bg-white/3 p-3 transition-all hover:border-white/10 hover:bg-white/5">
                    <div className="text-xs font-medium text-white/70">{index.name}</div>
                    <div className="mt-2 text-lg font-semibold text-white">{index.price.toFixed(2)}</div>
                    <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${isUp ? 'text-profit' : 'text-loss'}`}>
                      {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {formatPct(index.changePercent)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="quant-card p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="quant-kicker">Market Sentiment</p>
              <h3 className="mt-2 text-xl font-semibold">市场热度</h3>
            </div>
            <Flame className={`h-5 w-5 ${
              marketHeat?.heatLevel === 'VERY_HIGH' ? 'text-red-500' :
              marketHeat?.heatLevel === 'HIGH' ? 'text-orange-500' :
              marketHeat?.heatLevel === 'MEDIUM' ? 'text-amber-500' : 'text-green-500'
            }`} />
          </div>
          {heatLoading ? (
            <div className="space-y-3">
              <div className="h-8 animate-pulse rounded bg-white/5" />
              <div className="h-16 animate-pulse rounded bg-white/5" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">热度评分</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (marketHeat?.heatScore || 0) >= 80 ? 'bg-red-500' :
                        (marketHeat?.heatScore || 0) >= 60 ? 'bg-orange-500' :
                        (marketHeat?.heatScore || 0) >= 40 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${marketHeat?.heatScore || 0}%` }}
                    />
                  </div>
                  <span className={`text-sm font-semibold ${
                    (marketHeat?.heatScore || 0) >= 80 ? 'text-red-400' :
                    (marketHeat?.heatScore || 0) >= 60 ? 'text-orange-400' :
                    (marketHeat?.heatScore || 0) >= 40 ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {marketHeat?.heatScore || 0}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-red-500/10 p-2 text-red-400">上涨 {marketHeat?.advanceCount || 0}</div>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">下跌 {marketHeat?.declineCount || 0}</div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">涨停/跌停</span>
                <span className="font-medium">
                  <span className="text-red-400">{marketHeat?.limitUpCount || 0}</span>
                  <span className="mx-1 text-white/40">/</span>
                  <span className="text-green-400">{marketHeat?.limitDownCount || 0}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 资金流向与热点板块 */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="quant-card p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="quant-kicker">Capital Flow</p>
              <h3 className="mt-2 text-xl font-semibold">资金流向</h3>
            </div>
            <Wallet className={`h-5 w-5 ${(capitalFlow?.totalNetInflow || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          {flowLoading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded bg-white/5" />
              <div className="h-16 animate-pulse rounded bg-white/5" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">主力净流入</span>
                <div className={`text-lg font-semibold ${(capitalFlow?.totalNetInflow || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(capitalFlow?.totalNetInflow || 0) > 0 ? '+' : ''}{formatMoney(capitalFlow?.totalNetInflow || 0)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <div className="text-blue-400">大单</div>
                  <div className={`mt-1 font-semibold ${(capitalFlow?.bigOrderNetInflow || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatMoney(capitalFlow?.bigOrderNetInflow || 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-purple-500/10 p-2">
                  <div className="text-purple-400">中单</div>
                  <div className={`mt-1 font-semibold ${(capitalFlow?.mediumOrderNetInflow || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatMoney(capitalFlow?.mediumOrderNetInflow || 0)}
                  </div>
                </div>
                <div className="rounded-lg bg-gray-500/10 p-2">
                  <div className="text-gray-400">小单</div>
                  <div className={`mt-1 font-semibold ${(capitalFlow?.smallOrderNetInflow || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatMoney(capitalFlow?.smallOrderNetInflow || 0)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">流入/流出家数</span>
                <span className="font-medium">
                  <span className="text-emerald-400">{capitalFlow?.inflowCount || 0}</span>
                  <span className="mx-1 text-white/40">/</span>
                  <span className="text-red-400">{capitalFlow?.outflowCount || 0}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="quant-card p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="quant-kicker">Hot Sectors</p>
              <h3 className="mt-2 text-xl font-semibold">热点板块</h3>
            </div>
            <Award className="h-5 w-5 text-amber-400" />
          </div>
          {sectorsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {hotSectors?.slice(0, 5).map((sector, idx) => (
                <div key={sector.sector} className="flex items-center justify-between rounded-lg border border-white/6 bg-white/3 p-2 transition-all hover:bg-white/5">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                      idx === 0 ? 'bg-amber-500 text-white' :
                      idx === 1 ? 'bg-gray-400 text-white' :
                      idx === 2 ? 'bg-orange-600 text-white' : 'bg-white/10 text-white/60'
                    }`}>{idx + 1}</div>
                    <div>
                      <div className="text-xs font-medium">{sector.sector}</div>
                      <div className="text-[10px] text-muted-foreground">{sector.stockCount}只股票</div>
                    </div>
                  </div>
                  <div className={`text-right ${sector.avgChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <div className="text-sm font-semibold">{formatPct(sector.avgChangePercent)}</div>
                    {sector.heatLevel === 'VERY_HOT' && <div className="text-[9px] text-amber-400">🔥 极热</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 净值曲线 + 回撤 + 资金状态 */}
      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="quant-card p-5">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="quant-kicker">Performance Curve</p>
              <h3 className="mt-2 text-xl font-semibold">策略净值与基准对照</h3>
              <p className="mt-1 text-sm text-muted-foreground">同屏对比策略净值与基准走势，观察超额收益来源和阶段性偏离。</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="h-2 w-8 rounded-full bg-[oklch(0.61_0.18_251)]" />
                策略
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2 w-8 rounded-full bg-[rgba(245,158,11,0.7)]" />
                基准
              </span>
            </div>
          </div>
          {loading ? (
            <div className="h-[280px] animate-pulse rounded-2xl bg-white/5" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.61 0.18 251)" stopOpacity={0.38} />
                    <stop offset="95%" stopColor="oklch(0.61 0.18 251)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'oklch(0.66 0.012 245)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'oklch(0.66 0.012 245)' }} tickLine={false} axisLine={false} tickFormatter={(value) => value.toFixed(2)} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={1} stroke="oklch(1 0 0 / 0.16)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="nav" name="策略净值" stroke="oklch(0.61 0.18 251)" strokeWidth={2.5} fill="url(#navFill)" dot={false} />
                <Line type="monotone" dataKey="benchmark" name="基准净值" stroke="rgba(245,158,11,0.8)" strokeWidth={1.8} dot={false} strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="space-y-4">
          <div className="quant-card p-5">
            <p className="quant-kicker">Risk Surface</p>
            <h3 className="mt-2 text-xl font-semibold">回撤监测</h3>
            <p className="mt-1 text-sm text-muted-foreground">峰值回撤追踪用于识别策略失稳阶段与风险聚集区间。</p>
            <div className="mt-4">
              {loading ? (
                <div className="h-[210px] animate-pulse rounded-2xl bg-white/5" />
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={drawdownData} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'oklch(0.66 0.012 245)' }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'oklch(0.66 0.012 245)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine
                      y={-0.2}
                      stroke="rgba(245,158,11,0.65)"
                      strokeDasharray="4 4"
                      label={{ value: '风控线', fill: 'oklch(0.79 0.16 81)', fontSize: 10 }}
                    />
                    <Line type="monotone" dataKey="drawdown" name="回撤" stroke="var(--loss)" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="quant-card p-5">
            <p className="quant-kicker">Capital Snapshot</p>
            <h3 className="mt-2 text-xl font-semibold">资金状态</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="terminal-stat">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4 text-primary" />
                  总资产
                </div>
                <div className="metric-value mt-2 text-2xl font-semibold">{loading ? '--' : formatMoney(overview?.total_asset)}</div>
              </div>
              <div className="terminal-stat">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target className="h-4 w-4 text-profit" />
                  可用现金
                </div>
                <div className="metric-value mt-2 text-2xl font-semibold">{loading ? '--' : formatMoney(overview?.available_cash)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
