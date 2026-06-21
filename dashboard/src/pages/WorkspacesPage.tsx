import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, FilmIcon, LayoutGrid, Plus, Table as TableIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import {
  CreateDialog,
  DeleteDialog,
  RenameDialog,
  StageDots,
  WorkspaceCard,
  WorkspaceMenu
} from '@/components/WorkspaceUI';
import { cn, relativeTime } from '@/lib/utils';
import { useDuplicateWorkspace, useWorkspaces } from '@/lib/queries';
import type { WorkspaceSummary } from '@/lib/types';

type View = 'table' | 'card';
const VIEW_KEY = 'shorts-workspaces-view';

export function WorkspacesPage() {
  const navigate = useNavigate();
  const { data: workspaces, isLoading } = useWorkspaces();

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<WorkspaceSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceSummary | null>(null);
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
    const list = workspaces ?? [];
    const completed = list.filter((w) => w.stages.upload.status === 'completed').length;
    return { total: list.length, completed, pending: list.length - completed };
  }, [workspaces]);

  const open = (id: string) => navigate(`/w/${id}/script`);

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-muted-foreground">Every short video project lives here.</p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New Workspace
        </Button>
      </div>

      {/* Stat cards */}
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={counts.total} icon={<FilmIcon className="size-4" />} />
        <StatCard label="Completed" value={counts.completed} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Pending" value={counts.pending} icon={<Clock className="size-4" />} />
      </div>

      {/* Toolbar */}
      <div className="mb-4 mt-9 flex items-center justify-between">
        <h2 className="text-lg font-bold">All workspaces</h2>
        <div className="inline-flex items-center rounded-lg border border-border p-0.5">
          <ViewButton active={view === 'table'} onClick={() => setView('table')} icon={<TableIcon className="size-4" />} label="Table" />
          <ViewButton active={view === 'card'} onClick={() => setView('card')} icon={<LayoutGrid className="size-4" />} label="Cards" />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-36 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : (workspaces?.length ?? 0) === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces!.map((w) => (
            <WorkspaceCard
              key={w.id}
              w={w}
              onOpen={() => open(w.id)}
              onRename={() => setRenameTarget(w)}
              onDelete={() => setDeleteTarget(w)}
            />
          ))}
        </div>
      ) : (
        <WorkspaceTable
          rows={workspaces!}
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

function WorkspaceTable({
  rows,
  onOpen,
  onRename,
  onDelete
}: {
  rows: WorkspaceSummary[];
  onOpen: (id: string) => void;
  onRename: (w: WorkspaceSummary) => void;
  onDelete: (w: WorkspaceSummary) => void;
}) {
  const duplicate = useDuplicateWorkspace();
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
                  <WorkspaceMenu
                    onOpen={() => onOpen(w.id)}
                    onRename={() => onRename(w)}
                    onDelete={() => onDelete(w)}
                    onDuplicate={() =>
                      toast.promise(duplicate.mutateAsync(w.id), {
                        loading: 'Duplicating…',
                        success: 'Workspace duplicated',
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
          <p className="text-base font-semibold">No workspaces yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first short video project to get started.
          </p>
        </div>
        <Button variant="primary" onClick={onCreate}>
          <Plus className="size-4" /> New Workspace
        </Button>
      </CardContent>
    </Card>
  );
}
