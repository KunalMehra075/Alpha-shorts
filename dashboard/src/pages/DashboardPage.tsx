import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Eye, FilmIcon, LineChart, Plus, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { CreateDialog } from '@/components/ProjectUI';
import { relativeTime } from '@/lib/utils';
import { useStats, useProjects } from '@/lib/queries';
import type { ProjectSummary } from '@/lib/types';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const { data: stats } = useStats();
  const [createOpen, setCreateOpen] = useState(false);

  const recents = useMemo(() => (projects ?? []).slice(0, 5), [projects]);

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Your content-creation operating system — topic to upload, fast.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New Project
        </Button>
      </div>

      {/* Stats */}
      <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Projects" value={stats?.projects ?? projects?.length ?? 0} icon={<FilmIcon className="size-4" />} />
        <StatCard label="Videos Generated" value={stats?.videosGenerated ?? 0} icon={<FilmIcon className="size-4" />} />
        <StatCard label="Videos Uploaded" value={stats?.videosUploaded ?? 0} icon={<UploadCloud className="size-4" />} />
        <StatCard label="Total Views" value={stats?.totalViews ?? 0} icon={<Eye className="size-4" />} hint="placeholder" />
      </div>

      {/* Graphs (placeholders — real charts ship with Analytics) */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GraphPlaceholder title="Production over time" icon={<LineChart className="size-5" />} />
        <GraphPlaceholder title="Stage completion" icon={<BarChart3 className="size-5" />} />
      </div>

      {/* Recent + recently generated */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <RecentProjects items={recents} onOpen={(id) => navigate(`/w/${id}/script`)} />
        <RecentVideos />
      </div>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function GraphPlaceholder({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold">{title}</h3>
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 text-center text-muted-foreground">
          {icon}
          <p className="text-sm">Charts coming soon</p>
          <p className="text-xs">Lands with the Analytics page.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentProjects({
  items,
  onOpen
}: {
  items: ProjectSummary[];
  onOpen: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Recent Projects</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => onOpen(w.id)}
                  className="flex w-full items-center justify-between py-2.5 text-left hover:text-accent"
                >
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(w.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentVideos() {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Recently Generated Videos</h3>
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <FilmIcon className="size-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Rendered videos will appear here.</p>
        </div>
      </CardContent>
    </Card>
  );
}
