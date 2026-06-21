import { NavLink, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STAGE_TABS, type Stages } from '@/lib/types';

// Horizontal 5-step workflow nav (Script → Audio → Caption → Video → Upload).
export function Stepper({ stages }: { stages: Stages }) {
  const { id } = useParams();

  return (
    <nav className="flex w-full items-stretch gap-2 overflow-x-auto">
      {STAGE_TABS.map((t, i) => {
        const status = stages[t.key].status;
        const done = status === "completed";
        const failed = status === "failed";
        return (
          <NavLink
            key={t.key}
            to={`/w/${id}/${t.tab}`}
            className={({ isActive }) =>
              cn(
                "group flex min-w-[150px] flex-1 items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                isActive
                  ? "border-accent/50 bg-accent/10"
                  : "border-border bg-card hover:bg-muted",
              )
            }
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                done
                  ? "bg-accent text-accent-foreground"
                  : failed
                    ? "bg-destructive text-destructive-foreground"
                    : "border border-border bg-background text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">
                {t.label}
              </span>
              <span className="text-xs capitalize text-muted-foreground">
                {status.replace("_", " ")}
              </span>
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}