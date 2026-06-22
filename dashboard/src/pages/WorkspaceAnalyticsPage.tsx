import {
  BarChart3,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquare,
  ThumbsUp,
  TrendingUp,
  UserPlus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TabHeader } from '@/components/TabHeader';
import { useWorkspaceAnalytics } from '@/lib/queries';
import { useWorkspaceCtx } from '@/layouts/WorkspaceLayout';
import { formatCompact, formatDurationSec, formatWatchTime } from '@/lib/utils';

function isReauth(d: any): d is { needsReauth: true } {
  return !!d && typeof d === 'object' && d.needsReauth === true;
}

export function WorkspaceAnalyticsPage() {
  const { id } = useWorkspaceCtx();
  const { data, isLoading } = useWorkspaceAnalytics(id);

  return (
    <div className="animate-fade-in">
      <TabHeader
        icon={BarChart3}
        title="Analytics"
        description="Performance of this workspace’s published video."
      />

      {isLoading ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Loading…
        </div>
      ) : isReauth(data) ? (
        <Note>
          Analytics access isn’t authorized yet. Reconnect YouTube with the analytics scopes (see the
          main Analytics page), then return here.
        </Note>
      ) : !data || data.published === false ? (
        <Note>This workspace hasn’t been published to YouTube yet. Publish it in the Video Uploader step to see analytics.</Note>
      ) : !data.video ? (
        <Note>Published, but no analytics data is available yet — check back once the video gathers views.</Note>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            {data.video.thumbnail && (
              <img
                src={data.video.thumbnail}
                alt=""
                className="h-16 w-28 shrink-0 rounded-lg border border-border object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{data.video.title}</p>
              <a
                href={data.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
              >
                {data.url} <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Metric icon={Eye} label="Views" value={formatCompact(data.video.views)} />
            <Metric icon={ThumbsUp} label="Likes" value={formatCompact(data.video.likes)} />
            <Metric icon={MessageSquare} label="Comments" value={formatCompact(data.video.comments)} />
            <Metric icon={UserPlus} label="Subscribers gained" value={formatCompact(data.video.subscribersGained)} />
            <Metric icon={TrendingUp} label="Watch time" value={formatWatchTime(data.video.watchTime)} />
            <Metric icon={TrendingUp} label="Avg view duration" value={formatDurationSec(data.video.avgViewDuration)} />
            <Metric icon={TrendingUp} label="Retention" value={`${data.video.retention.toFixed(1)}%`} />
            <Metric icon={TrendingUp} label="Engagement rate" value={`${data.video.engagementRate.toFixed(1)}%`} />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1.5 p-4">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </span>
        <span className="text-2xl font-bold tracking-tight">{value}</span>
      </CardContent>
    </Card>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-6 border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
          <BarChart3 className="size-6 text-muted-foreground" />
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{children}</p>
        <Button variant="outline" size="sm" asChild>
          <a href="/analytics">Open channel analytics</a>
        </Button>
      </CardContent>
    </Card>
  );
}
