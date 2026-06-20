import { StatusBadge } from '@/components/StatusBadge';
import type { StageStatus } from '@/lib/types';

export function TabHeader({
  icon: Icon,
  title,
  description,
  status,
  actions
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  status?: StageStatus;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {status && <StatusBadge status={status} />}
      </div>
    </div>
  );
}
