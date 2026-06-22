import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  RefreshCw,
  ThumbsUp,
  TrendingUp,
  Users,
  Youtube
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { api } from '@/lib/api';
import { cn, formatCompact, formatDurationSec, formatWatchTime } from '@/lib/utils';
import {
  useAnalyticsOverview,
  useAnalyticsStatus,
  useAnalyticsTimeseries,
  useAnalyticsTop,
  useAnalyticsVideos,
  useRefreshAnalytics
} from '@/lib/queries';
import type {
  AnalyticsRange,
  AnalyticsStatus,
  KpiCard as KpiCardT,
  VideoAnalyticsRow
} from '@/lib/types';

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '365d', label: '365D' },
  { id: 'lifetime', label: 'Lifetime' }
];

function isReauth<T>(d: T | { needsReauth: true } | undefined): d is { needsReauth: true } {
  return !!d && typeof d === 'object' && (d as any).needsReauth === true;
}

export function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data: status, isLoading: statusLoading } = useAnalyticsStatus();
  const refresh = useRefreshAnalytics();

  const ready = !!status?.configured && !status?.needsReauth;
  const overviewQ = useAnalyticsOverview(range, ready);
  const seriesQ = useAnalyticsTimeseries(range, ready);
  const topQ = useAnalyticsTop(range, ready);

  // A data endpoint can independently report a scope problem (HTTP 200 reauth).
  const dataReauth = isReauth(overviewQ.data) || isReauth(seriesQ.data) || isReauth(topQ.data);
  const needsReauth = !!status?.needsReauth || dataReauth;

  const onRefresh = async () => {
    try {
      await refresh.mutateAsync();
      toast.success('Analytics refreshed');
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            {ready && overviewQ.data && !isReauth(overviewQ.data)
              ? `${overviewQ.data.channel.title} — channel command center`
              : 'Performance insights across your shorts.'}
          </p>
        </div>
        {ready && !needsReauth && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    range === r.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refresh.isPending}>
              <RefreshCw className={cn('size-4', refresh.isPending && 'animate-spin')} /> Refresh
            </Button>
          </div>
        )}
      </div>

      {statusLoading ? (
        <Loading />
      ) : !status?.configured ? (
        <NotConnected status={status} />
      ) : needsReauth ? (
        <NeedsReauthCard status={status} />
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          <KpiGrid q={overviewQ} />
          <GrowthSection q={seriesQ} />
          <TopSection q={topQ} />
          <VideoTableSection range={range} />
        </div>
      )}
    </div>
  );
}

// ── States ──────────────────────────────────────────────────────────────────
function Loading() {
  return (
    <div className="mt-24 flex items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" /> Loading analytics…
    </div>
  );
}

function NotConnected({ status }: { status?: AnalyticsStatus }) {
  return (
    <Card className="mt-8 border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <Youtube className="size-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-base font-semibold">YouTube not connected</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Connect your channel to mint a refresh token, then paste it into <code>.env</code> as{' '}
            <code>GOOGLE_REFRESH_TOKEN</code> and restart the server.
          </p>
        </div>
        <ConnectYouTube status={status} />
      </CardContent>
    </Card>
  );
}

function NeedsReauthCard({ status }: { status?: AnalyticsStatus }) {
  return (
    <Card className="mt-8 border-amber-500/30">
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/15">
          <TrendingUp className="size-7 text-amber-500" />
        </div>
        <div>
          <p className="text-base font-semibold">Connect analytics access</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
            {status?.message ?? 'Your YouTube token can upload but can’t read analytics yet.'} Reconnect
            to grant <code>youtube.readonly</code> + <code>yt-analytics.readonly</code>, then update{' '}
            <code>GOOGLE_REFRESH_TOKEN</code> in <code>.env</code> and restart.
          </p>
        </div>
        <ConnectYouTube status={status} />
      </CardContent>
    </Card>
  );
}

function ConnectYouTube({ status }: { status?: AnalyticsStatus }) {
  const [token, setToken] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => () => stop(), []);

  const connect = () => {
    setToken(null);
    window.open('/api/analytics/oauth/start', 'yt-oauth', 'width=520,height=700');
    setWaiting(true);
    stop();
    let tries = 0;
    timer.current = window.setInterval(async () => {
      tries += 1;
      try {
        const r = await api.analyticsOauthResult();
        if (r.refreshToken) {
          setToken(r.refreshToken);
          setWaiting(false);
          stop();
          toast.success('YouTube connected — copy your token below');
        }
      } catch {
        /* keep polling */
      }
      if (tries > 150) {
        stop();
        setWaiting(false);
      } // ~5 min cap
    }, 2000);
  };

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard?.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — select and copy manually.');
    }
  };

  if (status && !status.hasClient) {
    return (
      <p className="max-w-md text-xs text-muted-foreground">
        Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to <code>.env</code>{' '}
        first (then restart) — they’re required to start the connect flow.
      </p>
    );
  }

  if (token) {
    return (
      <div className="flex w-full max-w-lg flex-col gap-2 text-left">
        <p className="text-sm font-medium text-emerald-500">
          Connected! Copy this refresh token into your <code>.env</code>:
        </p>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={token}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
          />
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? (
              <>
                <Check className="size-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="size-4" /> Copy
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Set <code>GOOGLE_REFRESH_TOKEN=&lt;this value&gt;</code> in <code>.env</code>, then restart
          the server.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="primary" size="sm" onClick={connect} disabled={waiting}>
        {waiting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Waiting for Google…
          </>
        ) : (
          <>
            <Youtube className="size-4" /> Connect YouTube
          </>
        )}
      </Button>
      {status?.redirectUri && (
        <p className="max-w-md text-center text-[11px] text-muted-foreground">
          If Google shows <code>redirect_uri_mismatch</code>, add{' '}
          <code>{status.redirectUri}</code> to your OAuth client’s redirect URIs.
        </p>
      )}
    </div>
  );
}

// ── KPI cards ─────────────────────────────────────────────────────────────────
function formatKpi(c: KpiCardT): string {
  if (c.unit === '%') return `${c.value}%`;
  if (c.unit === 'min') return formatWatchTime(c.value);
  return formatCompact(c.value);
}

function KpiGrid({ q }: { q: ReturnType<typeof useAnalyticsOverview> }) {
  if (q.isLoading) return <SkeletonGrid n={9} />;
  const data = q.data;
  if (!data || isReauth(data)) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {data.cards.map((c) => (
        <KpiCard key={c.key} card={c} />
      ))}
    </div>
  );
}

function KpiCard({ card }: { card: KpiCardT }) {
  const up = card.delta != null && card.delta >= 0;
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {card.label}
        </span>
        <span className="text-2xl font-bold tracking-tight">{formatKpi(card)}</span>
        {card.delta == null ? (
          <span className="text-xs text-muted-foreground">vs previous period</span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              up ? 'text-emerald-500' : 'text-destructive'
            )}
          >
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(card.delta).toFixed(1)}%
            <span className="font-normal text-muted-foreground">vs prev</span>
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function SkeletonGrid({ n }: { n: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}

// ── Channel growth ──────────────────────────────────────────────────────────
type MetricKey = 'views' | 'subscribers' | 'likes' | 'watchTime' | 'engagement';
const METRICS: { key: MetricKey; label: string; icon: any }[] = [
  { key: 'views', label: 'Views', icon: Eye },
  { key: 'subscribers', label: 'Subscribers', icon: Users },
  { key: 'likes', label: 'Likes', icon: ThumbsUp },
  { key: 'watchTime', label: 'Watch Time', icon: TrendingUp },
  { key: 'engagement', label: 'Engagement', icon: TrendingUp }
];

function GrowthSection({ q }: { q: ReturnType<typeof useAnalyticsTimeseries> }) {
  const [metric, setMetric] = useState<MetricKey>('views');
  const data = q.data;
  const series = data && !isReauth(data) ? data.series : [];

  const config: ChartConfig = {
    [metric]: { label: METRICS.find((m) => m.key === metric)!.label, color: 'hsl(var(--chart-1))' }
  };

  const fmtVal = (v: number) =>
    metric === 'engagement'
      ? `${v.toFixed(1)}%`
      : metric === 'watchTime'
        ? formatWatchTime(v)
        : formatCompact(v);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Channel growth</h2>
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  metric === m.key
                    ? 'border-accent/50 bg-accent/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                <m.icon className="size-3.5" /> {m.label}
              </button>
            ))}
          </div>
        </div>

        {q.isLoading ? (
          <div className="h-[260px] animate-pulse rounded-lg bg-muted/40" />
        ) : series.length === 0 ? (
          <EmptyChart />
        ) : (
          <ChartContainer config={config} className="h-[260px]">
            <AreaChart data={series} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${metric})`} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={`var(--color-${metric})`} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
                tickFormatter={(d: string) => (d.length >= 10 ? d.slice(5) : d)}
              />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => fmtVal(v)} />
              <ChartTooltip content={<ChartTooltipContent valueFormatter={(v) => fmtVal(v)} />} />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={`var(--color-${metric})`}
                strokeWidth={2}
                fill={`url(#fill-${metric})`}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center">
      <p className="text-sm font-medium">No data in this range</p>
      <p className="text-xs text-muted-foreground">
        Try a longer range, or check back after more views.
      </p>
    </div>
  );
}

// ── Top performers ─────────────────────────────────────────────────────────
function TopSection({ q }: { q: ReturnType<typeof useAnalyticsTop> }) {
  const data = q.data;
  if (q.isLoading)
    return <div className="h-[220px] animate-pulse rounded-xl border border-border bg-muted/40" />;
  if (!data || isReauth(data)) return null;
  const lists: { title: string; rows: VideoAnalyticsRow[]; metric: (v: VideoAnalyticsRow) => string }[] = [
    { title: 'Top by views', rows: data.byViews, metric: (v) => `${formatCompact(v.views)} views` },
    { title: 'Top by retention', rows: data.byRetention, metric: (v) => `${v.retention.toFixed(1)}% retention` },
    { title: 'Top by subscribers', rows: data.bySubscribers, metric: (v) => `+${formatCompact(v.subscribersGained)} subs` },
    { title: 'Top by engagement', rows: data.byEngagement, metric: (v) => `${v.engagementRate.toFixed(1)}% eng.` }
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {lists.map((l) => (
        <Card key={l.title}>
          <CardContent className="flex flex-col gap-2 p-4">
            <h3 className="text-sm font-semibold">{l.title}</h3>
            {l.rows.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No videos yet.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {l.rows.map((v, i) => (
                  <li key={v.videoId} className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}</span>
                    <Thumb row={v} className="h-9 w-16" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{v.title}</p>
                      <p className="text-[11px] text-muted-foreground">{l.metric(v)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Video performance table ─────────────────────────────────────────────────
const SORTS: { id: string; label: string }[] = [
  { id: 'views', label: 'Most viewed' },
  { id: 'subscribers', label: 'Most subscribers gained' },
  { id: 'retention', label: 'Highest retention' },
  { id: 'engagement', label: 'Highest engagement' },
  { id: 'watchTime', label: 'Most watch time' },
  { id: 'date', label: 'Newest' }
];

function VideoTableSection({ range }: { range: AnalyticsRange }) {
  const [sort, setSort] = useState('views');
  const [search, setSearch] = useState('');
  const q = useAnalyticsVideos(range, sort, search.trim() || undefined, true);
  const data = q.data;
  const rows = data && !isReauth(data) ? data.videos : [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Video performance</h2>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search videos…"
              className="h-9 w-48"
            />
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 w-52">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {q.isLoading ? (
          <div className="h-[200px] animate-pulse rounded-lg bg-muted/40" />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {search ? 'No videos match your search.' : 'No videos in this range yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Video</th>
                  <th className="px-2 py-2 text-right font-medium">Views</th>
                  <th className="px-2 py-2 text-right font-medium">Likes</th>
                  <th className="px-2 py-2 text-right font-medium">Comments</th>
                  <th className="px-2 py-2 text-right font-medium">Watch</th>
                  <th className="px-2 py-2 text-right font-medium">Avg dur.</th>
                  <th className="px-2 py-2 text-right font-medium">Retention</th>
                  <th className="px-2 py-2 text-right font-medium">Subs +</th>
                  <th className="px-2 py-2 text-right font-medium">Eng.</th>
                  <th className="py-2 pl-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.videoId} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <Thumb row={v} className="h-9 w-16" />
                        <div className="min-w-0 max-w-[260px]">
                          <p className="truncate font-medium">{v.title}</p>
                          {v.publishedAt && (
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(v.publishedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCompact(v.views)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCompact(v.likes)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCompact(v.comments)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatWatchTime(v.watchTime)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatDurationSec(v.avgViewDuration)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{v.retention.toFixed(1)}%</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCompact(v.subscribersGained)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{v.engagementRate.toFixed(1)}%</td>
                    <td className="py-2 pl-2">
                      <a
                        href={`https://youtu.be/${v.videoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-accent"
                        title="Open on YouTube"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Thumb({ row, className }: { row: VideoAnalyticsRow; className?: string }) {
  return (
    <span className={cn('shrink-0 overflow-hidden rounded bg-muted', className)}>
      {row.thumbnail ? (
        <img src={row.thumbnail} alt="" className="size-full object-cover" loading="lazy" />
      ) : null}
    </span>
  );
}
