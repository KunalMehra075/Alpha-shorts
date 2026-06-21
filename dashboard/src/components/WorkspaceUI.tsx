import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Eye, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
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
  useUpdateWorkspace
} from '@/lib/queries';
import { STAGE_TABS, type Language, type WorkspaceSummary } from '@/lib/types';

// Shared row of stage progress dots used by both card and table views.
export function StageDots({ w }: { w: WorkspaceSummary }) {
  return (
    <div className="flex items-center gap-1.5">
      {STAGE_TABS.map((t) => (
        <span key={t.key} title={`${t.label}: ${w.stages[t.key].status}`}>
          <StatusDot status={w.stages[t.key].status} />
        </span>
      ))}
    </div>
  );
}

// Action menu reused by card and table rows.
export function WorkspaceMenu({
  onOpen,
  onRename,
  onDelete,
  onDuplicate
}: {
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
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
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkspaceCard({
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
            <h3 className="truncate text-base font-semibold group-hover:text-accent">{w.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Updated {relativeTime(w.updatedAt)}</p>
          </button>
          <WorkspaceMenu
            onOpen={onOpen}
            onRename={onRename}
            onDelete={onDelete}
            onDuplicate={() =>
              toast.promise(duplicate.mutateAsync(w.id), {
                loading: 'Duplicating…',
                success: 'Workspace duplicated',
                error: (e) => String(e.message ?? e)
              })
            }
          />
        </div>

        <div className="mt-auto flex items-center gap-3">
          <StageDots w={w} />
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

// ── Dialogs ───────────────────────────────────────────────────────────────

export function CreateDialog({
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
            <Select id="ws-lang" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
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

export function RenameDialog({
  target,
  onClose
}: {
  target: WorkspaceSummary | null;
  onClose: () => void;
}) {
  const update = useUpdateWorkspace();
  const [name, setName] = useState('');

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

export function DeleteDialog({
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
            “{target?.name}” and all its generated data will be permanently removed. This cannot be
            undone.
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

export { Plus };
