import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  FilmIcon,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { StatusDot } from '@/components/StatusBadge';
import { relativeTime } from '@/lib/utils';
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useDuplicateWorkspace,
  useStats,
  useUpdateWorkspace,
  useWorkspaces
} from '@/lib/queries';
import { STAGE_TABS, type Language, type WorkspaceSummary } from '@/lib/types';

export function HomePage() {
  const navigate = useNavigate();
  const { data: workspaces, isLoading } = useWorkspaces();
  const { data: stats } = useStats();

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<WorkspaceSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceSummary | null>(null);

  const recents = useMemo(() => (workspaces ?? []).slice(0, 5), [workspaces]);

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Alpha Shorts Studio</h1>
          <p className="mt-1 text-muted-foreground">
            Your content-creation operating system — topic to upload, fast.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New Workspace
        </Button>
      </div>

      {/* Stats */}
      <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Workspaces" value={stats?.workspaces ?? workspaces?.length ?? 0} icon={<FilmIcon className="size-4" />} />
        <StatCard label="Videos Generated" value={stats?.videosGenerated ?? 0} icon={<FilmIcon className="size-4" />} />
        <StatCard label="Videos Uploaded" value={stats?.videosUploaded ?? 0} icon={<UploadCloud className="size-4" />} />
        <StatCard label="Total Views" value={stats?.totalViews ?? 0} icon={<Eye className="size-4" />} hint="placeholder" />
      </div>

      {/* Workspaces */}
      <section className="mt-9">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Workspaces</h2>
          <span className="text-sm text-muted-foreground">
            {workspaces?.length ?? 0} total
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="h-36 animate-pulse bg-muted/40" />
            ))}
          </div>
        ) : (workspaces?.length ?? 0) === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces!.map((w) => (
              <WorkspaceCard
                key={w.id}
                w={w}
                onOpen={() => navigate(`/w/${w.id}/script`)}
                onRename={() => setRenameTarget(w)}
                onDelete={() => setDeleteTarget(w)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent + recently generated */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <RecentProjects items={recents} onOpen={(id) => navigate(`/w/${id}/script`)} />
        <RecentVideos />
      </div>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  hint
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-sm">{label}</span>
          {icon}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight">{value}</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceCard({
  w,
  onOpen,
  onRename,
  onDelete
}: {
  w: WorkspaceSummary;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const duplicate = useDuplicateWorkspace();
  return (
    <Card className="group transition-colors hover:border-accent/40">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onOpen} className="min-w-0 flex-1 text-left">
            <h3 className="truncate text-base font-semibold group-hover:text-accent">
              {w.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Updated {relativeTime(w.updatedAt)}
            </p>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpen}>
                <Eye /> Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  toast.promise(duplicate.mutateAsync(w.id), {
                    loading: 'Duplicating…',
                    success: 'Workspace duplicated',
                    error: (e) => String(e.message ?? e)
                  })
                }
              >
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Stage progress dots */}
        <div className="mt-auto flex items-center gap-3">
          {STAGE_TABS.map((t) => (
            <div key={t.key} className="flex items-center gap-1.5" title={`${t.label}: ${w.stages[t.key].status}`}>
              <StatusDot status={w.stages[t.key].status} />
            </div>
          ))}
          <span className="ml-auto text-xs uppercase tracking-wide text-muted-foreground">
            {w.language}
          </span>
        </div>

        <Button variant="secondary" size="sm" onClick={onOpen}>
          Open workspace
        </Button>
      </CardContent>
    </Card>
  );
}

function RecentProjects({
  items,
  onOpen
}: {
  items: WorkspaceSummary[];
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
          <p className="text-sm text-muted-foreground">
            Rendered videos will appear here (Phase 4).
          </p>
        </div>
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

// ── Dialogs ───────────────────────────────────────────────────────────────

function CreateDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<Language>('en');

  const submit = async () => {
    if (!name.trim()) return;
    try {
      const ws = await create.mutateAsync({ name: name.trim(), language });
      toast.success('Workspace created');
      onOpenChange(false);
      setName('');
      setLanguage('en');
      navigate(`/w/${ws.id}/script`);
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Workspace</DialogTitle>
          <DialogDescription>One workspace = one short video project.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              autoFocus
              placeholder="e.g. Dwarka Mystery"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ws-lang">Language</Label>
            <Select
              id="ws-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="bilingual">Bilingual</option>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  target,
  onClose
}: {
  target: WorkspaceSummary | null;
  onClose: () => void;
}) {
  const update = useUpdateWorkspace();
  const [name, setName] = useState('');

  // Sync local state when a new target opens.
  useEffect(() => {
    if (target) setName(target.name);
  }, [target]);

  const submit = async () => {
    if (!target || !name.trim()) return;
    try {
      await update.mutateAsync({ id: target.id, patch: { name: name.trim() } });
      toast.success('Renamed');
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  target,
  onClose
}: {
  target: WorkspaceSummary | null;
  onClose: () => void;
}) {
  const del = useDeleteWorkspace();
  const submit = async () => {
    if (!target) return;
    try {
      await del.mutateAsync(target.id);
      toast.success('Workspace deleted');
      onClose();
    } catch (e: any) {
      toast.error(String(e.message ?? e));
    }
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete workspace?</DialogTitle>
          <DialogDescription>
            “{target?.name}” and all its generated data will be permanently removed.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={del.isPending}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
