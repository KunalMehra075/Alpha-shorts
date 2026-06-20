import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Stepper } from '@/components/Stepper';
import { useWorkspace, useWorkspaces } from '@/lib/queries';
import type { Manifest } from '@/lib/types';

type Ctx = { workspace: Manifest; id: string };

export function useWorkspaceCtx() {
  return useOutletContext<Ctx>();
}

export function WorkspaceLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: workspace, isLoading, isError } = useWorkspace(id);
  const { data: all } = useWorkspaces();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading workspace…
      </div>
    );
  }

  if (isError || !workspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Workspace not found.</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </div>
    );
  }

  const langLabel =
    workspace.language === 'hi'
      ? 'Hindi'
      : workspace.language === 'bilingual'
        ? 'Bilingual'
        : 'English';

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 pt-5">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} title="Home">
          <ChevronLeft className="size-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted">
              <h1 className="max-w-[40ch] truncate text-xl font-bold tracking-tight">
                {workspace.name}
              </h1>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(all ?? []).map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => navigate(`/w/${w.id}/script`)}
                className={w.id === workspace.id ? 'bg-muted' : ''}
              >
                <span className="truncate">{w.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Badge variant="outline">{langLabel}</Badge>
      </header>

      {/* Stepper */}
      <div className="px-6 py-4">
        <Stepper stages={workspace.stages} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <Outlet context={{ workspace, id: workspace.id } satisfies Ctx} />
      </div>
    </div>
  );
}
