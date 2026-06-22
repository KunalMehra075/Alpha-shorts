import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { BarChart3, ChevronLeft, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { useProject, useProjects } from '@/lib/queries';
import type { Manifest } from '@/lib/types';

type Ctx = { project: Manifest; id: string };

export function useProjectCtx() {
  return useOutletContext<Ctx>();
}

export function ProjectLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: project, isLoading, isError } = useProject(id);
  const { data: all } = useProjects();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading project…
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </div>
    );
  }

  const langLabel =
    project.language === 'hi'
      ? 'Hindi'
      : project.language === 'bilingual'
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
                {project.name}
              </h1>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Switch project</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(all ?? []).map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => navigate(`/w/${w.id}/script`)}
                className={w.id === project.id ? 'bg-muted' : ''}
              >
                <span className="truncate">{w.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Badge variant="outline">{langLabel}</Badge>

        <NavLink
          to={`/w/${project.id}/analytics`}
          className={({ isActive }) =>
            cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'border-accent/50 bg-accent/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            )
          }
        >
          <BarChart3 className="size-4" /> Analytics
        </NavLink>
      </header>

      {/* Stepper */}
      <div className="px-6 py-4">
        <Stepper stages={project.stages} />
      </div>

      {/* Tab content */}
      <div className="min-w-0 flex-1 overflow-y-auto px-6 pb-10">
        <Outlet context={{ project, id: project.id } satisfies Ctx} />
      </div>
    </div>
  );
}
