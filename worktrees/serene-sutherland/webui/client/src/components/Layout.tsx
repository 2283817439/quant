import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  BarChart2,
  Bell,
  Bot,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Database,
  DollarSign,
  FolderKanban,
  Gauge,
  GitBranch,
  HelpCircle,
  Inbox as InboxIcon,
  Layers,
  ListTodo,
  MonitorCog,
  Plug,
  Radar,
  ScanSearch,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserCircle2,
  Zap,
  Newspaper,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatMoney } from '@/lib/api';

type NavItem = {
  path?: string;
  icon: React.ElementType;
  label: string;
  desc: string;
  badge?: string;
  placeholder?: boolean;
};

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: '总览与执行',
    items: [
      { path: '/', icon: Gauge, label: '指挥总台', desc: '全局资产、绩效与联机状态', badge: 'Live' },
      { path: '/execution-monitor', icon: Activity, label: '执行监控', desc: '事件流、订单流与任务状态' },
      { path: '/trading', icon: Plug, label: '实盘接入', desc: '账户桥接、下单与撤单控制' },
      { path: '/news-insight', icon: Newspaper, label: '新闻洞察', desc: '财联社每日资讯与 AI 摘要', badge: 'New' },
      { path: '/ai-stock-picker', icon: Sparkles, label: 'AI 选股', desc: 'AI 智能选股与板块信号', badge: 'AI' },
    ],
  },
  {
    title: '研究与验证',
    items: [
      { path: '/strategy', icon: TrendingUp, label: '策略研究', desc: '策略参数、信号与运行日志' },
      { path: '/backtest', icon: BarChart2, label: '回测验证', desc: '收益曲线、归因与绩效评估' },
      { path: '/backtest-comparison', icon: Layers, label: '回测对比', desc: '多记录横向对比与分析', badge: 'New' },
      { path: '/optimization', icon: SlidersHorizontal, label: '参数优化', desc: '搜索空间与最优组合' },
      { path: '/parameter-scan', icon: ScanSearch, label: '参数扫描', desc: '批量实验与结果比较' },
      { path: '/benchmark', icon: Target, label: '基准对标', desc: '超额收益与基准跟踪' },
    ],
  },
  {
    title: '组合与风控',
    items: [
      { path: '/positions', icon: Briefcase, label: '持仓簿', desc: '仓位、盈亏与持仓暴露' },
      { path: '/portfolio', icon: Layers, label: '组合配置', desc: '策略权重与再平衡建议' },
      { path: '/risk', icon: ShieldAlert, label: '风险控制', desc: '约束阈值、告警与监控' },
      { path: '/history', icon: Radar, label: '历史追踪', desc: '交易记录与状态回放' },
      { path: '/data-management', icon: Database, label: '数据治理', desc: '行情、快照与数据任务' },
    ],
  },
  {
    title: 'AI 智能体',
    items: [
      { path: '/agents', icon: Bot, label: 'AI 管理', desc: 'Paperclip 智能体编排与监控', badge: 'AI' },
      { path: '/org-chart', icon: GitBranch, label: '组织架构', desc: 'Agent 层级关系图' },
      { path: '/goals', icon: Target, label: '目标管理', desc: '公司目标与任务对齐' },
      { path: '/projects', icon: FolderKanban, label: '项目管理', desc: '组织和管理项目任务' },
      { path: '/tasks', icon: ListTodo, label: '任务队列', desc: '任务创建、检出与执行状态' },
      { path: '/my-issues', icon: UserCircle2, label: '我的任务', desc: '分配给我的任务' },
      { path: '/inbox', icon: InboxIcon, label: '收件箱', desc: '通知和消息中心' },
      { path: '/audit', icon: Activity, label: '审计日志', desc: '活动追踪与系统事件' },
      { path: '/costs', icon: DollarSign, label: '成本追踪', desc: 'Token 使用与成本统计' },
    ],
  },
];

const SYSTEM_ITEMS: NavItem[] = [
  { icon: Settings, label: '系统设置', desc: 'QMT、数据库与服务配置', placeholder: true },
  { icon: HelpCircle, label: '帮助中心', desc: '使用指南与架构文档', placeholder: true },
];

function formatServerTimestamp(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  const h = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  const s = `${date.getSeconds()}`.padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${minute}:${s}`;
}

function formatChangePercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return '--';
  }
  const fixed = value.toFixed(2);
  return `${value >= 0 ? '+' : ''}${fixed}%`;
}


interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { data: accounts, isLoading: accountsLoading } = trpc.trading.getAccounts.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: marketIndices, isLoading: indicesLoading } = trpc.trading.getMarketIndices.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: serverTimeData } = trpc.system.serverTime.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const [serverClock, setServerClock] = useState<string>('--');
  const [serverTimezone, setServerTimezone] = useState<string>('');

  useEffect(() => {
    if (!serverTimeData) return;
    setServerTimezone(serverTimeData.timezone ?? '');
    const offset = Date.now() - serverTimeData.unixMillis;
    const updateClock = () => {
      const serverNow = new Date(Date.now() - offset);
      setServerClock(formatServerTimestamp(serverNow));
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [serverTimeData?.unixMillis, serverTimeData?.timezone]);

  const primaryAccount = useMemo(() => {
    if (!accounts?.length) return undefined;
    return accounts.find((acct) => acct.isConnected) ?? accounts[0];
  }, [accounts]);

  const accountSummary = useMemo(() => {
    if (!primaryAccount) {
      return null;
    }
    return {
      total: Number(primaryAccount.totalAssets ?? 0),
      available: Number(primaryAccount.availableCash ?? 0),
      status: primaryAccount.connectionStatus as string | undefined,
    };
  }, [primaryAccount]);

  const accountLabel = accountsLoading
    ? 'Loading trading accounts...'
    : primaryAccount
      ? `${primaryAccount.accountName} / ${primaryAccount.accountType.toUpperCase()}`
      : 'No live trading account configured';

  const isSystemLive = accountSummary?.status === 'connected';

  const marketHighlights = useMemo(() => {
    if (!marketIndices?.length) return [];
    return marketIndices.slice(0, 3).map((item) => ({
      code: item.code,
      label: item.name,
      tone: item.changePercent > 0 ? 'profit' : item.changePercent < 0 ? 'loss' : 'neutral',
      value: formatChangePercent(item.changePercent),
    }));
  }, [marketIndices]);

  const current = useMemo(() => {
    // 首先检查所有导航组
    for (const group of NAV_GROUPS) {
      const match = group.items.find((item) => item.path === location);
      if (match) return match;
    }
    // 检查系统级页面 (设置、帮助中心等)
    const systemPage = SYSTEM_ITEMS.find((item) => {
      if (item.label === '系统设置' && location === '/settings') return true;
      if (item.label === '帮助中心' && location === '/help') return true;
      return false;
    });
    if (systemPage) {
      return { ...systemPage, path: location };
    }
    return undefined;
  }, [location]);

  const breadcrumb = useMemo(() => {
    if (!current) {
      // 如果找不到当前页面，默认显示首页
      return ['首页', '量化交易平台'];
    }
    
    // 尝试找到当前页面所属的组
    const activeGroup = NAV_GROUPS.find((group) => group.items.some((item) => item.path === location));
    if (activeGroup) {
      return ['首页', activeGroup.title, current.label];
    }
    
    // 对于系统级页面，使用不同的面包屑
    if (location === '/settings') {
      return ['首页', '系统设置'];
    }
    if (location === '/help') {
      return ['首页', '帮助中心'];
    }
    
    // 默认情况
    return ['首页', current.label];
  }, [current, location]);

  return (
    <div className="quant-shell flex min-h-screen bg-background text-foreground">
      <aside
        className="quant-sidebar sticky top-0 flex h-screen shrink-0 flex-col border-r border-white/6 transition-all duration-300"
        style={{ width: collapsed ? 88 : 240 }}
      >
        <div className="border-b border-white/6 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_28px_oklch(0.61_0.18_251_/_0.18)]">
              <MonitorCog className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="quant-kicker">Elite Fund Console</p>
                <h1 className="truncate text-base font-semibold">量化交易平台</h1>
                <p className="mt-1 text-xs text-muted-foreground">研究、回测、实盘一体化中枢</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <section key={group.title}>
              {!collapsed && (
                <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/65">
                  {group.title}
                </div>
              )}
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const isActive = item.path === location;
                  return (
                    <Link key={item.label} href={item.path ?? '#'}>
                      <div
                        className={`group flex items-center gap-3 rounded-2xl px-3 py-3 transition-all ${
                          isActive
                            ? 'bg-primary/12 text-white shadow-[inset_0_0_0_1px_oklch(0.61_0.18_251_/_0.3),0_12px_28px_oklch(0.61_0.18_251_/_0.12)]'
                            : 'text-muted-foreground hover:bg-white/4 hover:text-foreground'
                        }`}
                        title={collapsed ? `${item.label} | ${item.desc}` : undefined}
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                            isActive ? 'border-primary/35 bg-primary/12 text-primary' : 'border-white/6 bg-white/3 text-muted-foreground'
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                        </div>
                        {!collapsed && (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{item.label}</span>
                              {item.badge && (
                                <span className="rounded-full border border-red-400/20 bg-red-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="truncate pt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-white/6 px-3 py-3">
          <div className="space-y-1.5">
            {SYSTEM_ITEMS.map((item) => {
              const handleClick = () => {
                if (item.label === '系统设置') {
                  navigate('/settings');
                } else if (item.label === '帮助中心') {
                  navigate('/help');
                }
              };
              
              return (
                <button
                  key={item.label}
                  onClick={handleClick}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-muted-foreground transition-all hover:bg-white/4 hover:text-foreground"
                  title={collapsed ? `${item.label} | ${item.desc}` : undefined}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/6 bg-white/3">
                    <item.icon className="h-4 w-4" />
                  </div>
                  {!collapsed && (
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCollapsed((value) => !value)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/3 px-3 py-3 text-xs font-medium text-muted-foreground transition-all hover:bg-white/6 hover:text-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span>收起导航</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/6 bg-background/76 px-5 py-4 backdrop-blur-xl lg:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{breadcrumb.join(' / ')}</div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold">{current?.label ?? '量化交易平台'}</h2>
                <span className="glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
                  <span className={`status-dot ${isSystemLive ? 'status-dot-live pulse-dot' : 'status-dot-warn'}`} />
                  {isSystemLive ? '实盘在线' : '离线'}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{current?.desc ?? '统一管理策略生命周期、账户状态与市场数据。'}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:items-stretch">
              {primaryAccount ? (
                <div className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent px-5 py-4 text-left shadow-[0_12px_40px_rgba(16,185,129,0.16)]">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                    <Zap className="h-4 w-4" />
                    当前实盘账户
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white truncate">{primaryAccount.accountName}</div>
                  <div className="mt-1 text-xs text-emerald-200/80">
                    账户类型：{primaryAccount.accountType?.toUpperCase() ?? '--'} | 状态：
                    <span className="ml-1 font-medium text-emerald-200">
                      {primaryAccount.isConnected ? '已连接' : primaryAccount.connectionStatus ?? '未知'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/85">
                    <span>
                      总资产：
                      <span className="ml-1 font-semibold text-white">
                        {formatMoney(accountSummary?.total ?? Number(primaryAccount.totalAssets ?? 0))}
                      </span>
                    </span>
                    <span>
                      可用资金：
                      <span className="ml-1 font-semibold text-white">
                        {formatMoney(accountSummary?.available ?? Number(primaryAccount.availableCash ?? 0))}
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="glass-pill rounded-2xl px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">当前账户</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                    <UserCircle2 className="h-4 w-4 text-primary" />
                    {accountLabel}
                  </div>
                  {!accountsLoading && (
                    <div className="mt-1 text-xs text-muted-foreground">通过实盘接入配置账户</div>
                  )}
                </div>
              )}

              <div className="glass-pill rounded-2xl px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">市场快照</div>
                {indicesLoading ? (
                  <div className="mt-1 text-xs text-muted-foreground">Fetching market data...</div>
                ) : marketHighlights.length ? (
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                    {marketHighlights.map((item) => (
                      <span key={item.code} className="inline-flex items-center gap-1.5">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span
                          className={
                            item.tone === 'profit'
                              ? 'metric-value text-profit'
                              : item.tone === 'loss'
                                ? 'metric-value text-loss'
                                : 'metric-value text-foreground'
                          }
                        >
                          {item.value}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">No real-time market data</div>
                )}
              </div>

              <div className="glass-pill rounded-2xl px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">系统时间</div>
                <div className="mt-1 text-sm font-medium">{serverClock}</div>
                {serverTimezone && (
                  <div className="text-[11px] text-muted-foreground">{serverTimezone}</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toast.info('No new system alerts')}
                  className="glass-pill relative rounded-2xl p-3 text-muted-foreground transition-all hover:text-foreground"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-warning" />
                </button>
                <button
                  onClick={() => navigate('/help')}
                  className="glass-pill rounded-2xl p-3 text-muted-foreground transition-all hover:text-foreground"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
