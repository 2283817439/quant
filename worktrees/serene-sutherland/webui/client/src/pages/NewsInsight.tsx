import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Newspaper, ExternalLink, RefreshCw, Sparkles, Tag } from 'lucide-react';

const KEYWORD_PRESETS = ['全部', 'AI', '量化', '新能源', '半导体', '医药', '消费', '金融'];

export default function NewsInsight() {
  const [activeKeyword, setActiveKeyword] = useState('全部');

  const keywords = activeKeyword === '全部' ? ['市场', '财联社', '行情'] : [activeKeyword];

  const { data: newsData, isLoading, refetch, isFetching } = trpc.ai.newsDigest.useQuery(
    { keywords },
    { refetchInterval: 300_000 }
  );

  const items = newsData?.items ?? [];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="hero-panel relative overflow-hidden rounded-[28px] px-6 py-6 lg:px-8 lg:py-7">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.1),transparent_55%)] lg:block" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="quant-kicker">Daily News Feed</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">财联社 · 每日新闻洞察</h1>
            <p className="mt-2 text-sm text-white/62">
              聚合财联社实时资讯，AI 提炼摘要，快速掌握市场动态与政策信号。
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-muted-foreground transition-all hover:bg-white/8 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </section>

      {/* 关键词筛选 */}
      <div className="flex flex-wrap gap-2">
        {KEYWORD_PRESETS.map((kw) => (
          <button
            key={kw}
            onClick={() => setActiveKeyword(kw)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              activeKeyword === kw
                ? 'border-primary/40 bg-primary/12 text-primary'
                : 'border-white/8 bg-white/3 text-muted-foreground hover:border-white/14 hover:text-foreground'
            }`}
          >
            <Tag className="h-3 w-3" />
            {kw}
          </button>
        ))}
      </div>

      {/* 新闻列表 */}
      <div className="quant-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-400" />
          <h3 className="text-xl font-semibold">今日资讯</h3>
          {!isLoading && (
            <span className="ml-auto text-xs text-muted-foreground">{items.length} 条</span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Newspaper className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">暂无新闻数据，请确认新闻服务已连接</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item: any) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-xl border border-white/6 bg-white/3 p-4 transition-all hover:border-white/10 hover:bg-white/5"
              >
                <Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  {item.summary && (
                    <div className="mt-1 text-xs leading-5 text-muted-foreground line-clamp-2">{item.summary}</div>
                  )}
                  <div className="mt-2 text-[11px] text-muted-foreground/60">
                    {new Date(item.timestamp).toLocaleString('zh-CN')}
                  </div>
                </div>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
