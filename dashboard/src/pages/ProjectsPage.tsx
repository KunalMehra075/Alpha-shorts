import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, FilmIcon, LayoutGrid, Plus, Search, Table as TableIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/StatCard';
import {
  CreateDialog,
  DeleteDialog,
  RenameDialog,
  StageDots,
  ProjectCard,
  ProjectMenu
} from '@/components/ProjectUI';
import { cn, relativeTime } from '@/lib/utils';
import { useDuplicateProject, useProjects } from '@/lib/queries';
import type { ProjectSummary } from '@/lib/types';

type View = 'table' | 'card';
const VIEW_KEY = 'shorts-projects-view';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: projects, isLoading } = useProjects();

  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'card' ? 'card' : 'table';
    } catch {
      return 'table';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const counts = useMemo(() => {
    const list = projects ?? [];
    const completed = list.filter((w) => w.stages.upload.status === 'completed').length;
    return { total: list.length, completed, pending: list.length - completed };
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects ?? [];
    return (projects ?? []).filter(
      (w) => w.name.toLowerCase().includes(q) || w.language.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const open = (id: string) => navigate(`/w/${id}/script`);

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Projects</h1>
          <p className="mt-1 text-muted-foreground">Every short video project lives here.</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New Project
        </Button>
      </div>

      {/* Stat cards */}
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={counts.total} icon={<FilmIcon className="size-4" />} />
        <StatCard label="Completed" value={counts.completed} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Pending" value={counts.pending} icon={<Clock className="size-4" />} />
      </div>

      {/* Toolbar */}
      <div className="mb-4 mt-9 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">All projects</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="h-9 w-56 pl-8"
            />
          </div>
          <div className="inline-flex items-center rounded-lg border border-border p-0.5">
            <ViewButton active={view === 'table'} onClick={() => setView('table')} icon={<TableIcon className="size-4" />} label="Table" />
            <ViewButton active={view === 'card'} onClick={() => setView('card')} icon={<LayoutGrid className="size-4" />} label="Cards" />
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-36 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : (projects?.length ?? 0) === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : filtered.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          No projects match “{search}”.
        </p>
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <ProjectCard
              key={w.id}
              w={w}
              onOpen={() => open(w.id)}
              onRename={() => setRenameTarget(w)}
              onDelete={() => setDeleteTarget(w)}
            />
          ))}
        </div>
      ) : (
        <ProjectTable
          rows={filtered}
          onOpen={open}
          onRename={setRenameTarget}
          onDelete={setDeleteTarget}
        />
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ProjectTable({
  rows,
  onOpen,
  onRename,
  onDelete
}: {
  rows: ProjectSummary[];
  onOpen: (id: string) => void;
  onRename: (w: ProjectSummary) => void;
  onDelete: (w: ProjectSummary) => void;
}) {
  const duplicate = useDuplicateProject();
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Language</th>
              <th className="px-3 py-3 font-medium">Progress</th>
              <th className="px-3 py-3 font-medium">Updated</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-5 py-3">
                  <button onClick={() => onOpen(w.id)} className="font-medium hover:text-accent">
                    {w.name}
                  </button>
                </td>
                <td className="px-3 py-3 uppercase text-muted-foreground">{w.language}</td>
                <td className="px-3 py-3">
                  <StageDots w={w} />
                </td>
                <td className="px-3 py-3 text-muted-foreground">{relativeTime(w.updatedAt)}</td>
                <td className="px-3 py-3 text-right">
                  <ProjectMenu
                    onOpen={() => onOpen(w.id)}
                    onRename={() => onRename(w)}
                    onDelete={() => onDelete(w)}
                    onDuplicate={() =>
                      toast.promise(duplicate.mutateAsync(w.id), {
                        loading: 'Duplicating…',
                        success: 'Project duplicated',
                        error: (e) => String(e.message ?? e)
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <FilmIcon className="size-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-base font-semibold">No projects yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first short video project to get started.
          </p>
        </div>
        <Button variant="primary" onClick={onCreate}>
          <Plus className="size-4" /> New Project
        </Button>
      </CardContent>
    </Card>
  );
}
