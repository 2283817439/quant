import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { formatPct, formatMoney } from '@/lib/api';
import {
  Sparkles, TrendingUp, ArrowUpRight, ArrowDownRight,
  Search, Send, RefreshCw, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

// 默认条件（与后端默认值对齐）
const DEFAULT_FILTERS = {
  min_turnover_rate: 1.0,
  min_volume_ratio: 0.8,
  main_board_only: true,
  exclude_st: true,
  require_yang: true,
  require_inflow: true,
  max_price: 15.0,
  min_float_mv: 6.0,
  max_float_mv: 50.0,
  kdj_j_gt_d: true,
  min_kdj_d: 25.0,
  max_limit_up_days: 2,
  top_n: 30,
};

const PRESET_QUESTION =
  '换手率>1%,量比>0.8,主板；龙头，非ST；阳线形态；近2日主力资金流入，吸筹，价升量涨形态；股价小于15元；流通市值大于6亿小于50亿；KDJ的J>D；KDJ(D值)>25；连续涨停天数<2日';

type StockResult = {
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
};

function KdjBadge({ k, d, j }: { k: number; d: number; j: number }) {
  const jGtD = j > d;
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="text-muted-foreground">K{k.toFixed(0)}</span>
      <span className="text-muted-foreground">D{d.toFixed(0)}</span>
      <span className={`font-semibold ${jGtD ? 'text-emerald-400' : 'text-red-400'}`}>J{j.toFixed(0)}</span>
    </div>
  );
}

export default function AIStockPicker() {
  const [question, setQuestion] = useState(PRESET_QUESTION);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [aiAnswer, setAiAnswer] = useState('');
  const [stocks, setStocks] = useState<StockResult[]>([]);
  const [mode, setMode] = useState<'chat' | 'direct'>('chat');

  // 文字提问选股
  const chatPickMut = trpc.ai.chatPick.useMutation({
    onSuccess(data) {
      setAiAnswer(data.answer);
      setStocks((data.stocks ?? []) as StockResult[]);
    },
  });

  // 直接条件选股
  const stockPickMut = trpc.trading.runStockPicker.useMutation({
    onSuccess(data) {
      setAiAnswer(`按条件筛选完成，共 ${data.length} 只标的。`);
      setStocks((data ?? []) as StockResult[]);
    },
  });

  const isLoading = chatPickMut.isPending || stockPickMut.isPending;

  function handleSubmit() {
    if (mode === 'chat') {
      chatPickMut.mutate({ question, filters });
    } else {
      stockPickMut.mutate(filters);
    }
  }

  function updateFilter<K extends keyof typeof DEFAULT_FILTERS>(key: K, val: (typeof DEFAULT_FILTERS)[K]) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="hero-panel relative overflow-hidden rounded-[28px] px-6 py-6 lg:px-8 lg:py-7">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08),transparent_55%)] lg:block" />
        <div className="relative">
          <p className="quant-kicker">AI Stock Picker</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">AI 智能选股</h1>
          <p className="mt-2 text-sm text-white/62">
            用自然语言描述选股条件，AI 解析意图并从全量 A 股中实时筛选标的。
          </p>
        </div>
      </section>

      {/* 模式切换 */}
      <div className="flex gap-2">
        {(['chat', 'direct'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-2xl border px-4 py-2 text-xs font-medium transition-all ${
              mode === m
                ? 'border-primary/40 bg-primary/12 text-primary'
                : 'border-white/8 bg-white/3 text-muted-foreground hover:border-white/14 hover:text-foreground'
            }`}
          >
            {m === 'chat' ? '💬 文字提问' : '⚙️ 条件筛选'}
          </button>
        ))}
      </div>

      {/* 文字提问框 */}
      {mode === 'chat' && (
        <div className="quant-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium">描述你的选股条件</span>
          </div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
            placeholder="例如：换手率>1%，量比>0.8，主板非ST，阳线，近2日主力流入，股价<15元..."
          />
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => setQuestion(PRESET_QUESTION)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              恢复默认条件
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !question.trim()}
              className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              开始选股
            </button>
          </div>
        </div>
      )}

      {/* 条件筛选面板 */}
      {mode === 'direct' && (
        <div className="quant-card p-5">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              量化筛选条件
            </span>
            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showFilters && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FilterNum label="换手率下限 (%)" value={filters.min_turnover_rate} onChange={(v) => updateFilter('min_turnover_rate', v)} step={0.1} />
              <FilterNum label="量比下限" value={filters.min_volume_ratio} onChange={(v) => updateFilter('min_volume_ratio', v)} step={0.1} />
              <FilterNum label="股价上限 (元)" value={filters.max_price} onChange={(v) => updateFilter('max_price', v)} step={1} />
              <FilterNum label="流通市值下限 (亿)" value={filters.min_float_mv} onChange={(v) => updateFilter('min_float_mv', v)} step={1} />
              <FilterNum label="流通市值上限 (亿)" value={filters.max_float_mv} onChange={(v) => updateFilter('max_float_mv', v)} step={1} />
              <FilterNum label="KDJ D值下限" value={filters.min_kdj_d} onChange={(v) => updateFilter('min_kdj_d', v)} step={1} />
              <FilterNum label="连续涨停天数上限" value={filters.max_limit_up_days} onChange={(v) => updateFilter('max_limit_up_days', v)} step={1} />
              <FilterNum label="返回数量" value={filters.top_n} onChange={(v) => updateFilter('top_n', v)} step={5} />
              <div className="flex flex-col gap-2">
                <FilterBool label="仅主板" value={filters.main_board_only} onChange={(v) => updateFilter('main_board_only', v)} />
                <FilterBool label="排除 ST" value={filters.exclude_st} onChange={(v) => updateFilter('exclude_st', v)} />
                <FilterBool label="要求阳线" value={filters.require_yang} onChange={(v) => updateFilter('require_yang', v)} />
                <FilterBool label="近2日主力流入" value={filters.require_inflow} onChange={(v) => updateFilter('require_inflow', v)} />
                <FilterBool label="J > D" value={filters.kdj_j_gt_d} onChange={(v) => updateFilter('kdj_j_gt_d', v)} />
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              开始筛选
            </button>
          </div>
        </div>
      )}

      {/* AI 回答 */}
      {aiAnswer && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-sm text-emerald-200">{aiAnswer}</p>
        </div>
      )}

      {/* 错误提示 */}
      {(chatPickMut.isError || stockPickMut.isError) && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">
            选股服务连接失败，请确认 Python 行情服务（端口 8081/8082）已启动。
          </p>
        </div>
      )}

      {/* 选股结果表格 */}
      {stocks.length > 0 && (
        <div className="quant-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              <h3 className="text-xl font-semibold">筛选结果</h3>
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              {stocks.length} 只标的
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="pb-3 text-left">代码 / 名称</th>
                  <th className="pb-3 text-right">现价</th>
                  <th className="pb-3 text-right">涨跌幅</th>
                  <th className="pb-3 text-right">换手率</th>
                  <th className="pb-3 text-right">量比</th>
                  <th className="pb-3 text-right">流通市值</th>
                  <th className="pb-3 text-right">KDJ</th>
                  <th className="pb-3 text-right">涨停天</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {stocks.map((s) => {
                  const isUp = s.changePercent >= 0;
                  return (
                    <tr key={s.code} className="transition-colors hover:bg-white/3">
                      <td className="py-3">
                        <div className="font-medium text-foreground">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.code}</div>
                      </td>
                      <td className="py-3 text-right font-semibold">{s.price.toFixed(2)}</td>
                      <td className={`py-3 text-right font-semibold ${isUp ? 'text-profit' : 'text-loss'}`}>
                        <span className="inline-flex items-center gap-0.5">
                          {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {formatPct(s.changePercent / 100)}
                        </span>
                      </td>
                      <td className="py-3 text-right text-muted-foreground">{s.turnoverRate.toFixed(2)}%</td>
                      <td className="py-3 text-right">
                        <span className={`font-medium ${s.volumeRatio >= 1.5 ? 'text-amber-400' : 'text-foreground'}`}>
                          {s.volumeRatio.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 text-right text-muted-foreground">{s.floatMv.toFixed(1)}亿</td>
                      <td className="py-3 text-right">
                        <KdjBadge k={s.kdjK} d={s.kdjD} j={s.kdjJ} />
                      </td>
                      <td className="py-3 text-right">
                        {s.limitUpDays > 0 ? (
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">{s.limitUpDays}天</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && stocks.length === 0 && !aiAnswer && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-20 text-center">
          <TrendingUp className="mb-3 h-10 w-10 text-emerald-400/30" />
          <p className="text-sm font-medium text-foreground">输入选股条件后点击开始</p>
          <p className="mt-1 text-xs text-muted-foreground">支持文字提问或直接调整量化参数</p>
        </div>
      )}
    </div>
  );
}

function FilterNum({ label, value, onChange, step }: {
  label: string; value: number; onChange: (v: number) => void; step: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
      />
    </div>
  );
}

function FilterBool({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <div
        onClick={() => onChange(!value)}
        className={`relative h-4 w-7 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-white/15'}`}
      >
        <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-3' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-muted-foreground">{label}</span>
    </label>
  );
}
